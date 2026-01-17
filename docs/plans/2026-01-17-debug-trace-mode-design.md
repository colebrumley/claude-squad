# Debug Trace Mode Design

## Overview

Add a `--debug` CLI flag that enables comprehensive tracing of orchestrator runs for post-run analysis. This captures prompts, agent responses, MCP tool calls, and decision-making logic to help identify issues in prompts or orchestration logic.

## Enabling Debug Mode

```bash
./bin/sq --spec <path> --debug
```

When enabled, the orchestrator captures all inputs, outputs, decisions, and flow events to structured JSON files.

## Output Structure

```
.sq/
├── state.db              # Existing state database
└── debug/
    └── <runId>/
        ├── trace.json    # Main trace file with events
        └── outputs/
            ├── enumerate-prompt.txt
            ├── enumerate-response.txt
            ├── plan-prompt.txt
            ├── plan-response.txt
            ├── build-loop-abc123-iter-1-prompt.txt
            ├── build-loop-abc123-iter-1-response.txt
            └── ...
```

The main `trace.json` contains structured events with references to the full outputs. This keeps the trace file navigable while preserving complete data.

## Trace File Format

```json
{
  "runId": "abc123",
  "specPath": "/path/to/spec.md",
  "effort": "medium",
  "startedAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:45:00Z",
  "events": [ /* ordered list of trace events */ ]
}
```

## Trace Event Types

### Phase Events

```json
{
  "type": "phase_start",
  "timestamp": "...",
  "phase": "enumerate",
  "inputState": { /* snapshot of relevant state */ }
}

{
  "type": "phase_complete",
  "timestamp": "...",
  "phase": "enumerate",
  "success": true,
  "costUsd": 0.05,
  "summary": "Created 8 tasks"
}
```

### Agent Interaction Events

```json
{
  "type": "agent_call",
  "timestamp": "...",
  "phase": "build",
  "loopId": "loop-abc",
  "iteration": 3,
  "promptFile": "outputs/build-loop-abc-iter-3-prompt.txt",
  "responseFile": "outputs/build-loop-abc-iter-3-response.txt",
  "costUsd": 0.02,
  "durationMs": 15000
}
```

### MCP Tool Call Events

```json
{
  "type": "mcp_tool_call",
  "timestamp": "...",
  "tool": "write_task",
  "input": { "id": "task-1", "title": "...", "dependencies": [] },
  "result": { "success": true }
}
```

### Decision Events

Captures stuck detection, review triggers, and revision planning:

```json
{
  "type": "decision",
  "timestamp": "...",
  "category": "stuck_detection",
  "loopId": "loop-abc",
  "input": { "sameErrorCount": 3, "threshold": 3 },
  "outcome": "loop_marked_stuck",
  "reason": "Repeated same error 3 times"
}
```

## Integration Points

| Event Type | Location | What to Capture |
|------------|----------|-----------------|
| `phase_start/complete` | `src/orchestrator/index.ts` | Phase transitions in main loop |
| `agent_call` | `src/orchestrator/phases/*.ts` | Before/after `query()` calls |
| `mcp_tool_call` | `src/mcp/server.ts` | Tool handler entry/exit |
| `decision` | `src/loops/stuck-detection.ts` | Stuck detection logic |
| `decision` | `src/orchestrator/index.ts` | Review trigger logic, revision decisions |
| `decision` | `src/orchestrator/phases/build.ts` | Loop completion/failure decisions |

## Debug Tracer Module

Create `src/debug/tracer.ts` that provides:

```typescript
interface DebugTracer {
  // Called at run start/end
  init(runId: string, specPath: string, effort: string): void;
  finalize(): Promise<void>;

  // Event logging
  logPhaseStart(phase: Phase, inputState: object): void;
  logPhaseComplete(phase: Phase, success: boolean, cost: number, summary: string): void;
  logAgentCall(opts: { phase, loopId?, iteration?, prompt, response, cost, duration }): void;
  logMcpToolCall(tool: string, input: object, result: object): void;
  logDecision(category: string, input: object, outcome: string, reason: string): void;
}
```

When `--debug` is not set, the tracer is a no-op (all methods do nothing). This avoids conditionals scattered throughout the codebase.

## Passing the Tracer

Add `tracer: DebugTracer` to `OrchestratorState` so it's accessible in all phases. The MCP server receives it via a new `--debug-socket` flag to report tool calls back.

## Implementation Plan

### New Files

- `src/debug/tracer.ts` - DebugTracer class and no-op implementation
- `src/debug/index.ts` - Exports and factory function

### Modified Files

| File | Changes |
|------|---------|
| `src/cli/index.ts` | Add `--debug` flag, create tracer, pass to orchestrator |
| `src/state/schema.ts` | Add `debug: boolean` to state schema |
| `src/orchestrator/index.ts` | Call `tracer.logPhaseStart/Complete`, `logDecision` for review triggers |
| `src/orchestrator/phases/enumerate.ts` | Wrap `query()` with `tracer.logAgentCall` |
| `src/orchestrator/phases/plan.ts` | Same |
| `src/orchestrator/phases/build.ts` | Same, plus loop-level tracing |
| `src/orchestrator/phases/review.ts` | Same |
| `src/orchestrator/phases/revise.ts` | Same |
| `src/orchestrator/phases/conflict.ts` | Same |
| `src/loops/stuck-detection.ts` | Call `tracer.logDecision` with detection logic |
| `src/mcp/server.ts` | Call `tracer.logMcpToolCall` in each tool handler |

### Output Writing Strategy

The tracer buffers events in memory and writes to `trace.json` incrementally (append after each phase) so partial traces exist if a run crashes. Large outputs (prompts/responses) are written immediately to the `outputs/` directory.

### Estimated Scope

~400 lines of new code, ~100 lines of modifications across existing files.

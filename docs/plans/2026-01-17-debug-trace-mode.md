# Debug Trace Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `--debug` CLI flag that captures comprehensive tracing to JSON files for post-run analysis.

**Architecture:** Create a DebugTracer class that logs events to `.sq/debug/<runId>/trace.json` with large outputs streamed to separate files. The tracer is passed through state and called at key points. When debug mode is off, a no-op tracer is used.

**Tech Stack:** Node.js fs/promises, Zod for event schemas, existing test patterns with node:test.

---

## Task 1: Create DebugTracer Types and Interfaces

**Files:**
- Create: `src/debug/types.ts`
- Test: `src/debug/tracer.test.ts`

**Step 1: Create the types file**

```typescript
// src/debug/types.ts
import type { Phase } from '../types/index.js';

export interface TraceEvent {
  type: string;
  timestamp: string;
}

export interface PhaseStartEvent extends TraceEvent {
  type: 'phase_start';
  phase: Phase;
  inputState: Record<string, unknown>;
}

export interface PhaseCompleteEvent extends TraceEvent {
  type: 'phase_complete';
  phase: Phase;
  success: boolean;
  costUsd: number;
  summary: string;
}

export interface AgentCallEvent extends TraceEvent {
  type: 'agent_call';
  phase: Phase;
  loopId?: string;
  iteration?: number;
  promptFile: string;
  responseFile: string;
  costUsd: number;
  durationMs: number;
}

export interface McpToolCallEvent extends TraceEvent {
  type: 'mcp_tool_call';
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface DecisionEvent extends TraceEvent {
  type: 'decision';
  category: string;
  loopId?: string;
  input: Record<string, unknown>;
  outcome: string;
  reason: string;
}

export type DebugEvent =
  | PhaseStartEvent
  | PhaseCompleteEvent
  | AgentCallEvent
  | McpToolCallEvent
  | DecisionEvent;

export interface TraceFile {
  runId: string;
  specPath: string;
  effort: string;
  startedAt: string;
  completedAt: string | null;
  events: DebugEvent[];
}

export interface DebugTracer {
  init(runId: string, specPath: string, effort: string): Promise<void>;
  finalize(): Promise<void>;
  logPhaseStart(phase: Phase, inputState: Record<string, unknown>): void;
  logPhaseComplete(phase: Phase, success: boolean, costUsd: number, summary: string): void;
  logAgentCall(opts: {
    phase: Phase;
    loopId?: string;
    iteration?: number;
    prompt: string;
    response: string;
    costUsd: number;
    durationMs: number;
  }): Promise<void>;
  logMcpToolCall(tool: string, input: Record<string, unknown>, result: Record<string, unknown>): void;
  logDecision(category: string, input: Record<string, unknown>, outcome: string, reason: string, loopId?: string): void;
}
```

**Step 2: Run typecheck to verify**

Run: `npm run typecheck`
Expected: PASS (new file with no imports from non-existent modules)

**Step 3: Commit**

```bash
git add src/debug/types.ts
git commit -m "feat(debug): add trace event types and DebugTracer interface"
```

---

## Task 2: Create NoopTracer Implementation

**Files:**
- Create: `src/debug/noop-tracer.ts`
- Test: `src/debug/tracer.test.ts`

**Step 1: Write failing test**

```typescript
// src/debug/tracer.test.ts
import assert from 'node:assert';
import { describe, test } from 'node:test';
import { createNoopTracer } from './noop-tracer.js';

describe('NoopTracer', () => {
  test('all methods are callable without error', async () => {
    const tracer = createNoopTracer();

    // Should not throw
    await tracer.init('run-1', '/spec.md', 'medium');
    tracer.logPhaseStart('enumerate', {});
    tracer.logPhaseComplete('enumerate', true, 0.01, 'done');
    await tracer.logAgentCall({
      phase: 'enumerate',
      prompt: 'test',
      response: 'test',
      costUsd: 0.01,
      durationMs: 1000,
    });
    tracer.logMcpToolCall('write_task', { id: '1' }, { success: true });
    tracer.logDecision('stuck_detection', {}, 'not_stuck', 'all good');
    await tracer.finalize();

    assert.ok(true, 'All methods completed without error');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/debug/tracer.test.ts`
Expected: FAIL with "Cannot find module './noop-tracer.js'"

**Step 3: Write implementation**

```typescript
// src/debug/noop-tracer.ts
import type { DebugTracer } from './types.js';
import type { Phase } from '../types/index.js';

class NoopTracer implements DebugTracer {
  async init(_runId: string, _specPath: string, _effort: string): Promise<void> {}
  async finalize(): Promise<void> {}
  logPhaseStart(_phase: Phase, _inputState: Record<string, unknown>): void {}
  logPhaseComplete(_phase: Phase, _success: boolean, _costUsd: number, _summary: string): void {}
  async logAgentCall(_opts: {
    phase: Phase;
    loopId?: string;
    iteration?: number;
    prompt: string;
    response: string;
    costUsd: number;
    durationMs: number;
  }): Promise<void> {}
  logMcpToolCall(_tool: string, _input: Record<string, unknown>, _result: Record<string, unknown>): void {}
  logDecision(_category: string, _input: Record<string, unknown>, _outcome: string, _reason: string, _loopId?: string): void {}
}

export function createNoopTracer(): DebugTracer {
  return new NoopTracer();
}
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/debug/tracer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/debug/noop-tracer.ts src/debug/tracer.test.ts
git commit -m "feat(debug): add NoopTracer implementation"
```

---

## Task 3: Create FileTracer Implementation

**Files:**
- Create: `src/debug/file-tracer.ts`
- Modify: `src/debug/tracer.test.ts`

**Step 1: Write failing test**

Add to `src/debug/tracer.test.ts`:

```typescript
import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFileTracer } from './file-tracer.js';

describe('FileTracer', () => {
  const testDir = join(process.cwd(), '.sq-test-debug');

  test('creates trace file on init', async () => {
    rmSync(testDir, { recursive: true, force: true });

    const tracer = createFileTracer(testDir);
    await tracer.init('run-123', '/path/to/spec.md', 'high');

    const traceDir = join(testDir, 'debug', 'run-123');
    assert.ok(existsSync(traceDir), 'Debug directory created');
    assert.ok(existsSync(join(traceDir, 'trace.json')), 'Trace file created');

    await tracer.finalize();
    rmSync(testDir, { recursive: true, force: true });
  });

  test('logs phase events to trace file', async () => {
    rmSync(testDir, { recursive: true, force: true });

    const tracer = createFileTracer(testDir);
    await tracer.init('run-456', '/spec.md', 'medium');

    tracer.logPhaseStart('enumerate', { tasks: [] });
    tracer.logPhaseComplete('enumerate', true, 0.05, 'Created 5 tasks');

    await tracer.finalize();

    const traceContent = await readFile(join(testDir, 'debug', 'run-456', 'trace.json'), 'utf-8');
    const trace = JSON.parse(traceContent);

    assert.strictEqual(trace.runId, 'run-456');
    assert.strictEqual(trace.events.length, 2);
    assert.strictEqual(trace.events[0].type, 'phase_start');
    assert.strictEqual(trace.events[1].type, 'phase_complete');

    rmSync(testDir, { recursive: true, force: true });
  });

  test('writes large outputs to separate files', async () => {
    rmSync(testDir, { recursive: true, force: true });

    const tracer = createFileTracer(testDir);
    await tracer.init('run-789', '/spec.md', 'low');

    const longPrompt = 'x'.repeat(10000);
    const longResponse = 'y'.repeat(10000);

    await tracer.logAgentCall({
      phase: 'enumerate',
      prompt: longPrompt,
      response: longResponse,
      costUsd: 0.02,
      durationMs: 5000,
    });

    await tracer.finalize();

    const outputsDir = join(testDir, 'debug', 'run-789', 'outputs');
    assert.ok(existsSync(outputsDir), 'Outputs directory created');

    const files = readdirSync(outputsDir);
    assert.ok(files.some(f => f.includes('prompt')), 'Prompt file created');
    assert.ok(files.some(f => f.includes('response')), 'Response file created');

    rmSync(testDir, { recursive: true, force: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/debug/tracer.test.ts`
Expected: FAIL with "Cannot find module './file-tracer.js'"

**Step 3: Write implementation**

```typescript
// src/debug/file-tracer.ts
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Phase } from '../types/index.js';
import type { DebugEvent, DebugTracer, TraceFile } from './types.js';

class FileTracer implements DebugTracer {
  private stateDir: string;
  private debugDir: string = '';
  private outputsDir: string = '';
  private trace: TraceFile | null = null;
  private outputCounter = 0;

  constructor(stateDir: string) {
    this.stateDir = stateDir;
  }

  async init(runId: string, specPath: string, effort: string): Promise<void> {
    this.debugDir = join(this.stateDir, 'debug', runId);
    this.outputsDir = join(this.debugDir, 'outputs');

    mkdirSync(this.debugDir, { recursive: true });
    mkdirSync(this.outputsDir, { recursive: true });

    this.trace = {
      runId,
      specPath,
      effort,
      startedAt: new Date().toISOString(),
      completedAt: null,
      events: [],
    };

    await this.saveTrace();
  }

  async finalize(): Promise<void> {
    if (this.trace) {
      this.trace.completedAt = new Date().toISOString();
      await this.saveTrace();
    }
  }

  logPhaseStart(phase: Phase, inputState: Record<string, unknown>): void {
    this.addEvent({
      type: 'phase_start',
      timestamp: new Date().toISOString(),
      phase,
      inputState,
    });
  }

  logPhaseComplete(phase: Phase, success: boolean, costUsd: number, summary: string): void {
    this.addEvent({
      type: 'phase_complete',
      timestamp: new Date().toISOString(),
      phase,
      success,
      costUsd,
      summary,
    });
  }

  async logAgentCall(opts: {
    phase: Phase;
    loopId?: string;
    iteration?: number;
    prompt: string;
    response: string;
    costUsd: number;
    durationMs: number;
  }): Promise<void> {
    this.outputCounter++;
    const prefix = opts.loopId
      ? `${opts.phase}-${opts.loopId.slice(0, 8)}-iter-${opts.iteration}`
      : opts.phase;

    const promptFile = `${prefix}-${this.outputCounter}-prompt.txt`;
    const responseFile = `${prefix}-${this.outputCounter}-response.txt`;

    await writeFile(join(this.outputsDir, promptFile), opts.prompt);
    await writeFile(join(this.outputsDir, responseFile), opts.response);

    this.addEvent({
      type: 'agent_call',
      timestamp: new Date().toISOString(),
      phase: opts.phase,
      loopId: opts.loopId,
      iteration: opts.iteration,
      promptFile: `outputs/${promptFile}`,
      responseFile: `outputs/${responseFile}`,
      costUsd: opts.costUsd,
      durationMs: opts.durationMs,
    });
  }

  logMcpToolCall(tool: string, input: Record<string, unknown>, result: Record<string, unknown>): void {
    this.addEvent({
      type: 'mcp_tool_call',
      timestamp: new Date().toISOString(),
      tool,
      input,
      result,
    });
  }

  logDecision(
    category: string,
    input: Record<string, unknown>,
    outcome: string,
    reason: string,
    loopId?: string
  ): void {
    this.addEvent({
      type: 'decision',
      timestamp: new Date().toISOString(),
      category,
      loopId,
      input,
      outcome,
      reason,
    });
  }

  private addEvent(event: DebugEvent): void {
    if (this.trace) {
      this.trace.events.push(event);
      // Fire and forget - save after each event for crash recovery
      this.saveTrace().catch(() => {});
    }
  }

  private async saveTrace(): Promise<void> {
    if (this.trace) {
      await writeFile(
        join(this.debugDir, 'trace.json'),
        JSON.stringify(this.trace, null, 2)
      );
    }
  }
}

export function createFileTracer(stateDir: string): DebugTracer {
  return new FileTracer(stateDir);
}
```

**Step 4: Update test imports**

Add to top of `src/debug/tracer.test.ts`:
```typescript
import { readdirSync } from 'node:fs';
```

**Step 5: Run test to verify it passes**

Run: `npx tsx --test src/debug/tracer.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/debug/file-tracer.ts src/debug/tracer.test.ts
git commit -m "feat(debug): add FileTracer implementation"
```

---

## Task 4: Create Debug Module Index with Factory

**Files:**
- Create: `src/debug/index.ts`

**Step 1: Create index file**

```typescript
// src/debug/index.ts
export type { DebugTracer, DebugEvent, TraceFile } from './types.js';
export { createNoopTracer } from './noop-tracer.js';
export { createFileTracer } from './file-tracer.js';

import type { DebugTracer } from './types.js';
import { createNoopTracer } from './noop-tracer.js';
import { createFileTracer } from './file-tracer.js';

export function createTracer(debug: boolean, stateDir: string): DebugTracer {
  return debug ? createFileTracer(stateDir) : createNoopTracer();
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/debug/index.ts
git commit -m "feat(debug): add module index with createTracer factory"
```

---

## Task 5: Add --debug Flag to CLI

**Files:**
- Modify: `src/cli.ts`

**Step 1: Add debug option**

Add this line after line 17 (before the semicolon ending the chain):

```typescript
    .option('--debug', 'Enable debug tracing to .sq/debug/<runId>/', false)
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): add --debug flag for trace mode"
```

---

## Task 6: Add Tracer to OrchestratorState

**Files:**
- Modify: `src/state/schema.ts`
- Modify: `src/types/index.ts` (if needed)

**Step 1: Check types/index.ts for OrchestratorState**

Read `src/types/index.ts` to see if OrchestratorState is re-exported or defined there.

**Step 2: Add debug field to schema**

In `src/state/schema.ts`, add after line 108 (`useWorktrees: z.boolean(),`):

```typescript
  debug: z.boolean(),
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: May fail initially if OrchestratorState type is inferred - check and fix.

**Step 4: Commit**

```bash
git add src/state/schema.ts
git commit -m "feat(state): add debug field to state schema"
```

---

## Task 7: Initialize Tracer in Main Entry Point

**Files:**
- Modify: `src/index.ts`
- Modify: `src/state/index.ts`

**Step 1: Import tracer in index.ts**

Add to imports at top of `src/index.ts`:

```typescript
import { createTracer, type DebugTracer } from './debug/index.js';
```

**Step 2: Create tracer after state initialization**

After line 99 (`saveRun(state);`), add:

```typescript
  // Initialize debug tracer
  const tracer = createTracer(opts.debug, stateDir);
  if (opts.debug) {
    await tracer.init(state.runId, specPath, state.effort);
    console.log(`Debug tracing enabled: ${stateDir}/debug/${state.runId}/`);
  }
```

**Step 3: Pass tracer to orchestrator**

Modify the `runOrchestrator` calls to pass tracer. This requires updating the function signature (Task 8).

For now, store tracer in a variable that will be used after Task 8.

**Step 4: Finalize tracer on completion**

Before `process.exit(exitCode);` (around line 202), add:

```typescript
  if (opts.debug) {
    await tracer.finalize();
  }
```

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(cli): initialize and finalize debug tracer"
```

---

## Task 8: Add Tracer to Orchestrator Callbacks

**Files:**
- Modify: `src/orchestrator/index.ts`

**Step 1: Update OrchestratorCallbacks interface**

Add tracer to the callbacks interface (after line 30):

```typescript
export interface OrchestratorCallbacks {
  onPhaseStart?: (phase: Phase) => void;
  onPhaseComplete?: (phase: Phase, success: boolean) => void;
  onOutput?: (text: string) => void;
  onLoopOutput?: (loopId: string, text: string) => void;
  tracer?: DebugTracer;
}
```

Add import at top:

```typescript
import type { DebugTracer } from '../debug/index.js';
```

**Step 2: Log phase events in runOrchestrator**

After line 55 (`callbacks.onPhaseStart?.(state.phase);`), add:

```typescript
  callbacks.tracer?.logPhaseStart(state.phase, {
    tasks: state.tasks.length,
    completedTasks: state.completedTasks.length,
    activeLoops: state.activeLoops.length,
    revisionCount: state.revisionCount,
  });
```

Before line 310 (`callbacks.onPhaseComplete?.(state.phase, true);`), add:

```typescript
    const phaseEntry = state.phaseHistory[state.phaseHistory.length - 1];
    if (phaseEntry) {
      callbacks.tracer?.logPhaseComplete(
        phaseEntry.phase,
        phaseEntry.success,
        phaseEntry.costUsd,
        phaseEntry.summary
      );
    }
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/orchestrator/index.ts
git commit -m "feat(orchestrator): add tracer to callbacks and log phase events"
```

---

## Task 9: Pass Tracer Through to Phases

**Files:**
- Modify: `src/index.ts`

**Step 1: Update all runOrchestrator calls to include tracer**

Find each `runOrchestrator(state, {` call and add `tracer,` to the callbacks object.

Example for the main loop (around line 167):

```typescript
    state = await runOrchestrator(state, {
      onPhaseStart: (phase) => console.log(`Starting phase: ${phase}`),
      onPhaseComplete: (phase, success) =>
        console.log(`Phase ${phase} ${success ? 'completed' : 'failed'}`),
      onOutput: (text) => process.stdout.write(text),
      onLoopOutput: (loopId, text) => console.log(`[${loopId.slice(0, 8)}] ${text}`),
      tracer,
    });
```

Do the same for the dry-run calls (around lines 110 and 124).

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(cli): pass tracer to orchestrator calls"
```

---

## Task 10: Add Agent Call Tracing to Enumerate Phase

**Files:**
- Modify: `src/orchestrator/phases/enumerate.ts`

**Step 1: Update function signature**

Change `executeEnumerate` to accept tracer:

```typescript
import type { DebugTracer } from '../../debug/index.js';

export async function executeEnumerate(
  state: OrchestratorState,
  onOutput?: (text: string) => void,
  tracer?: DebugTracer
): Promise<EnumerateResult> {
```

**Step 2: Capture prompt and time agent call**

Replace the query loop (lines 84-112) with:

```typescript
  const prompt = `${ENUMERATE_PROMPT_JSON}

## Spec File Content:
${specContent}`;

  let fullOutput = '';
  let costUsd = 0;
  const cwd = process.cwd();
  const startTime = Date.now();

  for await (const message of query({
    prompt,
    options: {
      cwd,
      allowedTools: config.allowedTools,
      maxTurns: config.maxTurns,
    },
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block) {
          fullOutput += block.text;
          onOutput?.(block.text);
        }
      }
    }
    if (message.type === 'result') {
      costUsd = (message as any).total_cost_usd || 0;
    }
  }

  const durationMs = Date.now() - startTime;

  await tracer?.logAgentCall({
    phase: 'enumerate',
    prompt,
    response: fullOutput,
    costUsd,
    durationMs,
  });

  return {
    tasks: parseEnumerateOutput(fullOutput),
    costUsd,
  };
```

**Step 3: Update orchestrator call**

In `src/orchestrator/index.ts`, update the enumerate case to pass tracer:

```typescript
      case 'enumerate': {
        const result = await executeEnumerate(state, callbacks.onOutput, callbacks.tracer);
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Run tests**

Run: `npx tsx --test src/orchestrator/phases/enumerate.test.ts`
Expected: PASS (tests don't require tracer)

**Step 6: Commit**

```bash
git add src/orchestrator/phases/enumerate.ts src/orchestrator/index.ts
git commit -m "feat(enumerate): add agent call tracing"
```

---

## Task 11: Add Agent Call Tracing to Plan Phase

**Files:**
- Modify: `src/orchestrator/phases/plan.ts`
- Modify: `src/orchestrator/index.ts`

Follow the same pattern as Task 10:
1. Add tracer parameter to `executePlan`
2. Capture startTime before query loop
3. Call `tracer?.logAgentCall()` after loop
4. Update orchestrator to pass tracer

**Step 1: Read plan.ts to understand structure**

**Step 2: Add tracing (same pattern as enumerate)**

**Step 3: Update orchestrator call**

**Step 4: Run typecheck and tests**

Run: `npm run typecheck && npx tsx --test src/orchestrator/phases/plan.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestrator/phases/plan.ts src/orchestrator/index.ts
git commit -m "feat(plan): add agent call tracing"
```

---

## Task 12: Add Agent Call Tracing to Build Phase

**Files:**
- Modify: `src/orchestrator/phases/build.ts`
- Modify: `src/orchestrator/index.ts`

Build phase is more complex - it has loops. The tracing should include loopId and iteration.

**Step 1: Read build.ts to understand loop structure**

**Step 2: Add tracer to executeBuildIteration**

Pass tracer through the function chain and call `logAgentCall` with loopId and iteration.

**Step 3: Update orchestrator to pass tracer**

**Step 4: Run typecheck and tests**

Run: `npm run typecheck && npx tsx --test src/orchestrator/phases/build.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestrator/phases/build.ts src/orchestrator/index.ts
git commit -m "feat(build): add agent call tracing with loop context"
```

---

## Task 13: Add Agent Call Tracing to Review Phase

**Files:**
- Modify: `src/orchestrator/phases/review.ts`
- Modify: `src/orchestrator/index.ts`

Follow same pattern as Task 10.

**Step 1-5: Same as enumerate**

**Commit:**

```bash
git add src/orchestrator/phases/review.ts src/orchestrator/index.ts
git commit -m "feat(review): add agent call tracing"
```

---

## Task 14: Add Agent Call Tracing to Revise Phase

**Files:**
- Modify: `src/orchestrator/phases/revise.ts`
- Modify: `src/orchestrator/index.ts`

Follow same pattern as Task 10.

**Commit:**

```bash
git add src/orchestrator/phases/revise.ts src/orchestrator/index.ts
git commit -m "feat(revise): add agent call tracing"
```

---

## Task 15: Add Agent Call Tracing to Conflict Phase

**Files:**
- Modify: `src/orchestrator/phases/conflict.ts`
- Modify: `src/orchestrator/index.ts`

Follow same pattern as Task 10.

**Commit:**

```bash
git add src/orchestrator/phases/conflict.ts src/orchestrator/index.ts
git commit -m "feat(conflict): add agent call tracing"
```

---

## Task 16: Add Decision Tracing to Stuck Detection

**Files:**
- Modify: `src/loops/stuck-detection.ts`
- Modify: `src/orchestrator/phases/build.ts`

**Step 1: Add tracer parameter to detectStuck**

```typescript
import type { DebugTracer } from '../debug/index.js';

export function detectStuck(
  loop: LoopState,
  config: StuckConfig,
  tracer?: DebugTracer
): StuckResult | null {
```

**Step 2: Log decision at end of function**

Before returning result (or null), log the decision:

```typescript
  // Log the decision
  tracer?.logDecision(
    'stuck_detection',
    {
      iteration: loop.iteration,
      maxIterations: loop.maxIterations,
      sameErrorCount: stuckIndicators.sameErrorCount,
      noProgressCount: stuckIndicators.noProgressCount,
      threshold: config.stuckThreshold,
    },
    result ? result.reason : 'not_stuck',
    result ? result.details : 'Loop is progressing normally',
    loop.loopId
  );

  return result;
```

**Step 3: Update build.ts to pass tracer**

**Step 4: Update tests**

Run: `npx tsx --test src/loops/stuck-detection.test.ts`
Tests should still pass (tracer is optional).

**Step 5: Commit**

```bash
git add src/loops/stuck-detection.ts src/orchestrator/phases/build.ts
git commit -m "feat(stuck): add decision tracing to stuck detection"
```

---

## Task 17: Add Decision Tracing to Review Triggers

**Files:**
- Modify: `src/orchestrator/index.ts`

**Step 1: Add decision logging for review triggers**

In each case where `state.pendingReview = true` is set, add a decision log:

```typescript
        if (effortConfig.reviewAfterEnumerate) {
          callbacks.tracer?.logDecision(
            'review_trigger',
            { phase: 'enumerate', effortLevel: state.effort },
            'review_scheduled',
            'Effort config requires review after enumerate'
          );
          state.pendingReview = true;
          state.reviewType = 'enumerate';
          state.phase = 'review';
        }
```

Do the same for plan phase review trigger and build phase review/stuck triggers.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/orchestrator/index.ts
git commit -m "feat(orchestrator): add decision tracing for review triggers"
```

---

## Task 18: Add State Initialization for Debug Flag

**Files:**
- Modify: `src/state/index.ts`

**Step 1: Read state/index.ts to understand initializeState**

**Step 2: Add debug parameter to initializeState**

Add `debug: boolean` to the options and include it in the returned state.

**Step 3: Update index.ts to pass debug flag**

In `src/index.ts`, update the `initializeState` call:

```typescript
    state = initializeState({
      specPath,
      effort: opts.effort,
      stateDir,
      maxLoops: Number.parseInt(opts.maxLoops, 10),
      maxIterations: Number.parseInt(opts.maxIterations, 10),
      useWorktrees: !opts.noWorktrees,
      debug: opts.debug,
    });
```

**Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm run test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/state/index.ts src/index.ts
git commit -m "feat(state): add debug flag to state initialization"
```

---

## Task 19: Integration Test

**Files:**
- Create: `src/debug/integration.test.ts`

**Step 1: Write integration test**

```typescript
// src/debug/integration.test.ts
import assert from 'node:assert';
import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createFileTracer } from './file-tracer.js';
import type { TraceFile } from './types.js';

describe('Debug Tracing Integration', () => {
  const testDir = join(process.cwd(), '.sq-integration-test');

  test('full trace lifecycle', async () => {
    rmSync(testDir, { recursive: true, force: true });

    const tracer = createFileTracer(testDir);
    await tracer.init('integration-run', '/test/spec.md', 'high');

    // Simulate enumerate phase
    tracer.logPhaseStart('enumerate', { tasks: 0 });
    await tracer.logAgentCall({
      phase: 'enumerate',
      prompt: 'Enumerate tasks from spec...',
      response: '{"tasks": [{"id": "t1", "title": "Task 1"}]}',
      costUsd: 0.05,
      durationMs: 3000,
    });
    tracer.logPhaseComplete('enumerate', true, 0.05, 'Created 1 task');

    // Simulate plan phase
    tracer.logPhaseStart('plan', { tasks: 1 });
    tracer.logDecision('review_trigger', { phase: 'plan' }, 'review_scheduled', 'High effort');
    tracer.logPhaseComplete('plan', true, 0.03, 'Created 1 group');

    // Simulate MCP call
    tracer.logMcpToolCall('write_task', { id: 't1', title: 'Task 1' }, { success: true });

    await tracer.finalize();

    // Verify trace file
    const tracePath = join(testDir, 'debug', 'integration-run', 'trace.json');
    assert.ok(existsSync(tracePath), 'Trace file exists');

    const trace: TraceFile = JSON.parse(await readFile(tracePath, 'utf-8'));
    assert.strictEqual(trace.runId, 'integration-run');
    assert.strictEqual(trace.effort, 'high');
    assert.ok(trace.completedAt, 'Has completion timestamp');
    assert.strictEqual(trace.events.length, 6);

    // Verify outputs directory
    const outputsDir = join(testDir, 'debug', 'integration-run', 'outputs');
    assert.ok(existsSync(outputsDir), 'Outputs directory exists');

    rmSync(testDir, { recursive: true, force: true });
  });
});
```

**Step 2: Run integration test**

Run: `npx tsx --test src/debug/integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/debug/integration.test.ts
git commit -m "test(debug): add integration test for full trace lifecycle"
```

---

## Task 20: Run Full Test Suite and Fix Issues

**Step 1: Run all tests**

Run: `npm run test`

**Step 2: Fix any failures**

Address any test failures from the changes.

**Step 3: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: address test and lint issues from debug tracing"
```

---

## Summary

After completing all tasks, the debug mode will:

1. Be enabled via `--debug` CLI flag
2. Create `.sq/debug/<runId>/trace.json` with all events
3. Store full prompts/responses in `.sq/debug/<runId>/outputs/`
4. Capture phase transitions, agent calls, MCP tool calls, and decisions
5. Work with no-op tracer when disabled (zero overhead)

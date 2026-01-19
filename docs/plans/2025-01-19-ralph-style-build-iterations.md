# Ralph-Style Build Iterations

## Overview

Change the BUILD phase from long-running agent sessions to short, focused micro-iterations with scratchpad-based handoff between iterations. This keeps agents in their optimal cognitive zone and prevents context accumulation issues.

## Current vs New Model

**Current:**
```
Loop starts → Agent works freely → Eventually outputs TASK_COMPLETE
(Single long-running agent session, accumulating context)
```

**New (Ralph-style):**
```
Loop iteration 1 → Small change + test → Write scratchpad → ITERATION_DONE
Loop iteration 2 → Read scratchpad → Small change + test → Write scratchpad → ITERATION_DONE
...repeat...
Final iteration → Verify all tests pass → TASK_COMPLETE
```

Each iteration is a fresh agent invocation with:
- The task's acceptance criteria (constant)
- The scratchpad from previous iteration (what was done, what's next)
- Lightweight TDD guidance with Iron Law verification

## Exit Signals

| Signal | Meaning | Action |
|--------|---------|--------|
| `ITERATION_DONE` | Made progress, more work needed | Increment iteration, continue loop |
| `TASK_COMPLETE` | Acceptance criteria met (with test evidence) | Run per-loop review, then complete |
| `TASK_STUCK` | Blocked, needs intervention | Mark loop stuck |

## New BUILD_PROMPT

```markdown
# BUILD ITERATION

## The Iron Law: Verification Before Completion

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE**

Before outputting TASK_COMPLETE, you MUST:
1. Run the full test suite (not just "it should pass")
2. See the actual output showing tests pass
3. Verify the exit code is 0

If you haven't run verification in this iteration, you cannot claim completion.

| Thought | Reality |
|---------|---------|
| "Should work now" | RUN the tests |
| "I'm confident" | Confidence ≠ evidence |
| "Just this small change" | Small changes break things |
| "Linter passed" | Linter ≠ tests |
| "Similar code works" | Run YOUR code |

## Task
{{task.title}}
{{task.description}}

## Scratchpad (from previous iteration)
{{scratchpad OR "First iteration - no previous work"}}

## How to Work
1. Read the scratchpad to understand current state
2. Make ONE small change (create a file, add a function, fix a failing test)
3. Run tests to verify your change
4. Update the scratchpad with what you did and what's next

Write/run a failing test before implementing new functionality.
If stuck after 2-3 attempts at the same problem, output TASK_STUCK.

## Scratchpad Format
When done, use `write_scratchpad` tool with:
- **Done this iteration**: What you changed
- **Test status**: Pass/fail with key output
- **Next step**: What the next iteration should do
- **Blockers**: Any issues (or "none")

## Exit
- Made progress, more to do → ITERATION_DONE
- All acceptance criteria met (WITH TEST EVIDENCE) → TASK_COMPLETE
- Blocked → TASK_STUCK: <reason>
```

## Implementation Changes

### 1. New MCP Tool: `write_scratchpad`

**Location:** `src/mcp/tools/write-scratchpad.ts`

**Schema:**
```typescript
{
  name: "write_scratchpad",
  description: "Write iteration scratchpad for handoff to next iteration",
  inputSchema: {
    type: "object",
    properties: {
      done: {
        type: "string",
        description: "What you completed this iteration"
      },
      testStatus: {
        type: "string",
        description: "Test results (pass/fail + key output)"
      },
      nextStep: {
        type: "string",
        description: "What the next iteration should do"
      },
      blockers: {
        type: "string",
        description: "Any blockers, or 'none'"
      }
    },
    required: ["done", "testStatus", "nextStep", "blockers"]
  }
}
```

**Behavior:**
- Writes markdown file to scratchpad location
- Format:
  ```markdown
  # Iteration {{n}} Scratchpad

  ## Done this iteration
  {{done}}

  ## Test status
  {{testStatus}}

  ## Next step
  {{nextStep}}

  ## Blockers
  {{blockers}}
  ```

### 2. Scratchpad Location

| Mode | Path |
|------|------|
| With worktrees | `<worktreePath>/.sq-scratchpad.md` |
| Without worktrees | `.sq/scratchpads/<loopId>.md` |

The MCP tool needs access to the worktree path, passed via environment or tool context.

### 3. Changes to `src/orchestrator/phases/build.ts`

**Add scratchpad reading:**
```typescript
async function readScratchpad(loopCwd: string, loopId: string, stateDir: string): Promise<string | null> {
  // Try worktree location first
  const worktreePath = join(loopCwd, '.sq-scratchpad.md');
  if (await fileExists(worktreePath)) {
    return await readFile(worktreePath, 'utf-8');
  }

  // Fall back to state dir
  const statePath = join(stateDir, 'scratchpads', `${loopId}.md`);
  if (await fileExists(statePath)) {
    return await readFile(statePath, 'utf-8');
  }

  return null;
}
```

**Update `buildPromptWithFeedback` → `buildIterationPrompt`:**
```typescript
export function buildIterationPrompt(
  task: Task,
  scratchpad: string | null,
  iteration: number,
  maxIterations: number
): string {
  let prompt = BUILD_PROMPT; // New Ralph-style prompt

  prompt += `\n\n## Task\nID: ${task.id}\nTitle: ${task.title}\nDescription: ${task.description}`;
  prompt += `\n\n## Iteration: ${iteration}/${maxIterations}`;
  prompt += `\n\n## Scratchpad (from previous iteration)\n`;
  prompt += scratchpad || "First iteration - no previous work";

  return prompt;
}
```

**Handle ITERATION_DONE signal:**
```typescript
// In the iteration result handling
if (output.includes('ITERATION_DONE')) {
  loopManager.incrementIteration(loop.loopId);
  updateStuckIndicators(loop, null, filesChanged);
  return {
    loopId: loop.loopId,
    taskId: task.id,
    completed: false,
    madeProgress: true,
    costUsd
  };
}

// Existing TASK_COMPLETE handling stays the same (triggers per-loop review)
if (output.includes('TASK_COMPLETE')) {
  // ... existing review logic ...
}
```

### 4. Changes to `src/agents/prompts.ts`

Replace `BUILD_PROMPT` with the new Ralph-style prompt (see above).

### 5. MCP Server Changes

**Pass worktree path to MCP server:**

The MCP server needs to know where to write the scratchpad. Options:
1. Pass as environment variable when spawning
2. Include in the MCP server args (already has `runId` and `dbPath`)
3. Store in DB and look up by loopId

Recommended: Add `loopId` to MCP server args, look up worktree path from DB.

**Update spawn in build.ts:**
```typescript
mcpServers: {
  'sq-db': {
    command: 'node',
    args: [MCP_SERVER_PATH, state.runId, dbPath, loop.loopId], // Add loopId
  },
},
```

## Migration Notes

- Existing runs in progress will see the new prompt on next iteration
- No DB schema changes required
- Scratchpad files are ephemeral (deleted on loop completion or can be kept for debugging)

## Testing Plan

1. Unit test `readScratchpad` function
2. Unit test `buildIterationPrompt` with/without scratchpad
3. Integration test: verify ITERATION_DONE increments iteration without completing
4. Integration test: verify scratchpad is written and read between iterations
5. E2E test: run a small spec and verify micro-iteration behavior

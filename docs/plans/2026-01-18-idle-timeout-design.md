# Idle Timeout Detection for Build Loops

## Problem

When an agent hangs during execution (API timeout, network issue, process death), the orchestrator waits indefinitely. The existing stuck detection only runs between iterations, not during them. Users see the build appear frozen with no indication of what's wrong.

## Solution

Add idle timeout detection that monitors agent output during execution. If no output is received for 5 minutes, mark the loop as stuck and transition to revise phase.

## Design

### Data Model

Add `lastActivityAt` to the `StuckIndicators` interface in `src/types/index.ts`:

```typescript
export interface StuckIndicators {
  sameErrorCount: number;
  noProgressCount: number;
  lastError: string | null;
  lastFileChangeIteration: number;
  lastActivityAt: number;  // Unix timestamp (ms) of last output received
}
```

Add `last_activity_at INTEGER` column to `loops` table in SQLite schema.

### Idle Monitor

New file `src/loops/idle-timeout.ts`:

```typescript
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class IdleTimeoutError extends Error {
  constructor(idleMs: number) {
    super(`Agent idle for ${Math.round(idleMs / 1000)}s - no output received`);
    this.name = 'IdleTimeoutError';
  }
}

export function createIdleMonitor() {
  let lastActivityAt = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;
  let rejectFn: ((err: Error) => void) | null = null;

  const promise = new Promise<never>((_, reject) => {
    rejectFn = reject;
    const check = () => {
      const idleMs = Date.now() - lastActivityAt;
      if (idleMs >= IDLE_TIMEOUT_MS) {
        reject(new IdleTimeoutError(idleMs));
      } else {
        timeoutId = setTimeout(check, 30_000); // Check every 30s
      }
    };
    timeoutId = setTimeout(check, 30_000);
  });

  return {
    promise,
    recordActivity: () => { lastActivityAt = Date.now(); },
    cancel: () => { if (timeoutId) clearTimeout(timeoutId); },
  };
}
```

### Build Phase Integration

In `src/orchestrator/phases/build.ts`, wrap the query loop:

```typescript
const idleMonitor = createIdleMonitor();
try {
  for await (const message of query({ ... })) {
    idleMonitor.recordActivity();
    loopManager.updateLastActivity(loop.loopId);
    // ... existing output handling
  }
} catch (e) {
  if (e instanceof IdleTimeoutError) {
    loopManager.updateLoopStatus(loop.loopId, 'stuck');
    loop.stuckIndicators.lastError = e.message;
    return { loopId: loop.loopId, taskId: task.id, completed: false, costUsd, idleTimeout: true };
  }
  throw e;
} finally {
  idleMonitor.cancel();
}
```

### LoopManager

Add method to `src/loops/manager.ts`:

```typescript
updateLastActivity(loopId: string): void {
  const loop = this.loops.get(loopId);
  if (loop) {
    loop.stuckIndicators.lastActivityAt = Date.now();
  }
}
```

Initialize `lastActivityAt: Date.now()` in `createLoop()`.

### Stuck Detection

Add to `StuckReason` enum in `src/loops/stuck-detection.ts`:

```typescript
export enum StuckReason {
  REPEATED_ERROR = 'repeated_error',
  NO_PROGRESS = 'no_progress',
  MAX_ITERATIONS = 'max_iterations',
  IDLE_TIMEOUT = 'idle_timeout',
}
```

### Build Result

Update `BuildResult` interface:

```typescript
export interface BuildResult {
  // ... existing fields
  idleTimeout?: boolean;
}
```

Set `stuck: true` when any loop has `idleTimeout: true`.

### TUI Display

Show last activity time for running loops:

```
Loop 371f4055 [running] task-0: Initialize project
  Iteration 1/20 | Last activity: 2m ago
```

Highlight in yellow/orange when idle time exceeds ~3 minutes.

## Behavior

1. Loop starts, `lastActivityAt` set to current time
2. Each output chunk updates `lastActivityAt`
3. Background timer checks every 30s if idle time >= 5 minutes
4. If timeout triggers:
   - `IdleTimeoutError` thrown
   - Loop marked as `stuck`
   - `lastError` set to timeout message
   - Build result signals `idleTimeout: true`
5. Orchestrator sees `stuck: true`, transitions to revise phase
6. Revise phase analyzes the timeout and can retry or adjust approach

## Files Changed

- `src/types/index.ts` - Add `lastActivityAt` to `StuckIndicators`
- `src/db/schema.ts` - Add column to loops table
- `src/loops/idle-timeout.ts` - New file
- `src/loops/manager.ts` - Add `updateLastActivity()`, init timestamp
- `src/loops/stuck-detection.ts` - Add `IDLE_TIMEOUT` reason
- `src/orchestrator/phases/build.ts` - Wrap query with idle monitor
- `src/tui/*.tsx` - Display last activity time

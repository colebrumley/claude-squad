const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class IdleTimeoutError extends Error {
  public readonly idleMs: number;

  constructor(idleMs: number) {
    super(`Agent idle for ${Math.round(idleMs / 1000)}s - no output received`);
    this.name = 'IdleTimeoutError';
    this.idleMs = idleMs;
  }
}

export interface IdleMonitor {
  /** Promise that rejects with IdleTimeoutError if idle timeout is reached */
  promise: Promise<never>;
  /** Call this whenever activity is detected (output received, etc.) */
  recordActivity: () => void;
  /** Cancel the monitor (call in finally block) */
  cancel: () => void;
}

/**
 * Creates an idle monitor that tracks activity and rejects if no activity
 * is recorded within the timeout period.
 *
 * Uses a resetting timeout approach: a single timeout is set for the full
 * idle duration, and each call to recordActivity() clears and restarts it.
 * This eliminates race conditions from polling and ensures the timeout
 * fires exactly when the idle period is reached.
 *
 * Usage:
 * ```
 * const monitor = createIdleMonitor();
 * try {
 *   for await (const message of query(...)) {
 *     monitor.recordActivity();
 *     // handle message
 *   }
 * } catch (e) {
 *   if (e instanceof IdleTimeoutError) {
 *     // handle timeout
 *   }
 *   throw e;
 * } finally {
 *   monitor.cancel();
 * }
 * ```
 */
export function createIdleMonitor(): IdleMonitor {
  let lastActivityAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let rejectFn: ((error: IdleTimeoutError) => void) | null = null;

  const scheduleTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      const idleMs = Date.now() - lastActivityAt;
      rejectFn?.(new IdleTimeoutError(idleMs));
    }, IDLE_TIMEOUT_MS);
  };

  const promise = new Promise<never>((_, reject) => {
    rejectFn = reject;
    scheduleTimeout();
  });

  return {
    promise,
    recordActivity: () => {
      lastActivityAt = Date.now();
      scheduleTimeout();
    },
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      rejectFn = null;
    },
  };
}

import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { IdleTimeoutError, createIdleMonitor } from './idle-timeout.js';

// Helper to flush the microtask queue (let Promise callbacks run)
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('createIdleMonitor', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('rejects with IdleTimeoutError after idle period', async () => {
    const monitor = createIdleMonitor();
    let rejected = false;
    let error: IdleTimeoutError | null = null;

    monitor.promise.catch((e) => {
      rejected = true;
      error = e;
    });

    // Advance time just under the 5 minute idle timeout
    mock.timers.tick(5 * 60 * 1000 - 1);
    await flushMicrotasks();
    assert.strictEqual(rejected, false, 'Should not reject before timeout');

    // Advance 1ms more to hit the timeout
    mock.timers.tick(1);
    await flushMicrotasks();
    assert.strictEqual(rejected, true, 'Should reject after timeout');
    assert.ok(error instanceof IdleTimeoutError);
    assert.ok(error!.idleMs >= 5 * 60 * 1000);

    monitor.cancel();
  });

  it('resets timeout when recordActivity is called', async () => {
    const monitor = createIdleMonitor();
    let rejected = false;

    monitor.promise.catch(() => {
      rejected = true;
    });

    // Advance 4 minutes (close to timeout but not over)
    mock.timers.tick(4 * 60 * 1000);
    await flushMicrotasks();
    assert.strictEqual(rejected, false);

    // Record activity - should reset the timeout
    monitor.recordActivity();

    // Advance another 4 minutes (would be 8 total, but timer was reset)
    mock.timers.tick(4 * 60 * 1000);
    await flushMicrotasks();
    assert.strictEqual(rejected, false, 'Should not reject - timer was reset');

    // Advance 1 more minute to hit the new timeout (5 minutes after reset)
    mock.timers.tick(1 * 60 * 1000);
    await flushMicrotasks();
    assert.strictEqual(rejected, true, 'Should reject 5 minutes after last activity');

    monitor.cancel();
  });

  it('does not reject when cancelled before timeout', async () => {
    const monitor = createIdleMonitor();
    let rejected = false;

    monitor.promise.catch(() => {
      rejected = true;
    });

    // Cancel before timeout
    monitor.cancel();

    // Advance time well past the timeout
    mock.timers.tick(10 * 60 * 1000);
    await flushMicrotasks();

    assert.strictEqual(rejected, false, 'Should not reject after cancellation');
  });

  it('handles multiple rapid activity calls', async () => {
    const monitor = createIdleMonitor();
    let rejected = false;

    monitor.promise.catch(() => {
      rejected = true;
    });

    // Simulate rapid activity (like streaming output)
    for (let i = 0; i < 100; i++) {
      mock.timers.tick(100); // 100ms between activities
      monitor.recordActivity();
    }
    await flushMicrotasks();

    // Total time: 10 seconds, timeout keeps resetting
    assert.strictEqual(rejected, false, 'Should not reject during active period');

    // Now stop activity and wait for timeout
    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();
    assert.strictEqual(rejected, true, 'Should reject after activity stops');

    monitor.cancel();
  });

  it('reports accurate idle time in error', async () => {
    const monitor = createIdleMonitor();
    let error: IdleTimeoutError | null = null;

    monitor.promise.catch((e) => {
      error = e;
    });

    // Advance exactly 5 minutes
    mock.timers.tick(5 * 60 * 1000);
    await flushMicrotasks();

    assert.ok(error instanceof IdleTimeoutError);
    // Should be close to 5 minutes (300000ms)
    assert.ok(error!.idleMs >= 300000, `Expected idleMs >= 300000, got ${error!.idleMs}`);

    monitor.cancel();
  });

  it('IdleTimeoutError has correct message format', () => {
    const error = new IdleTimeoutError(300000);
    assert.strictEqual(error.name, 'IdleTimeoutError');
    assert.ok(error.message.includes('300s'));
    assert.ok(error.message.includes('no output received'));
  });
});

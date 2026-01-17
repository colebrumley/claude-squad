import { test, describe } from 'node:test';
import assert from 'node:assert';
import { LoopManager } from './manager.js';
import type { Task } from '../types/index.js';

describe('Loop Manager', () => {
  test('createLoop initializes loop with correct state', () => {
    const manager = new LoopManager({ maxLoops: 4, maxIterations: 20, reviewInterval: 5 });
    const tasks: Task[] = [
      { id: 't1', title: 'Task 1', description: '', status: 'pending', dependencies: [], estimatedIterations: 5, assignedLoopId: null }
    ];

    const loop = manager.createLoop(['t1'], tasks);

    assert.ok(loop.loopId);
    assert.deepStrictEqual(loop.taskIds, ['t1']);
    assert.strictEqual(loop.status, 'pending');
    assert.strictEqual(loop.iteration, 0);
  });

  test('canSpawnMore respects maxLoops', () => {
    const manager = new LoopManager({ maxLoops: 2, maxIterations: 20, reviewInterval: 5 });

    assert.strictEqual(manager.canSpawnMore(), true);
    manager.createLoop(['t1'], []);
    assert.strictEqual(manager.canSpawnMore(), true);
    manager.createLoop(['t2'], []);
    assert.strictEqual(manager.canSpawnMore(), false);
  });

  test('getActiveLoops returns only running loops', () => {
    const manager = new LoopManager({ maxLoops: 4, maxIterations: 20, reviewInterval: 5 });

    const loop1 = manager.createLoop(['t1'], []);
    const loop2 = manager.createLoop(['t2'], []);

    manager.updateLoopStatus(loop1.loopId, 'running');
    manager.updateLoopStatus(loop2.loopId, 'completed');

    const active = manager.getActiveLoops();
    assert.strictEqual(active.length, 1);
    assert.strictEqual(active[0].loopId, loop1.loopId);
  });
});

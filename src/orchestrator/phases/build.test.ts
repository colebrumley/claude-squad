import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getNextParallelGroup, canStartGroup } from './build.js';
import type { Task, TaskGraph } from '../../types/index.js';

describe('Build Phase', () => {
  const tasks: Task[] = [
    { id: 't1', title: 'Task 1', description: '', status: 'pending', dependencies: [], estimatedIterations: 5, assignedLoopId: null },
    { id: 't2', title: 'Task 2', description: '', status: 'pending', dependencies: [], estimatedIterations: 5, assignedLoopId: null },
    { id: 't3', title: 'Task 3', description: '', status: 'pending', dependencies: ['t1', 't2'], estimatedIterations: 5, assignedLoopId: null },
  ];

  const graph: TaskGraph = {
    tasks,
    parallelGroups: [['t1', 't2'], ['t3']],
  };

  test('getNextParallelGroup returns first incomplete group', () => {
    const completedTasks: string[] = [];
    const group = getNextParallelGroup(graph, completedTasks);

    assert.deepStrictEqual(group, ['t1', 't2']);
  });

  test('getNextParallelGroup returns second group when first complete', () => {
    const completedTasks = ['t1', 't2'];
    const group = getNextParallelGroup(graph, completedTasks);

    assert.deepStrictEqual(group, ['t3']);
  });

  test('getNextParallelGroup returns null when all complete', () => {
    const completedTasks = ['t1', 't2', 't3'];
    const group = getNextParallelGroup(graph, completedTasks);

    assert.strictEqual(group, null);
  });

  test('canStartGroup checks dependencies are met', () => {
    assert.strictEqual(canStartGroup(['t1', 't2'], [], tasks), true);
    assert.strictEqual(canStartGroup(['t3'], [], tasks), false);
    assert.strictEqual(canStartGroup(['t3'], ['t1', 't2'], tasks), true);
  });
});

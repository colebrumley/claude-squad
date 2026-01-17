import assert from 'node:assert';
import { describe, test } from 'node:test';
import { validateTaskGranularity } from './enumerate.js';

describe('Enumerate Phase', () => {
  // NOTE: Task creation now happens via MCP tools (write_task)
  // The loadTasksFromDB function reads from the database after agent runs
  // Integration tests should verify MCP tool usage

  // Risk #5 mitigation: Task granularity validation
  test('validateTaskGranularity warns on too-large tasks', () => {
    const tasks = [
      {
        id: 't1',
        title: 'Huge task',
        description: 'Everything that needs doing',
        status: 'pending' as const,
        dependencies: [],
        estimatedIterations: 50,
        assignedLoopId: null,
      },
    ];
    const result = validateTaskGranularity(tasks);
    assert.ok(result.warnings.some((w) => w.includes('too large')));
  });

  test('validateTaskGranularity warns on too-small tasks', () => {
    const tasks = [
      {
        id: 't1',
        title: 'Tiny',
        description: 'A very small task description',
        status: 'pending' as const,
        dependencies: [],
        estimatedIterations: 1,
        assignedLoopId: null,
      },
    ];
    const result = validateTaskGranularity(tasks);
    assert.ok(result.warnings.some((w) => w.includes('too small')));
  });

  test('validateTaskGranularity warns on short descriptions', () => {
    const tasks = [
      {
        id: 't1',
        title: 'Task',
        description: 'x',
        status: 'pending' as const,
        dependencies: [],
        estimatedIterations: 10,
        assignedLoopId: null,
      },
    ];
    const result = validateTaskGranularity(tasks);
    assert.ok(result.warnings.some((w) => w.includes('short description')));
  });

  test('validateTaskGranularity passes for well-sized tasks', () => {
    const tasks = [
      {
        id: 't1',
        title: 'Good task',
        description: 'A reasonably detailed task description',
        status: 'pending' as const,
        dependencies: [],
        estimatedIterations: 10,
        assignedLoopId: null,
      },
    ];
    const result = validateTaskGranularity(tasks);
    assert.strictEqual(result.warnings.length, 0);
    assert.strictEqual(result.valid, true);
  });
});

import assert from 'node:assert';
import { describe, test } from 'node:test';
import { buildTaskGraph } from './plan.js';

describe('Plan Phase', () => {
  // NOTE: Plan group creation now happens via MCP tools (add_plan_group)
  // The loadPlanGroupsFromDB function reads from the database after agent runs
  // Integration tests should verify MCP tool usage

  test('buildTaskGraph creates valid graph from tasks and groups', () => {
    const tasks = [
      {
        id: 'task-1',
        title: 'A',
        description: '',
        status: 'pending' as const,
        dependencies: [],
        estimatedIterations: 5,
        assignedLoopId: null,
      },
      {
        id: 'task-2',
        title: 'B',
        description: '',
        status: 'pending' as const,
        dependencies: [],
        estimatedIterations: 5,
        assignedLoopId: null,
      },
    ];
    const parallelGroups = [['task-1', 'task-2']];

    const graph = buildTaskGraph(tasks, parallelGroups);

    assert.strictEqual(graph.tasks.length, 2);
    assert.deepStrictEqual(graph.parallelGroups, parallelGroups);
  });
});

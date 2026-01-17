import { test, describe } from 'node:test';
import assert from 'node:assert';
import { initializeState } from './index.js';

describe('State Management', () => {
  test('initializeState creates valid initial state', async () => {
    const state = initializeState({
      specPath: '/path/to/spec.md',
      effort: 'medium',
      stateDir: '.c2',
      maxLoops: 4,
      maxIterations: 20,
      useWorktrees: false, // Disable for testing (may have uncommitted changes)
    });

    assert.strictEqual(state.phase, 'enumerate');
    assert.strictEqual(state.effort, 'medium');
    assert.ok(state.runId);
  });
});

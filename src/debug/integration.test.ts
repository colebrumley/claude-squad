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
    assert.strictEqual(trace.events.length, 7);

    // Verify outputs directory
    const outputsDir = join(testDir, 'debug', 'integration-run', 'outputs');
    assert.ok(existsSync(outputsDir), 'Outputs directory exists');

    rmSync(testDir, { recursive: true, force: true });
  });
});

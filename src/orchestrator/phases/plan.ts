import { join, resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { PLAN_PROMPT } from '../../agents/prompts.js';
import { createAgentConfig } from '../../agents/spawn.js';
import { getDatabase } from '../../db/index.js';
import type { DebugTracer } from '../../debug/index.js';
import type { OrchestratorState, Task, TaskGraph } from '../../types/index.js';

/**
 * Load plan groups from database after agent has written them via MCP tools.
 */
export function loadPlanGroupsFromDB(runId: string): string[][] {
  const db = getDatabase();
  const planGroupRows = db
    .prepare('SELECT * FROM plan_groups WHERE run_id = ? ORDER BY group_index')
    .all(runId) as Array<{ task_ids: string }>;

  return planGroupRows.map((row) => JSON.parse(row.task_ids) as string[]);
}

export function buildTaskGraph(tasks: Task[], parallelGroups: string[][]): TaskGraph {
  return {
    tasks,
    parallelGroups,
  };
}

export interface PlanResult {
  taskGraph: TaskGraph;
  costUsd: number;
}

export async function executePlan(
  state: OrchestratorState,
  onOutput?: (text: string) => void,
  tracer?: DebugTracer
): Promise<PlanResult> {
  const dbPath = join(state.stateDir, 'state.db');
  const cwd = process.cwd();
  const config = createAgentConfig('plan', cwd, state.runId, dbPath);

  const tasksJson = JSON.stringify(state.tasks, null, 2);
  const prompt = `${PLAN_PROMPT}

## Tasks to Plan:
${tasksJson}`;

  let fullOutput = '';
  let costUsd = 0;
  const startTime = Date.now();

  for await (const message of query({
    prompt,
    options: {
      cwd,
      allowedTools: config.allowedTools,
      maxTurns: config.maxTurns,
      mcpServers: {
        'sq-db': {
          command: 'node',
          args: [resolve(cwd, 'node_modules/.bin/sq-mcp'), state.runId, dbPath],
        },
      },
    },
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block) {
          fullOutput += block.text;
          onOutput?.(block.text);
        }
      }
    }
    if (message.type === 'result') {
      costUsd = (message as any).total_cost_usd || 0;
    }
  }

  const durationMs = Date.now() - startTime;

  await tracer?.logAgentCall({
    phase: 'plan',
    prompt,
    response: fullOutput,
    costUsd,
    durationMs,
  });

  // Plan groups are now in the database via MCP add_plan_group calls
  const parallelGroups = loadPlanGroupsFromDB(state.runId);

  return {
    taskGraph: buildTaskGraph(state.tasks, parallelGroups),
    costUsd,
  };
}

import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { CONFLICT_PROMPT } from '../../agents/prompts.js';
import { createAgentConfig } from '../../agents/spawn.js';
import { getEffortConfig, getModelId } from '../../config/effort.js';
import type { DebugTracer } from '../../debug/index.js';
import type { EffortLevel, Task } from '../../types/index.js';

export interface ConflictResult {
  resolved: boolean;
  error?: string;
  costUsd: number;
}

export async function resolveConflict(
  task: Task,
  conflictFiles: string[],
  repoDir: string,
  runId: string,
  stateDir: string,
  effort: EffortLevel,
  onOutput?: (text: string) => void,
  tracer?: DebugTracer
): Promise<ConflictResult> {
  const dbPath = join(stateDir, 'state.db');
  const effortConfig = getEffortConfig(effort);
  const model = getModelId(effortConfig.models.conflict);
  const config = createAgentConfig('conflict', repoDir, runId, dbPath, model);

  const prompt = CONFLICT_PROMPT.replace(
    '{{conflictFiles}}',
    conflictFiles.map((f) => `- ${f}`).join('\n')
  ).replace('{{taskDescription}}', `${task.title}: ${task.description}`);

  let output = '';
  let costUsd = 0;
  const startTime = Date.now();

  const writer = tracer?.startAgentCall({
    phase: 'conflict',
    prompt,
  });

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: repoDir,
        allowedTools: config.allowedTools,
        maxTurns: config.maxTurns,
        model: config.model,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block) {
            output += block.text;
            writer?.appendOutput(block.text);
            onOutput?.(block.text);
          }
        }
      }
      if (message.type === 'result') {
        costUsd = (message as any).total_cost_usd || 0;
      }
    }

    const durationMs = Date.now() - startTime;
    await writer?.complete(costUsd, durationMs);

    if (output.includes('CONFLICT_RESOLVED')) {
      return { resolved: true, costUsd };
    }

    const failMatch = output.match(/CONFLICT_FAILED:\s*(.+)/);
    return {
      resolved: false,
      error: failMatch?.[1] || 'Unknown conflict resolution failure',
      costUsd,
    };
  } catch (e) {
    return { resolved: false, error: String(e), costUsd };
  }
}

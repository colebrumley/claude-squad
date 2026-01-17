import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Task } from '../../types/index.js';
import { createAgentConfig } from '../../agents/spawn.js';
import { CONFLICT_PROMPT } from '../../agents/prompts.js';

export interface ConflictResult {
  resolved: boolean;
  error?: string;
}

export async function resolveConflict(
  task: Task,
  conflictFiles: string[],
  repoDir: string,
  onOutput?: (text: string) => void
): Promise<ConflictResult> {
  const config = createAgentConfig('conflict', repoDir);

  const prompt = CONFLICT_PROMPT
    .replace('{{conflictFiles}}', conflictFiles.map(f => `- ${f}`).join('\n'))
    .replace('{{taskDescription}}', `${task.title}: ${task.description}`);

  let output = '';

  try {
    for await (const message of query({
      prompt,
      options: {
        allowedTools: config.allowedTools,
        maxTurns: config.maxTurns,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block) {
            output += block.text;
            onOutput?.(block.text);
          }
        }
      }
    }

    if (output.includes('CONFLICT_RESOLVED')) {
      return { resolved: true };
    }

    const failMatch = output.match(/CONFLICT_FAILED:\s*(.+)/);
    return {
      resolved: false,
      error: failMatch?.[1] || 'Unknown conflict resolution failure',
    };
  } catch (e) {
    return { resolved: false, error: String(e) };
  }
}

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { OrchestratorState, ReviewType } from '../../types/index.js';
import { createAgentConfig } from '../../agents/spawn.js';
import type { EffortConfig } from '../../config/effort.js';

export interface ReviewResult {
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

export function parseReviewOutput(output: string): ReviewResult {
  const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    output.match(/(\{[\s\S]*"passed"[\s\S]*\})/);

  if (!jsonMatch) {
    // Default to failed if can't parse
    return { passed: false, issues: ['Failed to parse review output'], suggestions: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    return {
      passed: parsed.passed ?? false,
      issues: parsed.issues ?? [],
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    return { passed: false, issues: ['Failed to parse review JSON'], suggestions: [] };
  }
}

export function getReviewPrompt(depth: EffortConfig['reviewDepth']): string {
  const base = `You are a code reviewer. Evaluate the work done.

Output a JSON object:
{
  "passed": true/false,
  "issues": ["list of issues if any"],
  "suggestions": ["optional improvements"]
}`;

  switch (depth) {
    case 'shallow':
      return `${base}

Perform a basic review:
- Do tests pass?
- Are there obvious bugs?`;

    case 'standard':
      return `${base}

Perform a standard review:
- Do tests pass?
- Does the code match the plan?
- Are there bugs or edge cases?`;

    case 'deep':
      return `${base}

Perform a comprehensive review:
- Do tests pass?
- Does implementation match spec?
- Are edge cases handled?
- Is error handling adequate?
- Is the approach optimal?`;

    case 'comprehensive':
      return `${base}

Perform an exhaustive review:
- Do all tests pass?
- Full spec compliance check
- Security analysis
- Performance analysis
- Edge case coverage
- Code quality assessment
- Documentation completeness`;
  }
}

export async function executeReview(
  state: OrchestratorState,
  reviewType: ReviewType,
  depth: EffortConfig['reviewDepth'],
  onOutput?: (text: string) => void
): Promise<ReviewResult> {
  const config = createAgentConfig('review', process.cwd());

  let context = '';
  switch (reviewType) {
    case 'enumerate':
      context = `Review the enumerated tasks:\n${JSON.stringify(state.tasks, null, 2)}`;
      break;
    case 'plan':
      context = `Review the execution plan:\n${JSON.stringify(state.taskGraph, null, 2)}`;
      break;
    case 'build':
      context = `Review the completed work. Tasks completed: ${state.completedTasks.join(', ')}`;
      break;
  }

  const prompt = `${getReviewPrompt(depth)}

## Context:
${context}

## Spec:
File: ${state.specPath}`;

  let fullOutput = '';

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
          fullOutput += block.text;
          onOutput?.(block.text);
        }
      }
    }
  }

  return parseReviewOutput(fullOutput);
}

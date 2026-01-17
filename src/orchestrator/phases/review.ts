import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createAgentConfig } from '../../agents/spawn.js';
import type { EffortConfig } from '../../config/effort.js';
import { getDatabase } from '../../db/index.js';
import type { DebugTracer } from '../../debug/index.js';
import { MCP_SERVER_PATH } from '../../paths.js';
import type {
  OrchestratorState,
  ReviewIssue,
  ReviewIssueType,
  ReviewType,
} from '../../types/index.js';

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
  costUsd: number;
  interpretedIntent?: string;
  intentSatisfied?: boolean;
}

/**
 * Load review results from database after agent has written them via MCP set_review_result.
 */
export function loadReviewResultFromDB(runId: string): {
  passed: boolean;
  issues: ReviewIssue[];
  interpretedIntent?: string;
  intentSatisfied?: boolean;
} {
  const db = getDatabase();

  // Load review issues
  const issueRows = db.prepare('SELECT * FROM review_issues WHERE run_id = ?').all(runId) as Array<{
    task_id: string;
    file: string;
    line: number | null;
    type: ReviewIssueType;
    description: string;
    suggestion: string;
  }>;

  const issues: ReviewIssue[] = issueRows.map((row) => ({
    taskId: row.task_id,
    file: row.file,
    line: row.line ?? undefined,
    type: row.type,
    description: row.description,
    suggestion: row.suggestion,
  }));

  // Load intent analysis from runs table
  const run = db
    .prepare('SELECT interpreted_intent, intent_satisfied FROM runs WHERE id = ?')
    .get(runId) as
    | {
        interpreted_intent: string | null;
        intent_satisfied: number | null;
      }
    | undefined;

  const interpretedIntent = run?.interpreted_intent ?? undefined;
  const intentSatisfied = run?.intent_satisfied != null ? run.intent_satisfied === 1 : undefined;

  // Review passes only if no issues AND intent is satisfied
  // If intentSatisfied is undefined (not set), fall back to just checking issues
  const passed = issues.length === 0 && (intentSatisfied ?? true);

  return { passed, issues, interpretedIntent, intentSatisfied };
}

export function getReviewPrompt(depth: EffortConfig['reviewDepth']): string {
  const intentAnalysis = `
## Intent Analysis (Do This First)

Before examining implementation details, step back and consider the spec holistically:

1. **What was the user trying to accomplish?** Not just what they asked for literally, but what goal they're pursuing. A request to "add a login button" is really about enabling user authentication.

2. **What would a reasonable user expect?** Even if not stated, what adjacent requirements would be natural? Error messages, edge case handling, consistent UX patterns, etc.

3. **Does the implementation serve the goal?** Code can satisfy literal requirements while missing the point entirely. A login button that exists but is hidden, or works but has no error feedback, technically meets the spec but fails the user.

Write down your interpretation before reviewing code. This prevents rationalization.`;

  const mcpInstructions = `
## How to Report Results
Use the \`set_review_result\` MCP tool when you finish reviewing.

**Required fields:**
- \`interpretedIntent\`: In 1-2 sentences, what was the user actually trying to accomplish? What unstated expectations would be reasonable?
- \`intentSatisfied\`: Does the implementation serve this interpreted intent, not just the literal words?
- \`passed\`: Did the implementation pass technical review (tests, bugs, code quality)?
- \`issues\`: Array of specific issues found

**Important:** Both \`passed\` AND \`intentSatisfied\` must be true for the review to pass. Code that works but misses the point should fail.

For a passing review:
\`\`\`
set_review_result({
  interpretedIntent: "User wants to enable authentication so users can have persistent accounts and personalized experiences",
  intentSatisfied: true,
  passed: true,
  issues: []
})
\`\`\`

For a failing review (intent not satisfied):
\`\`\`
set_review_result({
  interpretedIntent: "User wants error messages to help users understand and fix problems",
  intentSatisfied: false,
  passed: true,
  issues: [
    {
      taskId: "task-5",
      file: "src/components/Form.tsx",
      line: 89,
      type: "spec-intent-mismatch",
      description: "Error messages are technical (e.g., 'VALIDATION_ERR_422') rather than user-friendly",
      suggestion: "Replace error codes with human-readable messages like 'Please enter a valid email address'"
    }
  ]
})
\`\`\`

Issue types: over-engineering, missing-error-handling, pattern-violation, dead-code, spec-intent-mismatch`;

  const qualityChecks = `
**Check for these quality issues:**
- Unnecessary abstractions: classes/functions used only once, premature generalization
- Missing error handling: unhandled promise rejections, unchecked file/network operations, no input validation at boundaries
- Pattern violations: code that doesn't match existing codebase conventions
- Dead code: unused imports, unreachable branches, commented-out code

For each issue, specify the file, line number, what's wrong, and how to fix it.`;

  switch (depth) {
    case 'shallow':
      return `# REVIEW PHASE

You are in the **REVIEW** phase. Evaluate the work done so far.
${intentAnalysis}
${mcpInstructions}

Perform a basic review:
- Do tests pass?
- Are there obvious bugs?

When done, output: REVIEW_COMPLETE`;

    case 'standard':
      return `# REVIEW PHASE

You are in the **REVIEW** phase. Evaluate the work done so far.
${intentAnalysis}
${mcpInstructions}
${qualityChecks}

Perform a standard review:
- Do tests pass?
- Does the code match the spec?
- Are there bugs or edge cases?

When done, output: REVIEW_COMPLETE`;

    case 'deep':
      return `# REVIEW PHASE

You are in the **REVIEW** phase. Evaluate the work done so far.
${intentAnalysis}
${mcpInstructions}
${qualityChecks}

Perform a comprehensive review:
- Do tests pass?
- Does implementation match spec?
- Are edge cases handled?
- Is error handling adequate?
- Is the approach optimal?

When done, output: REVIEW_COMPLETE`;

    case 'comprehensive':
      return `# REVIEW PHASE

You are in the **REVIEW** phase. Evaluate the work done so far.
${intentAnalysis}
${mcpInstructions}
${qualityChecks}

Perform an exhaustive review:
- Do all tests pass?
- Full spec compliance check
- Security analysis
- Performance analysis
- Edge case coverage
- Code quality assessment
- Documentation completeness

When done, output: REVIEW_COMPLETE`;
  }
}

export async function executeReview(
  state: OrchestratorState,
  reviewType: ReviewType,
  depth: EffortConfig['reviewDepth'],
  onOutput?: (text: string) => void,
  tracer?: DebugTracer
): Promise<ReviewResult> {
  const dbPath = join(state.stateDir, 'state.db');
  const cwd = process.cwd();
  const config = createAgentConfig('review', cwd, state.runId, dbPath);

  let context = '';
  switch (reviewType) {
    case 'enumerate':
      context = `Review the enumerated tasks:\n${JSON.stringify(state.tasks, null, 2)}`;
      break;
    case 'plan':
      context = `Review the execution plan:\n${JSON.stringify(state.taskGraph, null, 2)}`;
      break;
    case 'build': {
      const taskDetails = state.completedTasks
        .map((id) => {
          const task = state.tasks.find((t) => t.id === id);
          return task ? `- ${id}: ${task.title}\n  ${task.description}` : `- ${id}`;
        })
        .join('\n');
      context = `Review the completed work.\n\nCompleted tasks:\n${taskDetails}\n\nUse the Read and Glob tools to verify the implementation files exist and are correct.`;
      break;
    }
  }

  const prompt = `${getReviewPrompt(depth)}

## Context:
${context}

## Spec:
File: ${state.specPath}`;

  let fullOutput = '';
  let costUsd = 0;
  const startTime = Date.now();

  const writer = tracer?.startAgentCall({
    phase: 'review',
    prompt,
  });

  for await (const message of query({
    prompt,
    options: {
      cwd,
      allowedTools: config.allowedTools,
      maxTurns: config.maxTurns,
      mcpServers: {
        'sq-db': {
          command: 'node',
          args: [MCP_SERVER_PATH, state.runId, dbPath],
        },
      },
    },
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block) {
          fullOutput += block.text;
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

  // Review result is now in the database via MCP set_review_result call
  const { passed, issues, interpretedIntent, intentSatisfied } = loadReviewResultFromDB(
    state.runId
  );

  return {
    passed,
    issues,
    suggestions: [],
    costUsd,
    interpretedIntent,
    intentSatisfied,
  };
}

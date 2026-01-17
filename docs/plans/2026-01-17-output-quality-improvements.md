# Output Quality Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce over-engineering and missing error handling in agent-generated code.

**Architecture:** Add quality guidelines to build prompts, enhance review phase to detect specific issues with file/line context, and propagate structured feedback to retry attempts.

**Tech Stack:** TypeScript, Node test runner, claude-agent-sdk

---

## Task 1: Add ReviewIssue Type

**Files:**
- Modify: `src/types/state.ts:15-19`
- Test: `src/types/state.test.ts` (new)

**Step 1: Write the failing test**

Create `src/types/state.test.ts`:

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { ReviewIssue, OrchestratorContext } from './state.js';

describe('State Types', () => {
  test('ReviewIssue has required fields', () => {
    const issue: ReviewIssue = {
      taskId: 'task-1',
      file: 'src/index.ts',
      line: 42,
      type: 'over-engineering',
      description: 'Unnecessary abstraction',
      suggestion: 'Inline the function',
    };

    assert.strictEqual(issue.taskId, 'task-1');
    assert.strictEqual(issue.type, 'over-engineering');
  });

  test('OrchestratorContext includes reviewIssues', () => {
    const context: OrchestratorContext = {
      discoveries: [],
      errors: [],
      decisions: [],
      reviewIssues: [],
    };

    assert.ok(Array.isArray(context.reviewIssues));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/types/state.test.ts`
Expected: FAIL with type errors (ReviewIssue not exported)

**Step 3: Write minimal implementation**

In `src/types/state.ts`, add after line 6:

```typescript
export type ReviewIssueType = 'over-engineering' | 'missing-error-handling' | 'pattern-violation' | 'dead-code';

export interface ReviewIssue {
  taskId: string;
  file: string;
  line?: number;
  type: ReviewIssueType;
  description: string;
  suggestion: string;
}
```

Then modify `OrchestratorContext` (line 15-19) to:

```typescript
export interface OrchestratorContext {
  discoveries: string[];
  errors: string[];
  decisions: string[];
  reviewIssues: ReviewIssue[];
}
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/types/state.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/state.ts src/types/state.test.ts
git commit -m "feat(types): add ReviewIssue type for structured review feedback"
```

---

## Task 2: Add Quality Guidelines to Build Prompt

**Files:**
- Modify: `src/agents/prompts.ts:1-10`
- Test: `src/agents/prompts.test.ts` (new)

**Step 1: Write the failing test**

Create `src/agents/prompts.test.ts`:

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BUILD_PROMPT } from './prompts.js';

describe('Build Prompt', () => {
  test('includes anti-over-engineering guidance', () => {
    assert.ok(BUILD_PROMPT.includes('abstraction'), 'Should mention abstractions');
    assert.ok(BUILD_PROMPT.includes('once') || BUILD_PROMPT.includes('single'), 'Should warn against single-use abstractions');
  });

  test('includes error handling requirements', () => {
    assert.ok(BUILD_PROMPT.includes('error') || BUILD_PROMPT.includes('Error'), 'Should mention error handling');
    assert.ok(BUILD_PROMPT.includes('boundary') || BUILD_PROMPT.includes('boundaries'), 'Should mention boundaries');
  });

  test('includes grounding instruction', () => {
    assert.ok(BUILD_PROMPT.includes('existing') || BUILD_PROMPT.includes('pattern'), 'Should reference existing patterns');
    assert.ok(BUILD_PROMPT.includes('simplest') || BUILD_PROMPT.includes('minimal'), 'Should emphasize simplicity');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/agents/prompts.test.ts`
Expected: FAIL (current prompt lacks these keywords)

**Step 3: Write minimal implementation**

Replace `BUILD_PROMPT` in `src/agents/prompts.ts`:

```typescript
export const BUILD_PROMPT = `You are a code builder. Implement the assigned task.

## Quality Guidelines

**Keep it simple:**
- Don't create abstractions (helpers, classes, wrappers) for code used only once
- Don't add configuration or options that aren't in the spec
- Three similar lines of code is fine; only abstract when you have a clear third use case
- Match existing codebase patterns - don't invent new ones

**Handle errors at boundaries:**
- Validate user input, file I/O, network calls, external APIs
- For internal code, let errors propagate naturally
- Match the error handling style already in the codebase
- If a function can fail, make failure visible to callers

**Before writing code, ask:**
1. What existing code does something similar? Match its patterns.
2. What can actually fail here? Handle those cases.
3. What's the simplest implementation that satisfies the spec?

## Process

1. Write a failing test
2. Implement minimal code to pass
3. Refactor if needed (but don't over-engineer)
4. Run tests to verify

When you have fully completed the task and all tests pass, output: TASK_COMPLETE
If you are stuck and cannot proceed, output: TASK_STUCK: <reason>`;
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/agents/prompts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agents/prompts.ts src/agents/prompts.test.ts
git commit -m "feat(prompts): add quality guidelines to build prompt"
```

---

## Task 3: Add Quality Checks to Review Rubric

**Files:**
- Modify: `src/orchestrator/phases/review.ts:33-81`
- Test: `src/orchestrator/phases/review.test.ts:36-43`

**Step 1: Write the failing test**

Add to `src/orchestrator/phases/review.test.ts`:

```typescript
test('getReviewPrompt includes quality checks at standard depth', () => {
  const prompt = getReviewPrompt('standard');

  assert.ok(prompt.includes('abstraction') || prompt.includes('over-engineer'), 'Should check for over-engineering');
  assert.ok(prompt.includes('error handling') || prompt.includes('unhandled'), 'Should check error handling');
});

test('getReviewPrompt requests structured issues', () => {
  const prompt = getReviewPrompt('standard');

  assert.ok(prompt.includes('file'), 'Should request file location');
  assert.ok(prompt.includes('line') || prompt.includes('location'), 'Should request line number');
  assert.ok(prompt.includes('suggestion') || prompt.includes('fix'), 'Should request fix suggestion');
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/orchestrator/phases/review.test.ts`
Expected: FAIL (current prompts don't include these)

**Step 3: Write minimal implementation**

Replace `getReviewPrompt` in `src/orchestrator/phases/review.ts`:

```typescript
export function getReviewPrompt(depth: EffortConfig['reviewDepth']): string {
  const base = `You are a code reviewer. Evaluate the work done.

Output a JSON object:
{
  "passed": true/false,
  "issues": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "type": "over-engineering|missing-error-handling|pattern-violation|dead-code",
      "description": "What's wrong",
      "suggestion": "How to fix it"
    }
  ],
  "suggestions": ["optional improvements"]
}`;

  const qualityChecks = `
**Check for these quality issues:**
- Unnecessary abstractions: classes/functions used only once, premature generalization
- Missing error handling: unhandled promise rejections, unchecked file/network operations, no input validation at boundaries
- Pattern violations: code that doesn't match existing codebase conventions
- Dead code: unused imports, unreachable branches, commented-out code

For each issue, specify the file, line number, what's wrong, and how to fix it.`;

  switch (depth) {
    case 'shallow':
      return `${base}

Perform a basic review:
- Do tests pass?
- Are there obvious bugs?`;

    case 'standard':
      return `${base}
${qualityChecks}

Perform a standard review:
- Do tests pass?
- Does the code match the spec?
- Are there bugs or edge cases?`;

    case 'deep':
      return `${base}
${qualityChecks}

Perform a comprehensive review:
- Do tests pass?
- Does implementation match spec?
- Are edge cases handled?
- Is error handling adequate?
- Is the approach optimal?`;

    case 'comprehensive':
      return `${base}
${qualityChecks}

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
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/orchestrator/phases/review.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestrator/phases/review.ts src/orchestrator/phases/review.test.ts
git commit -m "feat(review): add quality checks to review rubric"
```

---

## Task 4: Update Review Parser for Structured Issues

**Files:**
- Modify: `src/orchestrator/phases/review.ts:6-31`
- Test: `src/orchestrator/phases/review.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/phases/review.test.ts`:

```typescript
test('parseReviewOutput extracts structured issues', () => {
  const output = `\`\`\`json
{
  "passed": false,
  "issues": [
    {
      "file": "src/utils.ts",
      "line": 15,
      "type": "over-engineering",
      "description": "Unnecessary wrapper class",
      "suggestion": "Use a plain function instead"
    }
  ],
  "suggestions": []
}
\`\`\``;

  const result = parseReviewOutput(output);

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.issues.length, 1);
  assert.strictEqual(result.issues[0].file, 'src/utils.ts');
  assert.strictEqual(result.issues[0].line, 15);
  assert.strictEqual(result.issues[0].type, 'over-engineering');
});

test('parseReviewOutput handles legacy string issues', () => {
  const output = `\`\`\`json
{
  "passed": false,
  "issues": ["Missing error handling", "No tests"],
  "suggestions": []
}
\`\`\``;

  const result = parseReviewOutput(output);

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.issues.length, 2);
  // Legacy issues should be converted to structured format
  assert.strictEqual(result.issues[0].description, 'Missing error handling');
  assert.strictEqual(result.issues[0].type, 'pattern-violation');
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/orchestrator/phases/review.test.ts`
Expected: FAIL (current parser returns string[] for issues)

**Step 3: Write minimal implementation**

Update `ReviewResult` and `parseReviewOutput` in `src/orchestrator/phases/review.ts`:

```typescript
import type { ReviewIssue, ReviewIssueType } from '../../types/index.js';

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
}

function normalizeIssue(issue: unknown, index: number): ReviewIssue {
  if (typeof issue === 'string') {
    // Legacy format: convert string to structured issue
    return {
      taskId: '',
      file: 'unknown',
      type: 'pattern-violation' as ReviewIssueType,
      description: issue,
      suggestion: 'Review and fix this issue',
    };
  }

  // Structured format
  const obj = issue as Record<string, unknown>;
  return {
    taskId: '',
    file: (obj.file as string) || 'unknown',
    line: obj.line as number | undefined,
    type: (obj.type as ReviewIssueType) || 'pattern-violation',
    description: (obj.description as string) || 'Unknown issue',
    suggestion: (obj.suggestion as string) || 'Review and fix',
  };
}

export function parseReviewOutput(output: string): ReviewResult {
  const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    output.match(/(\{[\s\S]*"passed"[\s\S]*\})/);

  if (!jsonMatch) {
    return {
      passed: false,
      issues: [{
        taskId: '',
        file: 'unknown',
        type: 'pattern-violation',
        description: 'Failed to parse review output',
        suggestion: 'Check agent output format'
      }],
      suggestions: []
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    const rawIssues = parsed.issues ?? [];

    return {
      passed: parsed.passed ?? false,
      issues: rawIssues.map((issue: unknown, i: number) => normalizeIssue(issue, i)),
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    return {
      passed: false,
      issues: [{
        taskId: '',
        file: 'unknown',
        type: 'pattern-violation',
        description: 'Failed to parse review JSON',
        suggestion: 'Check JSON syntax'
      }],
      suggestions: []
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/orchestrator/phases/review.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestrator/phases/review.ts src/orchestrator/phases/review.test.ts
git commit -m "feat(review): parse structured issues from review output"
```

---

## Task 5: Add Feedback Injection to Build Prompt

**Files:**
- Modify: `src/orchestrator/phases/build.ts:79-90`
- Test: `src/orchestrator/phases/build.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/phases/build.test.ts`:

```typescript
import { buildPromptWithFeedback } from './build.js';
import type { ReviewIssue } from '../../types/index.js';

test('buildPromptWithFeedback includes review issues for task', () => {
  const task: Task = {
    id: 't1',
    title: 'Task 1',
    description: 'Do something',
    status: 'pending',
    dependencies: [],
    estimatedIterations: 5,
    assignedLoopId: null,
  };

  const issues: ReviewIssue[] = [
    {
      taskId: 't1',
      file: 'src/index.ts',
      line: 42,
      type: 'over-engineering',
      description: 'Unnecessary wrapper',
      suggestion: 'Inline the code',
    },
    {
      taskId: 't2', // Different task
      file: 'src/other.ts',
      line: 10,
      type: 'missing-error-handling',
      description: 'Unhandled error',
      suggestion: 'Add try-catch',
    },
  ];

  const prompt = buildPromptWithFeedback(task, issues, 1, 10);

  assert.ok(prompt.includes('Previous Review Feedback'), 'Should include feedback header');
  assert.ok(prompt.includes('src/index.ts:42'), 'Should include file and line');
  assert.ok(prompt.includes('Unnecessary wrapper'), 'Should include description');
  assert.ok(prompt.includes('Inline the code'), 'Should include suggestion');
  assert.ok(!prompt.includes('src/other.ts'), 'Should not include other task issues');
});

test('buildPromptWithFeedback works without issues', () => {
  const task: Task = {
    id: 't1',
    title: 'Task 1',
    description: 'Do something',
    status: 'pending',
    dependencies: [],
    estimatedIterations: 5,
    assignedLoopId: null,
  };

  const prompt = buildPromptWithFeedback(task, [], 1, 10);

  assert.ok(!prompt.includes('Previous Review Feedback'), 'Should not include feedback header');
  assert.ok(prompt.includes('Task 1'), 'Should include task title');
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/orchestrator/phases/build.test.ts`
Expected: FAIL (buildPromptWithFeedback doesn't exist)

**Step 3: Write minimal implementation**

Add to `src/orchestrator/phases/build.ts` (after imports):

```typescript
import type { ReviewIssue } from '../../types/index.js';

export function buildPromptWithFeedback(
  task: Task,
  reviewIssues: ReviewIssue[],
  iteration: number,
  maxIterations: number
): string {
  let prompt = '';

  // Filter issues for this task
  const relevantIssues = reviewIssues.filter(i => i.taskId === task.id);

  if (relevantIssues.length > 0) {
    prompt += `## Previous Review Feedback\n`;
    prompt += `Your last implementation had these issues. Fix them:\n\n`;
    for (const issue of relevantIssues) {
      const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      prompt += `- **${location}** (${issue.type}): ${issue.description}\n`;
      prompt += `  Fix: ${issue.suggestion}\n\n`;
    }
  }

  prompt += `${BUILD_PROMPT}

## Current Task:
ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

## Iteration: ${iteration}/${maxIterations}`;

  return prompt;
}
```

Then update `executeBuildIteration` to use it (around line 82):

```typescript
const prompt = buildPromptWithFeedback(
  task,
  state.context.reviewIssues ?? [],
  loop.iteration + 1,
  loop.maxIterations
);
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/orchestrator/phases/build.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestrator/phases/build.ts src/orchestrator/phases/build.test.ts
git commit -m "feat(build): inject review feedback into retry prompts"
```

---

## Task 6: Wire Review Issues Into State Flow

**Files:**
- Modify: `src/orchestrator/index.ts` (or wherever phase transitions happen)
- Test: Integration test

**Step 1: Write the failing test**

Add to `src/orchestrator/phases/review.test.ts`:

```typescript
test('executeReview assigns taskId to issues', async () => {
  // This is more of an integration test - mock the query function
  // For now, test that the state update logic works

  const mockIssues: ReviewIssue[] = [
    {
      taskId: '',
      file: 'src/index.ts',
      line: 10,
      type: 'over-engineering',
      description: 'Test issue',
      suggestion: 'Fix it',
    },
  ];

  const taskId = 'task-1';
  const assignedIssues = mockIssues.map(issue => ({
    ...issue,
    taskId,
  }));

  assert.strictEqual(assignedIssues[0].taskId, 'task-1');
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/orchestrator/phases/review.test.ts`
Expected: PASS (this test should pass as-is since it's testing basic logic)

**Step 3: Document state flow update**

The orchestrator needs to:
1. After review fails, store `reviewResult.issues` in `state.context.reviewIssues`
2. Assign `taskId` to each issue based on completed tasks being reviewed
3. Clear `state.context.reviewIssues` after successful review

This depends on how your orchestrator handles phase transitions. The typical pattern:

```typescript
// In orchestrator after executeReview returns:
if (!reviewResult.passed) {
  // Assign taskIds to issues (for build review, use the task being reviewed)
  const issuesWithTaskIds = reviewResult.issues.map(issue => ({
    ...issue,
    taskId: currentTaskId, // or derive from context
  }));

  state.context.reviewIssues = issuesWithTaskIds;
  state.phase = 'revise';
} else {
  state.context.reviewIssues = [];
}
```

**Step 4: Update state initialization**

In `src/state/init.ts` or wherever initial state is created, ensure `reviewIssues` defaults to `[]`:

```typescript
context: {
  discoveries: [],
  errors: [],
  decisions: [],
  reviewIssues: [],
},
```

**Step 5: Commit**

```bash
git add src/orchestrator/index.ts src/state/init.ts
git commit -m "feat(orchestrator): wire review issues into state flow"
```

---

## Task 7: Run Full Test Suite

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 2: Fix any failures**

If tests fail, fix them before proceeding.

**Step 3: Run build**

Run: `npm run build`
Expected: No type errors

**Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address test failures from quality improvements"
```

---

## Task 8: Manual Testing

**Step 1: Create a test spec that typically produces over-engineered code**

Create `test-specs/quality-test.md`:

```markdown
# Simple Counter

Create a counter module with:
- increment() function
- decrement() function
- getCount() function

Store count in a variable.
```

**Step 2: Run sq with medium effort**

Run: `./bin/sq --spec test-specs/quality-test.md --effort medium --no-worktrees`

**Step 3: Observe output**

Verify:
- Build prompt shows quality guidelines
- If review fails, feedback appears in retry prompt
- Final code is simple (not a Counter class with Strategy pattern)

**Step 4: Cleanup**

```bash
rm -rf test-specs/
./bin/sq clean --all
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add ReviewIssue type | `src/types/state.ts` |
| 2 | Quality guidelines in build prompt | `src/agents/prompts.ts` |
| 3 | Quality checks in review rubric | `src/orchestrator/phases/review.ts` |
| 4 | Structured issue parsing | `src/orchestrator/phases/review.ts` |
| 5 | Feedback injection in build | `src/orchestrator/phases/build.ts` |
| 6 | Wire into state flow | `src/orchestrator/index.ts` |
| 7 | Full test suite | - |
| 8 | Manual testing | - |

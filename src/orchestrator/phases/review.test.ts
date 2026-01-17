import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseReviewOutput, getReviewPrompt } from './review.js';

describe('Review Phase', () => {
  test('parseReviewOutput extracts passed status', () => {
    const output = `\`\`\`json
{
  "passed": true,
  "issues": [],
  "suggestions": ["Consider adding more tests"]
}
\`\`\``;

    const result = parseReviewOutput(output);

    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.issues.length, 0);
  });

  test('parseReviewOutput extracts issues', () => {
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
  });

  test('getReviewPrompt varies by depth', () => {
    const shallow = getReviewPrompt('shallow');
    const deep = getReviewPrompt('deep');

    assert.ok(shallow.includes('basic'));
    assert.ok(deep.includes('comprehensive'));
  });

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
});

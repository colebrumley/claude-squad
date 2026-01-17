import assert from 'node:assert';
import { describe, test } from 'node:test';
import { getReviewPrompt } from './review.js';

describe('Review Phase', () => {
  // NOTE: Review result recording now happens via MCP tools (set_review_result)
  // The loadReviewResultFromDB function reads from the database after agent runs
  // Integration tests should verify MCP tool usage

  test('getReviewPrompt varies by depth for build reviews', () => {
    const shallow = getReviewPrompt('shallow', 'build');
    const deep = getReviewPrompt('deep', 'build');

    assert.ok(shallow.includes('basic'));
    assert.ok(deep.includes('comprehensive'));
  });

  test('getReviewPrompt includes quality checks at standard depth for build reviews', () => {
    const prompt = getReviewPrompt('standard', 'build');

    assert.ok(
      prompt.includes('abstraction') || prompt.includes('over-engineer'),
      'Should check for over-engineering'
    );
    assert.ok(
      prompt.includes('error handling') || prompt.includes('unhandled'),
      'Should check error handling'
    );
  });

  test('getReviewPrompt requests structured issues via MCP', () => {
    const prompt = getReviewPrompt('standard', 'build');

    assert.ok(prompt.includes('set_review_result'), 'Should instruct use of MCP tool');
    assert.ok(prompt.includes('file'), 'Should request file location');
    assert.ok(
      prompt.includes('suggestion') || prompt.includes('fix'),
      'Should request fix suggestion'
    );
  });

  test('getReviewPrompt generates plan-specific prompt for plan reviews', () => {
    const prompt = getReviewPrompt('standard', 'plan');

    assert.ok(prompt.includes('PLAN REVIEW'), 'Should identify as plan review');
    assert.ok(prompt.includes('execution plan'), 'Should reference execution plan');
    assert.ok(
      prompt.includes('dependency') || prompt.includes('dependencies'),
      'Should check dependencies'
    );
    assert.ok(prompt.includes('parallel'), 'Should check parallelization');
    // Plan review should NOT include code-specific checks
    assert.ok(!prompt.includes('tests pass'), 'Should not ask about tests');
    assert.ok(!prompt.includes('dead code'), 'Should not check for dead code');
  });

  test('getReviewPrompt generates enumerate-specific prompt for enumerate reviews', () => {
    const prompt = getReviewPrompt('standard', 'enumerate');

    assert.ok(prompt.includes('ENUMERATE REVIEW'), 'Should identify as enumerate review');
    assert.ok(prompt.includes('enumerated tasks'), 'Should reference enumerated tasks');
    assert.ok(
      prompt.includes('Missing tasks') || prompt.includes('requirements'),
      'Should check for missing tasks'
    );
    // Enumerate review should NOT include code-specific checks
    assert.ok(!prompt.includes('tests pass'), 'Should not ask about tests');
    assert.ok(!prompt.includes('dead code'), 'Should not check for dead code');
  });
});

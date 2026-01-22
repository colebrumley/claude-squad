import assert from 'node:assert';
import { describe, it, test } from 'node:test';
import { getEffortConfig, presetToEffortConfig } from './effort.js';
import type { PresetConfig } from './schema.js';

describe('Effort Configuration', () => {
  test('low effort has no intermediate reviews', () => {
    const config = getEffortConfig('low');
    assert.strictEqual(config.reviewAfterEnumerate, false);
    assert.strictEqual(config.reviewAfterPlan, false);
    assert.strictEqual(config.reviewInterval, 10);
  });

  test('medium effort reviews after plan', () => {
    const config = getEffortConfig('medium');
    assert.strictEqual(config.reviewAfterEnumerate, false);
    assert.strictEqual(config.reviewAfterPlan, true);
    assert.strictEqual(config.reviewInterval, 5);
  });

  test('high effort reviews after enumerate and plan', () => {
    const config = getEffortConfig('high');
    assert.strictEqual(config.reviewAfterEnumerate, true);
    assert.strictEqual(config.reviewAfterPlan, true);
    assert.strictEqual(config.reviewInterval, 3);
  });

  test('max effort reviews everything', () => {
    const config = getEffortConfig('max');
    assert.strictEqual(config.reviewAfterEnumerate, true);
    assert.strictEqual(config.reviewAfterPlan, true);
    assert.strictEqual(config.reviewInterval, 1);
  });
});

describe('presetToEffortConfig', () => {
  it('converts PresetConfig to EffortConfig', () => {
    const preset: PresetConfig = {
      reviews: {
        afterAnalyze: true,
        afterEnumerate: true,
        afterPlan: true,
        interval: 2,
        depth: 'deep',
        checkpointInterval: 3,
        maxRevisionAttempts: 4,
      },
      costs: {
        perLoop: 10,
        perPhase: 20,
        perRun: 100,
      },
      models: {
        analyze: 'opus',
        enumerate: 'sonnet',
        plan: 'opus',
        build: 'opus',
        review: 'opus',
        revise: 'sonnet',
        conflict: 'opus',
      },
      stuck: {
        threshold: 3,
        maxRevisions: 5,
      },
    };

    const config = presetToEffortConfig(preset);

    // Review settings
    assert.strictEqual(config.reviewAfterAnalyze, true);
    assert.strictEqual(config.reviewAfterEnumerate, true);
    assert.strictEqual(config.reviewAfterPlan, true);
    assert.strictEqual(config.reviewInterval, 2);
    assert.strictEqual(config.reviewDepth, 'deep');
    assert.strictEqual(config.checkpointReviewInterval, 3);
    assert.strictEqual(config.maxRevisionAttempts, 4);

    // Cost limits
    assert.strictEqual(config.costLimits.perLoopMaxUsd, 10);
    assert.strictEqual(config.costLimits.perPhaseMaxUsd, 20);
    assert.strictEqual(config.costLimits.perRunMaxUsd, 100);

    // Models
    assert.strictEqual(config.models.analyze, 'opus');
    assert.strictEqual(config.models.enumerate, 'sonnet');
    assert.strictEqual(config.models.plan, 'opus');
    assert.strictEqual(config.models.build, 'opus');
    assert.strictEqual(config.models.review, 'opus');
    assert.strictEqual(config.models.revise, 'sonnet');
    assert.strictEqual(config.models.conflict, 'opus');

    // Stuck settings
    assert.strictEqual(config.stuckThreshold, 3);
    assert.strictEqual(config.maxRevisions, 5);
  });

  it('handles null checkpointInterval', () => {
    const preset: PresetConfig = {
      reviews: {
        afterAnalyze: false,
        afterEnumerate: false,
        afterPlan: false,
        interval: 10,
        depth: 'shallow',
        checkpointInterval: null,
        maxRevisionAttempts: 2,
      },
      costs: { perLoop: 1, perPhase: 1, perRun: 1 },
      models: {
        analyze: 'haiku',
        enumerate: 'haiku',
        plan: 'haiku',
        build: 'opus',
        review: 'haiku',
        revise: 'haiku',
        conflict: 'sonnet',
      },
      stuck: { threshold: 5, maxRevisions: 10 },
    };

    const config = presetToEffortConfig(preset);
    assert.strictEqual(config.checkpointReviewInterval, null);
  });
});

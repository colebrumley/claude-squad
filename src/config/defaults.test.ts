import assert from 'node:assert';
import { describe, it } from 'node:test';
import { DEFAULT_PRESETS } from './effort.js';
import { ConfigSchema } from './schema.js';

describe('DEFAULT_PRESETS', () => {
  it('contains all four effort levels', () => {
    assert.ok(DEFAULT_PRESETS.low);
    assert.ok(DEFAULT_PRESETS.medium);
    assert.ok(DEFAULT_PRESETS.high);
    assert.ok(DEFAULT_PRESETS.max);
  });

  it('validates against ConfigSchema', () => {
    const config = { presets: DEFAULT_PRESETS };
    const result = ConfigSchema.safeParse(config);
    assert.strictEqual(result.success, true, `Validation failed: ${JSON.stringify(result)}`);
  });

  it('low preset has correct review settings', () => {
    assert.strictEqual(DEFAULT_PRESETS.low.reviews.afterAnalyze, false);
    assert.strictEqual(DEFAULT_PRESETS.low.reviews.afterEnumerate, false);
    assert.strictEqual(DEFAULT_PRESETS.low.reviews.afterPlan, false);
    assert.strictEqual(DEFAULT_PRESETS.low.reviews.interval, 10);
    assert.strictEqual(DEFAULT_PRESETS.low.reviews.depth, 'shallow');
    assert.strictEqual(DEFAULT_PRESETS.low.reviews.checkpointInterval, null);
  });

  it('max preset uses opus for all phases', () => {
    const models = DEFAULT_PRESETS.max.models;
    assert.strictEqual(models.analyze, 'opus');
    assert.strictEqual(models.enumerate, 'opus');
    assert.strictEqual(models.plan, 'opus');
    assert.strictEqual(models.build, 'opus');
    assert.strictEqual(models.review, 'opus');
    assert.strictEqual(models.revise, 'opus');
    assert.strictEqual(models.conflict, 'opus');
  });
});

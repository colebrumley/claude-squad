import assert from 'node:assert';
import { describe, it } from 'node:test';
import { ConfigSchema, PresetSchema } from './schema.js';

describe('Config Schema', () => {
  describe('PresetSchema', () => {
    it('validates a complete preset', () => {
      const preset = {
        reviews: {
          afterAnalyze: false,
          afterEnumerate: false,
          afterPlan: true,
          interval: 5,
          depth: 'standard',
          checkpointInterval: 5,
          maxRevisionAttempts: 3,
        },
        costs: {
          perLoop: 1000,
          perPhase: 1000,
          perRun: 10000,
        },
        models: {
          analyze: 'sonnet',
          enumerate: 'sonnet',
          plan: 'sonnet',
          build: 'opus',
          review: 'sonnet',
          revise: 'sonnet',
          conflict: 'sonnet',
        },
        stuck: {
          threshold: 4,
          maxRevisions: 8,
        },
      };

      const result = PresetSchema.safeParse(preset);
      assert.strictEqual(result.success, true);
    });

    it('accepts null checkpointInterval', () => {
      const preset = {
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

      const result = PresetSchema.safeParse(preset);
      assert.strictEqual(result.success, true);
    });

    it('rejects invalid model tier', () => {
      const preset = {
        reviews: {
          afterAnalyze: false,
          afterEnumerate: false,
          afterPlan: true,
          interval: 5,
          depth: 'standard',
          checkpointInterval: 5,
          maxRevisionAttempts: 3,
        },
        costs: { perLoop: 1000, perPhase: 1000, perRun: 10000 },
        models: {
          analyze: 'invalid-model', // Invalid
          enumerate: 'sonnet',
          plan: 'sonnet',
          build: 'opus',
          review: 'sonnet',
          revise: 'sonnet',
          conflict: 'sonnet',
        },
        stuck: { threshold: 4, maxRevisions: 8 },
      };

      const result = PresetSchema.safeParse(preset);
      assert.strictEqual(result.success, false);
    });

    it('rejects invalid review depth', () => {
      const preset = {
        reviews: {
          afterAnalyze: false,
          afterEnumerate: false,
          afterPlan: true,
          interval: 5,
          depth: 'invalid-depth', // Invalid
          checkpointInterval: 5,
          maxRevisionAttempts: 3,
        },
        costs: { perLoop: 1000, perPhase: 1000, perRun: 10000 },
        models: {
          analyze: 'sonnet',
          enumerate: 'sonnet',
          plan: 'sonnet',
          build: 'opus',
          review: 'sonnet',
          revise: 'sonnet',
          conflict: 'sonnet',
        },
        stuck: { threshold: 4, maxRevisions: 8 },
      };

      const result = PresetSchema.safeParse(preset);
      assert.strictEqual(result.success, false);
    });

    it('rejects negative cost values', () => {
      const preset = {
        reviews: {
          afterAnalyze: false,
          afterEnumerate: false,
          afterPlan: true,
          interval: 5,
          depth: 'standard',
          checkpointInterval: 5,
          maxRevisionAttempts: 3,
        },
        costs: { perLoop: -1, perPhase: 1000, perRun: 10000 }, // Negative
        models: {
          analyze: 'sonnet',
          enumerate: 'sonnet',
          plan: 'sonnet',
          build: 'opus',
          review: 'sonnet',
          revise: 'sonnet',
          conflict: 'sonnet',
        },
        stuck: { threshold: 4, maxRevisions: 8 },
      };

      const result = PresetSchema.safeParse(preset);
      assert.strictEqual(result.success, false);
    });
  });

  describe('ConfigSchema', () => {
    it('validates config with multiple presets', () => {
      const config = {
        presets: {
          low: {
            reviews: {
              afterAnalyze: false,
              afterEnumerate: false,
              afterPlan: false,
              interval: 10,
              depth: 'shallow',
              checkpointInterval: null,
              maxRevisionAttempts: 2,
            },
            costs: { perLoop: 1000, perPhase: 1000, perRun: 10000 },
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
          },
          custom: {
            reviews: {
              afterAnalyze: true,
              afterEnumerate: true,
              afterPlan: true,
              interval: 1,
              depth: 'comprehensive',
              checkpointInterval: 1,
              maxRevisionAttempts: 5,
            },
            costs: { perLoop: 50, perPhase: 100, perRun: 500 },
            models: {
              analyze: 'opus',
              enumerate: 'opus',
              plan: 'opus',
              build: 'opus',
              review: 'opus',
              revise: 'opus',
              conflict: 'opus',
            },
            stuck: { threshold: 2, maxRevisions: 3 },
          },
        },
      };

      const result = ConfigSchema.safeParse(config);
      assert.strictEqual(result.success, true);
    });

    it('rejects config without presets', () => {
      const config = {};

      const result = ConfigSchema.safeParse(config);
      assert.strictEqual(result.success, false);
    });
  });
});

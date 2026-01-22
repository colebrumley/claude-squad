import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getPreset, loadConfig } from './loader.js';

describe('Config Loader', () => {
  const testDir = join(process.cwd(), '.test-config-loader');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('loadConfig', () => {
    it('returns built-in defaults when no config file exists', () => {
      const config = loadConfig(undefined, testDir);
      assert.ok(config.presets.low);
      assert.ok(config.presets.medium);
      assert.ok(config.presets.high);
      assert.ok(config.presets.max);
    });

    it('loads config from explicit path', () => {
      const configPath = join(testDir, 'custom.yaml');
      writeFileSync(
        configPath,
        `
presets:
  fast:
    reviews:
      afterAnalyze: false
      afterEnumerate: false
      afterPlan: false
      interval: 20
      depth: shallow
      checkpointInterval: null
      maxRevisionAttempts: 1
    costs:
      perLoop: 100
      perPhase: 200
      perRun: 500
    models:
      analyze: haiku
      enumerate: haiku
      plan: haiku
      build: sonnet
      review: haiku
      revise: haiku
      conflict: haiku
    stuck:
      threshold: 10
      maxRevisions: 20
`
      );

      const config = loadConfig(configPath, testDir);
      assert.ok(config.presets.fast);
      assert.strictEqual(config.presets.fast.reviews.interval, 20);
      assert.strictEqual(config.presets.fast.costs.perRun, 500);
    });

    it('loads config from default ralphs.yaml location', () => {
      const configPath = join(testDir, 'ralphs.yaml');
      writeFileSync(
        configPath,
        `
presets:
  mypreset:
    reviews:
      afterAnalyze: true
      afterEnumerate: true
      afterPlan: true
      interval: 2
      depth: comprehensive
      checkpointInterval: 2
      maxRevisionAttempts: 4
    costs:
      perLoop: 50
      perPhase: 100
      perRun: 300
    models:
      analyze: opus
      enumerate: opus
      plan: opus
      build: opus
      review: opus
      revise: opus
      conflict: opus
    stuck:
      threshold: 2
      maxRevisions: 3
`
      );

      const config = loadConfig(undefined, testDir);
      assert.ok(config.presets.mypreset);
      assert.strictEqual(config.presets.mypreset.reviews.interval, 2);
    });

    it('throws error for non-existent explicit config path', () => {
      assert.throws(
        () => loadConfig(join(testDir, 'nonexistent.yaml'), testDir),
        /Config file not found/
      );
    });

    it('throws error for invalid YAML', () => {
      const configPath = join(testDir, 'invalid.yaml');
      writeFileSync(configPath, 'presets: [invalid yaml structure');

      assert.throws(() => loadConfig(configPath, testDir), /error/i);
    });

    it('throws error for schema validation failure', () => {
      const configPath = join(testDir, 'bad-schema.yaml');
      writeFileSync(
        configPath,
        `
presets:
  bad:
    reviews:
      afterAnalyze: "not-a-boolean"
`
      );

      assert.throws(() => loadConfig(configPath, testDir));
    });
  });

  describe('getPreset', () => {
    it('returns preset by name', () => {
      const config = loadConfig(undefined, testDir);
      const preset = getPreset(config, 'medium');
      assert.strictEqual(preset.reviews.afterPlan, true);
      assert.strictEqual(preset.reviews.interval, 5);
    });

    it('throws error for unknown preset', () => {
      const config = loadConfig(undefined, testDir);
      assert.throws(() => getPreset(config, 'nonexistent'), /Preset "nonexistent" not found/);
    });

    it('error message lists available presets', () => {
      const config = loadConfig(undefined, testDir);
      try {
        getPreset(config, 'nonexistent');
        assert.fail('Should have thrown');
      } catch (err) {
        const message = (err as Error).message;
        assert.ok(message.includes('low'), 'Should mention low preset');
        assert.ok(message.includes('medium'), 'Should mention medium preset');
        assert.ok(message.includes('high'), 'Should mention high preset');
        assert.ok(message.includes('max'), 'Should mention max preset');
      }
    });
  });
});

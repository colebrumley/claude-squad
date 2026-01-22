import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { presetToEffortConfig } from './effort.js';
import { getPreset, loadConfig } from './loader.js';

describe('Config File Integration', () => {
  const testDir = join(process.cwd(), '.test-config-integration');

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

  it('full flow: load YAML → validate → convert to EffortConfig', () => {
    const configPath = join(testDir, 'ralphs.yaml');
    writeFileSync(
      configPath,
      `
presets:
  cheap:
    reviews:
      afterAnalyze: false
      afterEnumerate: false
      afterPlan: false
      interval: 50
      depth: shallow
      checkpointInterval: null
      maxRevisionAttempts: 1
    costs:
      perLoop: 0.50
      perPhase: 1.00
      perRun: 5.00
    models:
      analyze: haiku
      enumerate: haiku
      plan: haiku
      build: haiku
      review: haiku
      revise: haiku
      conflict: haiku
    stuck:
      threshold: 10
      maxRevisions: 20
`
    );

    // Load config
    const config = loadConfig(configPath, testDir);
    assert.ok(config.presets.cheap);

    // Get preset
    const preset = getPreset(config, 'cheap');
    assert.strictEqual(preset.costs.perRun, 5.0);

    // Convert to EffortConfig
    const effortConfig = presetToEffortConfig(preset);
    assert.strictEqual(effortConfig.costLimits.perRunMaxUsd, 5.0);
    assert.strictEqual(effortConfig.reviewInterval, 50);
    assert.strictEqual(effortConfig.models.build, 'haiku');
    assert.strictEqual(effortConfig.checkpointReviewInterval, null);
  });

  it('custom preset can override built-in presets', () => {
    const configPath = join(testDir, 'ralphs.yaml');
    writeFileSync(
      configPath,
      `
presets:
  medium:
    reviews:
      afterAnalyze: true
      afterEnumerate: true
      afterPlan: true
      interval: 1
      depth: comprehensive
      checkpointInterval: 1
      maxRevisionAttempts: 10
    costs:
      perLoop: 999
      perPhase: 999
      perRun: 999
    models:
      analyze: opus
      enumerate: opus
      plan: opus
      build: opus
      review: opus
      revise: opus
      conflict: opus
    stuck:
      threshold: 1
      maxRevisions: 1
`
    );

    const config = loadConfig(configPath, testDir);
    const preset = getPreset(config, 'medium');
    const effortConfig = presetToEffortConfig(preset);

    // These values are different from built-in medium preset
    assert.strictEqual(effortConfig.reviewAfterAnalyze, true); // Built-in is false
    assert.strictEqual(effortConfig.reviewInterval, 1); // Built-in is 5
    assert.strictEqual(effortConfig.costLimits.perRunMaxUsd, 999); // Built-in is 10000
  });
});

import assert from 'node:assert';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { AnalyzeIncompleteError, isEmptyProject } from './analyze.js';

describe('Analyze Phase', () => {
  describe('isEmptyProject', () => {
    test('returns true for empty directory', async () => {
      const testDir = join(tmpdir(), `sq-test-empty-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
      try {
        const result = await isEmptyProject(testDir, '/some/spec.md');
        assert.strictEqual(result, true);
      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test('returns true for directory with only ignored files', async () => {
      const testDir = join(tmpdir(), `sq-test-ignored-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
      await mkdir(join(testDir, '.git'), { recursive: true });
      await mkdir(join(testDir, '.sq'), { recursive: true });
      await writeFile(join(testDir, '.gitignore'), 'node_modules\n');
      try {
        const result = await isEmptyProject(testDir, '/some/spec.md');
        assert.strictEqual(result, true);
      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test('returns true for directory with only spec file', async () => {
      const testDir = join(tmpdir(), `sq-test-spec-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
      const specPath = join(testDir, 'spec.md');
      await writeFile(specPath, '# Spec');
      try {
        const result = await isEmptyProject(testDir, specPath);
        assert.strictEqual(result, true);
      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test('returns false for directory with source files', async () => {
      const testDir = join(tmpdir(), `sq-test-src-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
      await writeFile(join(testDir, 'index.ts'), 'console.log("hello")');
      try {
        const result = await isEmptyProject(testDir, '/some/spec.md');
        assert.strictEqual(result, false);
      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test('returns false for directory with package.json', async () => {
      const testDir = join(tmpdir(), `sq-test-pkg-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
      await writeFile(join(testDir, 'package.json'), '{}');
      try {
        const result = await isEmptyProject(testDir, '/some/spec.md');
        assert.strictEqual(result, false);
      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test('returns false for non-existent directory', async () => {
      const result = await isEmptyProject('/nonexistent/path', '/some/spec.md');
      assert.strictEqual(result, false);
    });
  });

  describe('AnalyzeIncompleteError', () => {
    test('includes error name', () => {
      const error = new AnalyzeIncompleteError('some output');
      assert.strictEqual(error.name, 'AnalyzeIncompleteError');
    });

    test('includes truncated output in error message', () => {
      const longOutput = 'x'.repeat(500);
      const error = new AnalyzeIncompleteError(longOutput);
      // Should include last 200 characters
      assert.ok(error.message.includes('x'.repeat(200)));
      assert.strictEqual(error.output, longOutput);
    });

    test('indicates ANALYZE_COMPLETE was missing', () => {
      const error = new AnalyzeIncompleteError('');
      assert.ok(error.message.includes('ANALYZE_COMPLETE'));
    });
  });
});

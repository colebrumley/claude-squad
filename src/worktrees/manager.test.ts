// src/worktrees/manager.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorktreeManager } from './manager.js';

describe('WorktreeManager', () => {
  let testDir: string;
  let repoDir: string;
  let worktreeManager: WorktreeManager;

  beforeEach(() => {
    // Create temp directory with a git repo
    testDir = mkdtempSync(join(tmpdir(), 'c2-worktree-test-'));
    repoDir = join(testDir, 'repo');
    execSync(`mkdir -p ${repoDir} && cd ${repoDir} && git init && git commit --allow-empty -m "init"`, { stdio: 'pipe' });

    worktreeManager = new WorktreeManager({
      repoDir,
      worktreeBaseDir: join(repoDir, '.c2', 'worktrees'),
      baseBranch: 'main',
      runId: 'test-run-123',
    });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('create()', () => {
    it('creates a worktree directory', async () => {
      const result = await worktreeManager.create('loop-abc');

      assert.ok(result.worktreePath.includes('loop-abc'));
      assert.ok(result.branchName.includes('c2/test-run-123/loop-abc'));
    });
  });
});

// src/worktrees/manager.ts
import { exec } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface WorktreeManagerConfig {
  repoDir: string;
  worktreeBaseDir: string;
  baseBranch: string;
  runId: string;
}

export interface CreateResult {
  worktreePath: string;
  branchName: string;
}

export type MergeResult =
  | { status: 'success' }
  | { status: 'conflict'; conflictFiles: string[] };

export class WorktreeManager {
  private config: WorktreeManagerConfig;

  constructor(config: WorktreeManagerConfig) {
    this.config = config;
  }

  async create(loopId: string): Promise<CreateResult> {
    const branchName = `c2/${this.config.runId}/${loopId}`;
    const worktreePath = join(this.config.worktreeBaseDir, loopId);

    // Ensure base directory exists
    if (!existsSync(this.config.worktreeBaseDir)) {
      mkdirSync(this.config.worktreeBaseDir, { recursive: true });
    }

    // Create worktree with new branch
    await execAsync(
      `git worktree add -b "${branchName}" "${worktreePath}" ${this.config.baseBranch}`,
      { cwd: this.config.repoDir }
    );

    return { worktreePath, branchName };
  }
}

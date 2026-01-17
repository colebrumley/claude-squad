import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import type { EffortLevel, OrchestratorState } from '../types/index.js';
import { getEffortConfig } from '../config/effort.js';

export interface InitStateOptions {
  specPath: string;
  effort: EffortLevel;
  stateDir: string;
  maxLoops: number;
  maxIterations: number;
  useWorktrees?: boolean;
}

function getBaseBranch(): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' })
      .toString()
      .trim();
  } catch {
    return null; // Not a git repo
  }
}

function isGitClean(): boolean {
  try {
    execSync('git diff --quiet && git diff --cached --quiet', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function initializeState(options: InitStateOptions): OrchestratorState {
  const effortConfig = getEffortConfig(options.effort);
  const baseBranch = getBaseBranch();
  const useWorktrees = options.useWorktrees !== false && baseBranch !== null;

  if (useWorktrees && !isGitClean()) {
    throw new Error('Cannot run sq with uncommitted changes - commit or stash first');
  }

  return {
    runId: randomUUID(),
    specPath: options.specPath,
    effort: options.effort,
    phase: 'enumerate',
    phaseHistory: [],
    tasks: [],
    taskGraph: null,
    activeLoops: [],
    completedTasks: [],
    pendingReview: false,
    reviewType: null,
    revisionCount: 0,
    context: {
      discoveries: [],
      errors: [],
      decisions: [],
    },
    costs: {
      totalCostUsd: 0,
      phaseCosts: {
        enumerate: 0,
        plan: 0,
        build: 0,
        review: 0,
        revise: 0,
        conflict: 0,
        complete: 0,
      },
      loopCosts: {},
    },
    costLimits: effortConfig.costLimits,
    maxLoops: options.maxLoops,
    maxIterations: options.maxIterations,
    stateDir: options.stateDir,
    baseBranch,
    useWorktrees,
  };
}

export { OrchestratorStateSchema } from './schema.js';

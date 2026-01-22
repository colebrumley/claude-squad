import type { CostLimits, EffortLevel, ModelTier, Phase } from '../types/index.js';
import type { PresetConfig } from './schema.js';

// Model IDs for each tier
const MODEL_IDS: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-20250514',
};

export function getModelId(tier: ModelTier): string {
  return MODEL_IDS[tier];
}

/**
 * Default presets in the config file schema format.
 * These are used when no sq.yaml config file is found.
 */
export const DEFAULT_PRESETS: Record<string, PresetConfig> = {
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
    costs: {
      perLoop: 1000,
      perPhase: 1000,
      perRun: 10000,
    },
    models: {
      analyze: 'haiku',
      enumerate: 'haiku',
      plan: 'haiku',
      build: 'opus',
      review: 'haiku',
      revise: 'haiku',
      conflict: 'sonnet',
    },
    stuck: {
      threshold: 5,
      maxRevisions: 10,
    },
  },
  medium: {
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
  },
  high: {
    reviews: {
      afterAnalyze: false,
      afterEnumerate: true,
      afterPlan: true,
      interval: 3,
      depth: 'deep',
      checkpointInterval: 3,
      maxRevisionAttempts: 4,
    },
    costs: {
      perLoop: 1000,
      perPhase: 1000,
      perRun: 10000,
    },
    models: {
      analyze: 'sonnet',
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
  },
  max: {
    reviews: {
      afterAnalyze: true,
      afterEnumerate: true,
      afterPlan: true,
      interval: 1,
      depth: 'comprehensive',
      checkpointInterval: 1,
      maxRevisionAttempts: 5,
    },
    costs: {
      perLoop: 1000,
      perPhase: 1000,
      perRun: 10000,
    },
    models: {
      analyze: 'opus',
      enumerate: 'opus',
      plan: 'opus',
      build: 'opus',
      review: 'opus',
      revise: 'opus',
      conflict: 'opus',
    },
    stuck: {
      threshold: 2,
      maxRevisions: 3,
    },
  },
};

// Phases that use models (excludes 'complete' which doesn't run an agent)
type AgentPhase = Exclude<Phase, 'complete'>;

export interface EffortConfig {
  reviewAfterAnalyze: boolean;
  reviewAfterEnumerate: boolean;
  reviewAfterPlan: boolean;
  reviewInterval: number; // Review every N iterations in build loops
  reviewDepth: 'shallow' | 'standard' | 'deep' | 'comprehensive';
  stuckThreshold: number; // Same error count before flagging stuck
  maxRevisions: number; // Max BUILD→REVIEW→REVISE cycles before stopping

  // Per-loop review settings
  checkpointReviewInterval: number | null; // Iterations between checkpoint reviews (null = disabled)
  maxRevisionAttempts: number; // Max revision attempts per task before marking loop stuck

  // Cost limits (Risk #3 mitigation)
  costLimits: CostLimits;

  // Model tiers per phase
  models: Record<AgentPhase, ModelTier>;
}

const EFFORT_CONFIGS: Record<EffortLevel, EffortConfig> = {
  low: {
    reviewAfterAnalyze: false,
    reviewAfterEnumerate: false,
    reviewAfterPlan: false,
    reviewInterval: 10,
    reviewDepth: 'shallow',
    stuckThreshold: 5,
    maxRevisions: 10,
    checkpointReviewInterval: null, // No checkpoint reviews
    maxRevisionAttempts: 2,
    // Cost limits effectively disabled for development
    costLimits: { perLoopMaxUsd: 1000, perPhaseMaxUsd: 1000, perRunMaxUsd: 10000 },
    models: {
      analyze: 'haiku',
      enumerate: 'haiku',
      plan: 'haiku',
      build: 'opus',
      review: 'haiku',
      revise: 'haiku',
      conflict: 'sonnet',
    },
  },
  medium: {
    reviewAfterAnalyze: false,
    reviewAfterEnumerate: false,
    reviewAfterPlan: true,
    reviewInterval: 5,
    reviewDepth: 'standard',
    stuckThreshold: 4,
    maxRevisions: 8,
    checkpointReviewInterval: 5, // Every 5 iterations
    maxRevisionAttempts: 3,
    costLimits: { perLoopMaxUsd: 1000, perPhaseMaxUsd: 1000, perRunMaxUsd: 10000 },
    models: {
      analyze: 'sonnet',
      enumerate: 'sonnet',
      plan: 'sonnet',
      build: 'opus',
      review: 'sonnet',
      revise: 'sonnet',
      conflict: 'sonnet',
    },
  },
  high: {
    reviewAfterAnalyze: false,
    reviewAfterEnumerate: true,
    reviewAfterPlan: true,
    reviewInterval: 3,
    reviewDepth: 'deep',
    stuckThreshold: 3,
    maxRevisions: 5,
    checkpointReviewInterval: 3, // Every 3 iterations
    maxRevisionAttempts: 4,
    costLimits: { perLoopMaxUsd: 1000, perPhaseMaxUsd: 1000, perRunMaxUsd: 10000 },
    models: {
      analyze: 'sonnet',
      enumerate: 'sonnet',
      plan: 'opus',
      build: 'opus',
      review: 'opus',
      revise: 'sonnet',
      conflict: 'opus',
    },
  },
  max: {
    reviewAfterAnalyze: true,
    reviewAfterEnumerate: true,
    reviewAfterPlan: true,
    reviewInterval: 1,
    reviewDepth: 'comprehensive',
    stuckThreshold: 2,
    maxRevisions: 3,
    checkpointReviewInterval: 1, // Every iteration
    maxRevisionAttempts: 5,
    costLimits: { perLoopMaxUsd: 1000, perPhaseMaxUsd: 1000, perRunMaxUsd: 10000 },
    models: {
      analyze: 'opus',
      enumerate: 'opus',
      plan: 'opus',
      build: 'opus',
      review: 'opus',
      revise: 'opus',
      conflict: 'opus',
    },
  },
};

export function getEffortConfig(effort: EffortLevel): EffortConfig {
  return EFFORT_CONFIGS[effort];
}

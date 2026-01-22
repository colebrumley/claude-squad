import { z } from 'zod';

export const ModelTierSchema = z.enum(['haiku', 'sonnet', 'opus']);
export const ReviewDepthSchema = z.enum(['shallow', 'standard', 'deep', 'comprehensive']);

export const PresetSchema = z.object({
  reviews: z.object({
    afterAnalyze: z.boolean(),
    afterEnumerate: z.boolean(),
    afterPlan: z.boolean(),
    interval: z.number().int().positive(),
    depth: ReviewDepthSchema,
    checkpointInterval: z.number().int().positive().nullable(),
    maxRevisionAttempts: z.number().int().positive(),
  }),
  costs: z.object({
    perLoop: z.number().positive(),
    perPhase: z.number().positive(),
    perRun: z.number().positive(),
  }),
  models: z.object({
    analyze: ModelTierSchema,
    enumerate: ModelTierSchema,
    plan: ModelTierSchema,
    build: ModelTierSchema,
    review: ModelTierSchema,
    revise: ModelTierSchema,
    conflict: ModelTierSchema,
  }),
  stuck: z.object({
    threshold: z.number().int().positive(),
    maxRevisions: z.number().int().positive(),
  }),
});

export const ConfigSchema = z.object({
  presets: z.record(z.string(), PresetSchema),
});

export type ConfigFile = z.infer<typeof ConfigSchema>;
export type PresetConfig = z.infer<typeof PresetSchema>;

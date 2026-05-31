import { z } from 'zod';

export const studioAdRequestSchema = z.object({
  userIntent: z.string().min(8).max(4000),
  outputType: z.enum(['image', 'video']).default('image'),
  providerTarget: z.string().min(2).max(80).optional().default('openai'),
  mode: z
    .enum([
      'cinematic_realism',
      'stylized_commercial',
      'music_video_experimental',
      'product_ad',
      'narrative_continuity',
    ])
    .default('cinematic_realism'),
  projectBible: z
    .object({
      title: z.string().max(200).optional(),
      houseStyle: z.string().max(200).optional(),
      aspectRatio: z.string().max(20).optional(),
      lensPackage: z.string().max(200).optional(),
      continuityAnchors: z.array(z.string().max(500)).max(20).optional().default([]),
    })
    .optional()
    .default({ continuityAnchors: [] }),
  context: z
    .object({
      projectId: z.string().uuid().optional(),
      sceneId: z.string().uuid().optional(),
      shotId: z.string().uuid().optional(),
      generationModelHint: z.string().max(120).optional(),
    })
    .optional(),
  currentPromptContext: z.string().max(4000).optional(),
  productionMemory: z
    .object({
      projectSummary: z.string().max(2000).optional(),
      sceneSummary: z.string().max(2000).optional(),
      shotSummary: z.string().max(2000).optional(),
      elementAnchors: z.array(z.string().max(500)).max(20).optional(),
      recentPromptSignals: z.array(z.string().max(1200)).max(8).optional(),
      continuitySignals: z.array(z.string().max(500)).max(20).optional(),
    })
    .optional(),
});

const shotStrategySchema = z.object({
  framing: z.string(),
  lens: z.string(),
  movement: z.string(),
  lighting: z.string(),
  mood: z.string(),
  composition: z.string(),
});

const scoreSchema = z.object({
  productionReadiness: z.number().int().min(0).max(100),
  continuityConfidence: z.number().int().min(0).max(100),
  technicalClarity: z.number().int().min(0).max(100),
});

export const studioAdPacketSchema = z.object({
  strategy: z.string(),
  shotStrategy: shotStrategySchema,
  masterPrompt: z.string().min(20),
  negativePrompt: z.string().min(5),
  technicalMetadata: z.object({
    aspectRatio: z.string(),
    fps: z.number().int().nullable(),
    durationSeconds: z.number().nullable(),
    cameraLanguage: z.string(),
    cameraBody: z.string().optional(),
    lensSpec: z.string().optional(),
    movementProfile: z.string().optional(),
    lightingPlan: z.string().optional(),
    colorPipeline: z.string().optional(),
    continuityAnchorsApplied: z.array(z.string().min(1)).max(20).optional(),
    safetyNotes: z.array(z.string().min(1)).max(10).optional(),
    shotListIntent: z.enum(["hero", "coverage", "insert"]).optional(),
  }),
  variants: z.array(z.string().min(20)).min(2).max(4),
  score: scoreSchema,
  suggestions: z.array(z.string().min(5)).max(8),
});

export type StudioAdRequest = z.infer<typeof studioAdRequestSchema>;
export type StudioAdPacket = z.infer<typeof studioAdPacketSchema>;

export const studioAdCampaignRequestSchema = z.object({
  userIntent: z.string().min(8).max(4000),
  assetCount: z.number().int().min(2).max(5).default(3),
  outputType: z.literal('video').default('video'),
  providerTarget: z.string().min(2).max(80).optional().default('kie'),
  campaignType: z.enum(['ugc', 'product_ad', 'narrative_sequence']).default('ugc'),
  aspectRatio: z.string().max(20).optional().default('9:16'),
  durationSeconds: z.number().int().min(5).max(15).optional().default(8),
  context: z
    .object({
      projectId: z.string().uuid().optional(),
      sceneId: z.string().uuid().optional(),
      generationModelHint: z.string().max(120).optional(),
    })
    .optional(),
  currentPromptContext: z.string().max(4000).optional(),
  continuityAnchors: z.array(z.string().max(500)).max(20).optional().default([]),
});

export const studioAdCampaignDeliverableSchema = z.object({
  id: z.string().min(2).max(80),
  title: z.string().min(3).max(120),
  conceptType: z.string().min(3).max(80),
  hook: z.string().min(5).max(220),
  creatorDirection: z.string().min(10).max(500),
  masterPrompt: z.string().min(30).max(1200),
  negativePrompt: z.string().min(5).max(700),
  durationSeconds: z.number().int().min(5).max(15),
  aspectRatio: z.string().min(3).max(20),
  modelFamilyId: z.enum(['kling', 'seedance', 'sora']),
  stylePresetId: z.string().max(120).nullable().optional(),
  motionPresetId: z.string().max(120).nullable().optional(),
  continuityAnchors: z.array(z.string().min(1).max(240)).max(12).default([]),
  productionNotes: z.array(z.string().min(3).max(220)).max(5).default([]),
});

export const studioAdCampaignPlanSchema = z.object({
  campaignSummary: z.string().min(10).max(600),
  audience: z.string().min(3).max(220),
  creativeStrategy: z.string().min(10).max(500),
  deliverables: z.array(studioAdCampaignDeliverableSchema).min(2).max(5),
  score: z.object({
    campaignReadiness: z.number().int().min(0).max(100),
    varietyStrength: z.number().int().min(0).max(100),
    promptClarity: z.number().int().min(0).max(100),
  }),
  suggestions: z.array(z.string().min(5).max(220)).max(6).default([]),
});

export type StudioAdCampaignRequest = z.infer<typeof studioAdCampaignRequestSchema>;
export type StudioAdCampaignPlan = z.infer<typeof studioAdCampaignPlanSchema>;
export type StudioAdCampaignDeliverable = z.infer<typeof studioAdCampaignDeliverableSchema>;

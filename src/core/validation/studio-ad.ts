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
  }),
  variants: z.array(z.string().min(20)).min(2).max(4),
  score: scoreSchema,
  suggestions: z.array(z.string().min(5)).max(8),
});

export type StudioAdRequest = z.infer<typeof studioAdRequestSchema>;
export type StudioAdPacket = z.infer<typeof studioAdPacketSchema>;

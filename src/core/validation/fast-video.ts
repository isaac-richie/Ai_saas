import { z } from "zod"
import { FAST_VIDEO_ASPECT_RATIOS, FAST_VIDEO_VARIATIONS } from "@/core/config/fast-video-presets"

export const fastVideoRequestSchema = z.object({
  request_type: z.literal("fast_video"),
  project_id: z.string().min(1).optional().nullable(),
  prompt_inputs: z.object({
    text_subject: z.string().min(3, "Describe your subject in at least 3 characters").max(1200),
    style_preset_id: z.string().optional().nullable(),
    motion_preset_id: z.string().optional().nullable(),
    aspect_ratio: z.enum(FAST_VIDEO_ASPECT_RATIOS),
    reference_image: z.string().url().optional().nullable(),
    variation_setting: z.enum(FAST_VIDEO_VARIATIONS),
  }),
  settings: z.object({
    duration_seconds: z.number().int().min(5).max(15).default(5),
    model: z.string().optional().nullable(),
  }),
})

export type FastVideoRequest = z.infer<typeof fastVideoRequestSchema>

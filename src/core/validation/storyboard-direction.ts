import { z } from "zod"

/** Roles a dropped storyboard image can take. */
export const DROP_ROLES = ["character", "product", "location", "prop", "wardrobe", "style"] as const

export const referenceClassificationSchema = z.object({
  role: z.enum(DROP_ROLES),
  label: z.string().trim().min(1).max(40),
  /** Visual identity cues the shot prompt should keep, e.g. hair, jewellery, product finish. */
  description: z.string().trim().min(1).max(240),
})
export type ReferenceClassification = z.infer<typeof referenceClassificationSchema>

export const enhanceDirectionRequestSchema = z.object({
  direction: z.string().trim().min(2).max(1200),
  references: z.array(z.object({
    role: z.string().max(32),
    name: z.string().max(180),
    guidance: z.string().max(240).optional(),
  })).max(6).default([]),
  previous: z.object({
    direction: z.string().max(1200).optional(),
    prompt: z.string().max(4000).optional(),
  }).nullish(),
  startsFromPreviousShot: z.boolean().default(false),
  durationSeconds: z.number().int().min(1).max(30).default(5),
})
export type EnhanceDirectionRequest = z.infer<typeof enhanceDirectionRequestSchema>

export const enhancedDirectionSchema = z.object({
  prompt: z.string().trim().min(20).max(1100),
})

/** The enhanced prompt is reused until the creator changes their direction. */
export function needsEnhancement(item: { direction?: string; enhancedPrompt?: string | null; enhancedFrom?: string | null; autoEnhance?: boolean }) {
  if (item.autoEnhance === false) return false
  const direction = (item.direction || "").trim()
  if (!direction) return false
  return !item.enhancedPrompt || (item.enhancedFrom || "").trim() !== direction
}

/** Fold the creator's short direction into the prompt that is actually sent. */
export function generationPrompt(item: { direction?: string; prompt?: string; enhancedPrompt?: string | null; enhancedFrom?: string | null; autoEnhance?: boolean }) {
  const direction = (item.direction || "").trim()
  if (item.autoEnhance !== false && item.enhancedPrompt && (item.enhancedFrom || "").trim() === direction) return item.enhancedPrompt
  return direction || (item.prompt || "").trim()
}

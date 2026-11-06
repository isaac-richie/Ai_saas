import { z } from "zod"
import { MAX_FILM_SHOTS, MIN_FILM_SHOTS } from "@/core/config/film"
import { getKieVideoModelFamily } from "@/core/config/kie-video-models"
import { findLightingPreset } from "@/core/config/lighting-presets"

export const productionShotSettingsSchema = z.array(z.object({
  model: z.enum(["kling", "seedance"]),
  durationSeconds: z.number().int(),
  /** Optional lighting setup for this shot, from the lighting library. */
  lighting: z.string().max(64).refine(id => Boolean(findLightingPreset(id)), { message: "Choose a lighting setup from the list." }).optional(),
}).refine(shot => {
  const family = getKieVideoModelFamily(shot.model)
  return shot.durationSeconds >= family.minSeconds && shot.durationSeconds <= family.maxSeconds
}, { message: "Kling supports 3 to 15 seconds; Seedance supports 4 to 30 seconds." })).min(MIN_FILM_SHOTS).max(MAX_FILM_SHOTS)

export type ProductionShotSettings = z.infer<typeof productionShotSettingsSchema>

/**
 * Shot settings as the planning crew reads them: a lighting id becomes the setup written out in
 * words, so the crew can design and write each shot around it.
 */
export function crewShotSettings(settings: ProductionShotSettings | undefined | null) {
  if (!settings) return null
  return settings.map(({ model, durationSeconds, lighting }) => {
    const preset = findLightingPreset(lighting)
    return { model, durationSeconds, ...(preset ? { lightingSetup: `${preset.name}: ${preset.promptTokens}` } : {}) }
  })
}

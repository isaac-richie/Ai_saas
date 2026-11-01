import { z } from "zod"
import { MAX_FILM_SHOTS, MIN_FILM_SHOTS } from "@/core/config/film"
import { getKieVideoModelFamily } from "@/core/config/kie-video-models"

export const productionShotSettingsSchema = z.array(z.object({
  model: z.enum(["kling", "seedance"]),
  durationSeconds: z.number().int(),
}).refine(shot => {
  const family = getKieVideoModelFamily(shot.model)
  return shot.durationSeconds >= family.minSeconds && shot.durationSeconds <= family.maxSeconds
}, { message: "Kling supports 3 to 15 seconds; Seedance supports 4 to 30 seconds." })).min(MIN_FILM_SHOTS).max(MAX_FILM_SHOTS)

export type ProductionShotSettings = z.infer<typeof productionShotSettingsSchema>

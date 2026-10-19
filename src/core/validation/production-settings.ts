import { z } from "zod"
import { getKieVideoModelFamily } from "@/core/config/kie-video-models"

export const productionShotSettingsSchema = z.array(z.object({
  model: z.enum(["kling", "seedance"]),
  durationSeconds: z.number().int(),
}).refine(shot => {
  const family = getKieVideoModelFamily(shot.model)
  return shot.durationSeconds >= family.minSeconds && shot.durationSeconds <= family.maxSeconds
}, { message: "Kling supports 3 to 15 seconds; Seedance supports 4 to 30 seconds." })).min(2).max(12)

export type ProductionShotSettings = z.infer<typeof productionShotSettingsSchema>

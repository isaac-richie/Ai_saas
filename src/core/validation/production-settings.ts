import { z } from "zod"

export const productionShotSettingsSchema = z.array(z.object({
  model: z.enum(["kling", "seedance"]),
  durationSeconds: z.number().int().min(4).max(15),
}).refine(shot => shot.durationSeconds >= 4 && shot.durationSeconds <= 15, { message: "Seedance 2.5 supports 4 to 15 seconds." })).min(2).max(12)

export type ProductionShotSettings = z.infer<typeof productionShotSettingsSchema>

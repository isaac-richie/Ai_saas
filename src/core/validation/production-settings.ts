import { z } from "zod"

export const productionShotSettingsSchema = z.array(z.object({
  model: z.enum(["kling", "seedance"]),
  durationSeconds: z.number().int().min(4).max(15),
}).refine(shot => shot.model === "seedance" || [5, 10].includes(shot.durationSeconds), { message: "Kling supports 5 or 10 seconds; Seedance supports 4 to 15 seconds." })).min(2).max(12)

export type ProductionShotSettings = z.infer<typeof productionShotSettingsSchema>

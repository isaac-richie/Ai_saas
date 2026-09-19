import { z } from "zod"

export const productionShotSettingsSchema = z.array(z.object({
  model: z.enum(["kling", "seedance"]),
  durationSeconds: z.union([z.literal(5), z.literal(10)]),
})).length(3)

export type ProductionShotSettings = z.infer<typeof productionShotSettingsSchema>

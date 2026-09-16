import { z } from "zod"

export const productionAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  url: z.string().url(),
  role: z.enum(["character", "wardrobe", "product", "location", "lighting"]),
  mediaType: z.enum(["image", "video"]).default("image"),
})
export const productionAssetsSchema = z.array(productionAssetSchema).max(6)
export type ProductionAsset = z.infer<typeof productionAssetSchema>

export function ownsAssetUrl(url: string, userId: string) {
  try {
    const target = new URL(url)
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    return target.origin === base.origin && target.pathname.startsWith(`/storage/v1/object/public/elements/${userId}/`) && !target.search
  } catch { return false }
}

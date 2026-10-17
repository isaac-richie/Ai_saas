import { z } from "zod"

export const productionAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  url: z.string().url(),
  role: z.enum(["character", "wardrobe", "product", "location", "lighting"]),
  mediaType: z.enum(["image", "video"]).default("image"),
  /** Permanent @image1 / @video1 tag, stamped at upload so a brief's mention always means this file. */
  label: z.string().regex(/^@(image|video)([1-9]|1[0-2])$/).optional(),
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

/** Keeps every asset's existing tag and gives untagged ones the lowest free number for their type. */
export function labelProductionAssets(assets: ProductionAsset[]): ProductionAsset[] {
  const taken = { image: new Set<number>(), video: new Set<number>() }
  const kept = assets.map((asset) => {
    const n = Number(asset.label?.match(new RegExp(`^@${asset.mediaType}(\\d+)$`))?.[1] ?? 0)
    if (!n || taken[asset.mediaType].has(n)) return 0
    taken[asset.mediaType].add(n)
    return n
  })
  return assets.map((asset, index) => {
    let n = kept[index]
    if (!n) { n = 1; while (taken[asset.mediaType].has(n)) n += 1; taken[asset.mediaType].add(n) }
    return { ...asset, label: `@${asset.mediaType}${n}` }
  })
}

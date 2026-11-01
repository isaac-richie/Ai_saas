import { z } from "zod"

export const productionAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  url: z.string().url(),
  role: z.enum(["character", "wardrobe", "product", "location", "lighting"]),
  mediaType: z.enum(["image", "video"]).default("image"),
  /** Permanent @image1 / @video1 tag, stamped at upload so a brief's mention always means this file. */
  label: z.string().regex(/^@(image|video)([1-9]|1[0-9]|2[0-4])$/).optional(),
})
/** A film's reference library. Each shot sends the model only its most relevant few (MAX_SHOT_REFERENCES). */
export const MAX_PRODUCTION_REFERENCES = 24
export const MAX_SHOT_REFERENCES = 6
export const productionAssetsSchema = z.array(productionAssetSchema).max(MAX_PRODUCTION_REFERENCES)
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

/**
 * The references one shot should send: images the shot mentions by tag (@image7) first, then those
 * whose names match the shot's words, then characters and products. At most `max`, images only.
 */
export function selectShotReferences(assets: ProductionAsset[], shotText: string, max = MAX_SHOT_REFERENCES): ProductionAsset[] {
  const text = shotText.toLowerCase()
  const words = new Set(text.match(/[a-z0-9]{3,}/g) || [])
  const scored = assets
    .map((asset, index) => {
      if (asset.mediaType !== "image") return null
      const tagged = asset.label ? new RegExp(`${asset.label}(?!\\d)`, "i").test(shotText) : false
      const nameHits = (asset.name.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => words.has(w)).length
      const roleWeight = asset.role === "character" ? 3 : asset.role === "product" ? 2 : asset.role === "wardrobe" ? 1 : 0
      return { asset, index, score: (tagged ? 1000 : 0) + nameHits * 10 + roleWeight }
    })
    .filter((x): x is { asset: ProductionAsset; index: number; score: number } => x !== null)
  // Stable: equal scores keep the order the creator added them in.
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.slice(0, max).map((x) => x.asset)
}

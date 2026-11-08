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

/**
 * A take's inspected frame (the previous shot's last frame a continued shot opens on), stored by the
 * inspect route at renders/{userId}/inspections/… and owned by that creator.
 */
export function ownsInspectionFrameUrl(url: string, userId: string) {
  try {
    const target = new URL(url)
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    return target.origin === base.origin && target.pathname.startsWith(`/storage/v1/object/public/renders/${userId}/inspections/`) && !target.search && !target.pathname.includes("..")
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

const ROLE_NOUNS: Record<ProductionAsset["role"], string> = {
  character: "character", wardrobe: "wardrobe", product: "product", location: "location", lighting: "lighting look",
}

/**
 * "estate_courtyard.png" read as words. A tag the writer already describes ("@image3 estate courtyard")
 * needs only the name; a tag that ends a clause gets its role ("in @image2." → "in flat location.").
 */
function describeAsset(asset: ProductionAsset, endsClause: boolean) {
  const words = asset.name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-.]+/g, " ")
    .replace(/\b(turnaround|sheet|ref|reference|final|copy|img|image|v\d+|\d+)\b/gi, " ").replace(/\s+/g, " ").trim()
  const noun = ROLE_NOUNS[asset.role]
  if (!words) return noun
  return endsClause && !new RegExp(`\\b${noun}\\b`, "i").test(words) ? `${words} ${noun}` : words
}

/** Tagged references in the order the shot first mentions them (@image3 before @image2 if written so). */
export function taggedShotReferences(assets: ProductionAsset[], shotText: string): ProductionAsset[] {
  return assets
    .map((asset) => ({ asset, at: asset.label ? shotText.search(new RegExp(`${asset.label}(?!\\d)`, "i")) : -1 }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.asset)
}

/**
 * The image a shot opens on. Video models read @image tags as noise, so the frame they start from is
 * what puts the shot in the right place: the first tagged location wins, then any tagged image that is
 * not a character sheet, then the best name match (locations before characters, because a turnaround
 * sheet makes a poor opening frame).
 */
export function selectOpeningReference(assets: ProductionAsset[], shotText: string): ProductionAsset | null {
  const images = assets.filter((asset) => asset.mediaType === "image")
  const tagged = taggedShotReferences(images, shotText)
  const taggedPick = tagged.find((asset) => asset.role === "location") ?? tagged.find((asset) => asset.role !== "character")
  if (taggedPick) return taggedPick
  const words = new Set(shotText.toLowerCase().match(/[a-z0-9]{3,}/g) || [])
  const roleWeight = { location: 3, product: 2, character: 1, wardrobe: 0, lighting: 0 } as const
  const score = (asset: ProductionAsset) =>
    (asset.name.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((word) => words.has(word)).length * 10 + roleWeight[asset.role]
  return [...images].sort((a, b) => score(b) - score(a))[0] ?? tagged[0] ?? null
}

/** Words that say a shot travels somewhere: "push through @image3 into @image2", "arrives at @image5". */
const TRAVEL = /\b(into|onto|toward|towards|through|to|arriv\w*|reveal\w*|ends?|ending|until|lands?)\b/i

/**
 * The image a shot should end on, when its direction travels from one tagged place to another. The
 * last tagged non-character image after a travel word, other than the opening one, becomes the end
 * frame; video models interpolate the camera move between the two. Character sheets never end a shot.
 */
export function selectEndReference(assets: ProductionAsset[], shotText: string, opening: ProductionAsset | null): ProductionAsset | null {
  const images = assets.filter((asset) => asset.mediaType === "image" && asset.role !== "character" && asset.label && asset.url !== opening?.url)
  let best: { asset: ProductionAsset; at: number } | null = null
  for (const asset of images) {
    const at = shotText.search(new RegExp(`${asset.label}(?!\\d)`, "i"))
    if (at < 0 || !TRAVEL.test(shotText.slice(Math.max(0, at - 60), at))) continue
    // The opening tag must come first, or "@image2 ... into @image3" could swap start and end.
    const openingAt = opening?.label ? shotText.search(new RegExp(`${opening.label}(?!\\d)`, "i")) : -1
    if (openingAt >= 0 && openingAt > at) continue
    if (!best || at > best.at) best = { asset, at }
  }
  return best?.asset ?? null
}

/**
 * Rewrites studio tags as plain words before the prompt reaches a video model: "push through @image3
 * toward @image2" becomes "push through the estate location toward the flat location". The images
 * themselves travel as the opening frame and reference set; unknown tags are dropped.
 */
export function resolveReferenceTags(prompt: string, assets: ProductionAsset[]): string {
  const byLabel = new Map(assets.filter((asset) => asset.label).map((asset) => [asset.label!.toLowerCase(), asset]))
  return prompt
    .replace(/@(image|video)(\d+)\b/gi, (tag, _type, _n, offset: number, whole: string) => {
      const asset = byLabel.get(tag.toLowerCase())
      return asset ? describeAsset(asset, /^\s*([,.;:!?)]|$)/.test(whole.slice(offset + tag.length))) : ""
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
}

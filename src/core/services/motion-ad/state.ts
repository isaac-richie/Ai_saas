/**
 * Motion Ad Director: the rules that move an ad through its states (brief: "States"), kept free of I/O
 * so they can be tested on their own. The server actions call these; the UI draws from the state alone.
 */
import type { Plan } from "./contract"

export const AD_STATES = [
  "draft", "planning", "awaiting_assets", "awaiting_approval", "approved",
  "building", "preview_ready", "final_rendering", "done", "failed",
] as const
export type AdState = (typeof AD_STATES)[number]

export type Resolution = "1080p" | "4k"

/**
 * What a final render costs, in Quick video generations. A placeholder until the founder sets prices
 * from the spike's numbers (brief: "Credits, beta limits and watermark"). Planning and previews are free.
 */
export const FINAL_UNITS: Record<Resolution, number> = { "1080p": 2, "4k": 4 }

/** Uploads: what each kind accepts, and the largest file. SVG is refused (it can carry script). */
export const UPLOADS = {
  image: { exts: ["jpg", "jpeg", "png", "webp"], maxBytes: 25 * 1024 * 1024, label: "JPG, PNG or WebP up to 25 MB" },
  logo: { exts: ["png", "webp", "jpg", "jpeg"], maxBytes: 10 * 1024 * 1024, label: "PNG (ideally with a transparent background), WebP or JPG up to 10 MB" },
  voice: { exts: ["mp3", "m4a", "aac", "wav", "ogg"], maxBytes: 40 * 1024 * 1024, label: "MP3, M4A, AAC, WAV or OGG up to 40 MB" },
} as const
export type UploadKind = keyof typeof UPLOADS

/** `<user>/motion-ads/<ad>/<file>.<ext>`: only the owner's own folder for this ad. */
export function isAdUploadPath(path: string, userId: string, adId: string, kind: UploadKind): boolean {
  const m = /^([0-9a-f-]{36})\/motion-ads\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.([a-z0-9]{2,4})$/i.exec(path)
  return Boolean(m && m[1] === userId && m[2] === adId && (UPLOADS[kind].exts as readonly string[]).includes(m[4].toLowerCase()))
}

/** The image tag that belongs to a shot: shot N uses @imageN. */
export const tagForShot = (idx: number) => `@image${idx}`

/** The plan with each shot pointed at its uploaded image (or null while it has none). */
export function withImages(plan: Plan, imageTags: string[]): Plan {
  const have = new Set(imageTags)
  return { ...plan, shots: plan.shots.map((s) => ({ ...s, image_tag: have.has(tagForShot(s.idx)) ? tagForShot(s.idx) : null })) }
}

/** Shots still waiting for an image. */
export const shotsMissingImages = (plan: Plan) => plan.shots.filter((s) => !s.image_tag).map((s) => s.idx)

/** Once a plan exists: waiting for images, or ready to approve. */
export const planState = (plan: Plan): AdState => (shotsMissingImages(plan).length ? "awaiting_assets" : "awaiting_approval")

/** States in which the brief and settings may still change (brief: PATCH only in draft or awaiting_assets). */
export const EDITABLE: AdState[] = ["draft", "awaiting_assets", "awaiting_approval", "failed"]
/** States from which a (re-)plan may start. */
export const PLANNABLE: AdState[] = ["draft", "awaiting_assets", "awaiting_approval", "failed"]
/** States in which assets may be uploaded or replaced. */
export const ASSET_STATES: AdState[] = ["draft", "awaiting_assets", "awaiting_approval", "failed"]

/** Why Approve storyboard can't go ahead yet, in plain words. Empty when it can. */
export function approvalProblems(ad: { state: AdState; plan: Plan | null }, rightsAccepted: boolean): string[] {
  const p: string[] = []
  if (!ad.plan) return ["Plan the storyboard first."]
  if (ad.state !== "awaiting_approval" && ad.state !== "awaiting_assets") p.push("This storyboard isn't waiting for approval.")
  const missing = shotsMissingImages(ad.plan)
  if (missing.length) p.push(`Add ${missing.length === 1 ? "an image" : "images"} for shot${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`)
  if (!rightsAccepted) p.push("Confirm you have the right to use these assets.")
  return p
}

/** Why a final render can't start yet. `shownUnits` is the cost the user saw; a mismatch means the price changed. */
export function finalProblems(ad: { state: AdState }, resolution: Resolution, shownUnits: number): string[] {
  const p: string[] = []
  if (ad.state !== "preview_ready" && ad.state !== "done") p.push("Watch the preview before the final render.")
  if (shownUnits !== FINAL_UNITS[resolution]) p.push(`The cost changed to ${FINAL_UNITS[resolution]} generations. Check it and confirm again.`)
  return p
}

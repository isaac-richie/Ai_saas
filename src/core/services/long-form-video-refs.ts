/**
 * Long Form video references: a clip from the film's library, bound to a shot or the whole scene, that
 * guides how a shot is generated. Pure functions only, so every rule is testable without a database.
 *
 * A reference is guidance, never footage: it is sent to the video model as a real video input, and it is
 * never placed on the export timeline. The pinned clip is a silent cut of exactly the selected range.
 */

export const VIDEO_PURPOSES = ["camera_movement", "subject_movement", "composition", "visual_style", "continuity"] as const
export type VideoPurpose = (typeof VIDEO_PURPOSES)[number]
export const VIDEO_PURPOSE_LABELS: Record<VideoPurpose, string> = {
  camera_movement: "Camera movement", subject_movement: "Subject / action movement", composition: "Composition",
  visual_style: "Visual style", continuity: "Continuity",
}
/** App limits for references, separate from any model's limits (and from the image safety limit). */
export const MAX_VIDEO_REFS_PER_SCOPE = 10
/** Longest range one reference may select; also the longest clip the app will cut. */
export const MAX_VIDEO_REF_CLIP_MS = 30_000
export const MIN_VIDEO_REF_CLIP_MS = 1_000
export const MAX_VIDEO_GUIDANCE_CHARS = 300

/** One saved binding (a row of long_form_video_bindings). */
export type VideoRefBinding = {
  id?: string
  scopeType: "scene" | "shot"
  shotNumber: number | null
  assetId: string
  /** The library video the clip was cut from. */
  sourceUrl: string
  assetName: string
  sourceDurationMs: number
  trimStartMs: number
  trimEndMs: number
  /** The pinned clip: the selected range, silent, with its checksum. This is what the model receives. */
  clipUrl: string
  sha256: string
  byteSize: number
  clipDurationMs: number
  width: number
  height: number
  purpose: VideoPurpose
  guidanceText: string
  anchorTitle?: string
}

/** Identical reference = same source video + same selected range. Sent once, whatever its scopes. */
export const videoRefKey = (b: Pick<VideoRefBinding, "sourceUrl" | "trimStartMs" | "trimEndMs">) => `${b.sourceUrl}|${b.trimStartMs}-${b.trimEndMs}`

/** A required clip after scene + shot are combined. */
export type ResolvedVideoRef = {
  key: string
  clipUrl: string
  sha256: string
  assetId: string
  assetName: string
  clipDurationMs: number
  trimStartMs: number
  trimEndMs: number
  scopes: ("scene" | "shot")[]
  /** Every stated intent for this clip, scene first. Nothing is dropped or ranked. */
  guidance: { purpose: VideoPurpose; text: string; scope: "scene" | "shot" }[]
}

/**
 * effective references = scene ∪ shot, one entry per source + range. When the scene and the shot bind the
 * same range, the clip is sent once and both intents are kept.
 */
export function resolveVideoRefs(sceneBindings: VideoRefBinding[], shotBindings: VideoRefBinding[]): ResolvedVideoRef[] {
  const byKey = new Map<string, ResolvedVideoRef>()
  for (const binding of [...sceneBindings, ...shotBindings]) {
    const key = videoRefKey(binding)
    const intent = { purpose: binding.purpose, text: binding.guidanceText.trim(), scope: binding.scopeType }
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.scopes.includes(binding.scopeType)) existing.scopes.push(binding.scopeType)
      if (!existing.guidance.some(g => g.purpose === intent.purpose && g.text === intent.text)) existing.guidance.push(intent)
      continue
    }
    byKey.set(key, {
      key, clipUrl: binding.clipUrl, sha256: binding.sha256, assetId: binding.assetId, assetName: binding.assetName,
      clipDurationMs: binding.clipDurationMs, trimStartMs: binding.trimStartMs, trimEndMs: binding.trimEndMs,
      scopes: [binding.scopeType], guidance: [intent],
    })
  }
  return [...byKey.values()]
}

const seconds = (ms: number) => `${Number((ms / 1000).toFixed(1))} s`

/** 0 ≤ start < end ≤ source length, within the app's clip limits. Null when the range is usable. */
export function trimRangeIssue(startMs: number, endMs: number, sourceDurationMs: number, name = "This video"): string | null {
  if (![startMs, endMs, sourceDurationMs].every(Number.isFinite) || startMs < 0 || endMs <= startMs) return `${name}: the selected range must start before it ends.`
  if (endMs > sourceDurationMs) return `${name}: the selected range ends after the video does (${seconds(sourceDurationMs)}).`
  if (endMs - startMs < MIN_VIDEO_REF_CLIP_MS) return `${name}: select at least ${seconds(MIN_VIDEO_REF_CLIP_MS)}.`
  if (endMs - startMs > MAX_VIDEO_REF_CLIP_MS) return `${name}: select ${seconds(MAX_VIDEO_REF_CLIP_MS)} or less (${seconds(endMs - startMs)} is selected).`
  return null
}

/** "2 images · 1 video reference" for the shot card and the editor. */
export function mediaCountLabel(images: number, videos: number, audio = 0): string {
  return [
    images ? `${images} image${images === 1 ? "" : "s"}` : "",
    videos ? `${videos} video reference${videos === 1 ? "" : "s"}` : "",
    audio ? `${audio} audio` : "",
  ].filter(Boolean).join(" · ")
}

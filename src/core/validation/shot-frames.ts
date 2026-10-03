import { z } from "zod"

/**
 * Start / End Frames are temporal shot controls, deliberately separate from
 * general Image / Video / Audio media references. A start frame fixes the
 * visual state at time 0; an end frame is the target state at the shot's end.
 */
export const FRAME_SOURCE_TYPES = ["upload", "gallery", "capture", "previous_shot"] as const
export const FRAME_INFLUENCES = ["low", "medium", "high"] as const
export const FRAME_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export const MAX_FRAME_BYTES = 10 * 1024 * 1024

// Same private bucket and owner-scoped path shape as media references.
const framePath = z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/, "Frame files must be stored in your private reference library.")

export const shotFrameSchema = z.object({
  id: z.string().uuid(),
  assetPath: framePath,
  name: z.string().trim().min(1).max(180),
  sourceType: z.enum(FRAME_SOURCE_TYPES),
  sourceShotId: z.string().max(120).nullish(),
  sourceTimestampMs: z.number().int().min(0).max(3_600_000).nullish(),
  sourceLabel: z.string().max(120).nullish(),
  influence: z.enum(FRAME_INFLUENCES).default("medium"),
})
export type ShotFrame = z.infer<typeof shotFrameSchema>

export const shotFramesSchema = z.object({
  start: shotFrameSchema.nullish(),
  end: shotFrameSchema.nullish(),
  transitionDirection: z.string().trim().max(300).nullish(),
}).refine((frames) => !frames.start || !frames.end || frames.start.id !== frames.end.id, "Start and End Frame must be separate frame records.")
export type ShotFrames = z.infer<typeof shotFramesSchema>

export const EMPTY_SHOT_FRAMES: ShotFrames = { start: null, end: null, transitionDirection: "" }

export type FrameCapability = {
  start: boolean
  end: boolean
  /** The provider can only use an end frame together with a start frame. */
  endRequiresStart: boolean
  note: string
}

/**
 * Verified against Kie's provider docs: Kling 3.0 takes image_urls [first, last]
 * and rejects a last frame on its own; Seedance 2 takes first_frame_url and
 * last_frame_url and documents only "first" and "first + last" modes.
 */
export const FRAME_CAPABILITIES: Record<string, FrameCapability> = {
  kling: { start: true, end: true, endRequiresStart: true, note: "Kling uses an End Frame only together with a Start Frame." },
  seedance: { start: true, end: true, endRequiresStart: true, note: "Seedance uses an End Frame only together with a Start Frame." },
}

export function frameCapability(familyId: string | null | undefined): FrameCapability {
  return FRAME_CAPABILITIES[familyId ?? ""] ?? { start: false, end: false, endRequiresStart: true, note: "This model does not accept Start or End Frames. Your references still apply." }
}

export function hasShotFrames(frames: ShotFrames | null | undefined) {
  return Boolean(frames?.start || frames?.end)
}

/** Problems that must be fixed before any credit is reserved. Empty when ready. */
export function frameIssues(frames: ShotFrames | null | undefined, familyId: string | null | undefined): string[] {
  if (!hasShotFrames(frames)) return []
  const capability = frameCapability(familyId)
  const issues: string[] = []
  if (frames?.start && !capability.start) issues.push("The selected model does not accept a Start Frame. Remove it or choose Kling or Seedance.")
  if (frames?.end && !capability.end) issues.push("The selected model does not accept an End Frame. Remove it or choose Kling or Seedance.")
  if (frames?.end && !frames.start && capability.endRequiresStart) issues.push(`${capability.note} Add a Start Frame or remove the End Frame.`)
  return issues
}

const INFLUENCE_PHRASES = {
  start: { low: "loosely open from the start frame's composition", medium: "open on the start frame", high: "open exactly on the start frame, preserving its composition and details" },
  end: { low: "drift toward the end frame's composition", medium: "end on the end frame", high: "land exactly on the end frame, matching its composition and details" },
} as const

/**
 * Providers expose no frame-strength control, so influence is expressed as a
 * prompt directive. Transition direction describes the movement between frames.
 */
export function frameDirective(frames: ShotFrames | null | undefined) {
  if (!hasShotFrames(frames)) return ""
  const parts: string[] = []
  if (frames?.start) parts.push(INFLUENCE_PHRASES.start[frames.start.influence])
  if (frames?.end) parts.push(INFLUENCE_PHRASES.end[frames.end.influence])
  const direction = frames?.transitionDirection?.replace(/\s+/g, " ").trim()
  if (direction) parts.push(`transition: ${direction}`)
  return parts.join("; ")
}

export function validateOwnedFrames(input: unknown, userId: string): ShotFrames {
  const frames = shotFramesSchema.parse(input ?? EMPTY_SHOT_FRAMES)
  for (const frame of [frames.start, frames.end]) {
    if (frame && !frame.assetPath.startsWith(`${userId}/`)) throw new Error("A Start or End Frame belongs to another account. Re-add it from your library.")
  }
  return frames
}

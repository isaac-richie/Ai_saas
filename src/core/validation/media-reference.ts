import { z } from "zod"

export const REFERENCE_BUCKET = "media-references"
export const MAX_REFERENCE_BYTES = 25 * 1024 * 1024
export const REFERENCE_ROLES = {
  image: ["character", "wardrobe", "product", "location", "prop", "branding", "lighting", "style", "framing"],
  video: ["camera movement", "subject movement", "framing", "pacing", "performance", "lip-sync", "full motion"],
  audio: ["voiceover", "dialogue", "music", "effects", "ambience", "timing", "lip-sync"],
} as const
export const REFERENCE_MIME_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/webm"],
} as const
export const referenceAnalysisSchema = z.object({
  guidance: z.string().min(1).max(240),
  observations: z.array(z.string().max(300)).max(6),
  warnings: z.array(z.string().max(300)).max(6),
  limitations: z.string().max(600),
  transcript: z.string().max(12000).nullable(),
})
export const mediaReferenceSchema = z.object({
  id: z.string().uuid(),
  assetPath: z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{2,5}$/),
  name: z.string().min(1).max(180),
  mediaType: z.enum(["image", "video", "audio"]),
  role: z.string().max(32),
  priority: z.enum(["primary", "secondary", "supporting"]),
  influence: z.enum(["low", "medium", "high"]),
  scope: z.enum(["shot", "scene", "project"]),
  projectId: z.string().uuid().nullable(),
  sceneId: z.string().uuid().nullable(),
  locked: z.boolean(),
  target: z.enum(["director", "provider"]),
  applied: z.boolean(),
  duration: z.number().positive().max(600).optional(),
  trimStart: z.number().min(0).max(600).default(0),
  trimEnd: z.number().positive().max(600).optional(),
  volume: z.number().min(0).max(1).default(1),
  analysis: referenceAnalysisSchema.optional(),
}).superRefine((ref, ctx) => {
  if (!(REFERENCE_ROLES[ref.mediaType] as readonly string[]).includes(ref.role)) {
    ctx.addIssue({ code: "custom", path: ["role"], message: "Choose a role for this media type." })
  }
  if (ref.mediaType !== "image" && (!ref.duration || !ref.trimEnd || ref.trimEnd <= ref.trimStart || ref.trimEnd > ref.duration)) {
    ctx.addIssue({ code: "custom", path: ["trimEnd"], message: "Trim end must follow start and fit within the media duration." })
  }
  if (ref.scope !== "shot" && !ref.projectId) ctx.addIssue({ code: "custom", message: "Choose a project before using a shared reference." })
  if (ref.scope === "scene" && !ref.sceneId) ctx.addIssue({ code: "custom", message: "Choose a scene before using a scene reference." })
})
export const mediaReferencesSchema = z.array(mediaReferenceSchema).max(6).refine(
  (refs) => new Set(refs.map((ref) => ref.id)).size === refs.length,
  "Reference IDs must be unique."
)
export const referenceLibrarySchema = z.array(mediaReferenceSchema).max(120).refine(
  (refs) => new Set(refs.map((ref) => ref.id)).size === refs.length,
  "Reference IDs must be unique."
)
export type MediaReference = z.infer<typeof mediaReferenceSchema>

export function referenceIsInContext(ref: MediaReference, projectId: string | null, sceneId: string | null) {
  if (ref.projectId !== projectId) return false
  return ref.scope === "project" || ref.sceneId === sceneId
}

export function referenceCompatibility(refs: MediaReference[]): string[] {
  const active = refs.filter((ref) => ref.applied)
  const issues: string[] = []
  if (refs.length > 6) issues.push("Use up to six references in this context. Remove or narrow the scope of inherited references.")
  if (active.filter((ref) => ref.target === "provider").length > 1) issues.push("The current video adapter accepts only one direct image. Use Director guidance for the other references.")
  for (const ref of active) {
    if (ref.target === "provider" && ref.mediaType !== "image") issues.push(`${ref.name}: direct video/audio conditioning is not wired into this adapter. Choose Director guidance.`)
    if (ref.target === "director" && !ref.analysis) issues.push(`${ref.name}: analyse and approve the guidance before applying.`)
  }
  return issues
}

export function referenceConflicts(refs: MediaReference[]) {
  const roles = new Set<string>()
  const warnings: string[] = []
  for (const ref of refs.filter((item) => item.applied && item.priority === "primary")) {
    if (roles.has(ref.role)) warnings.push(`Multiple primary ${ref.role} references may conflict. Choose one primary or review their guidance.`)
    roles.add(ref.role)
  }
  return warnings
}

export function referencePrompt(refs: MediaReference[]) {
  const rank = { primary: 0, secondary: 1, supporting: 2 }
  return refs.filter((ref) => ref.applied && ref.target === "director" && ref.analysis)
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .map((ref) => `${ref.role} ONLY (${ref.priority}, ${ref.influence}${ref.locked ? ", preserve" : ""}): ${ref.analysis!.guidance}`).join("; ")
}

export function referencePromptFits(subject: string, refs: MediaReference[]) {
  const guidance = referencePrompt(refs)
  // Reserve space for the required duration instruction and clause separators.
  return subject.replace(/\s+/g, " ").trim().length + (guidance ? guidance.length + 24 : 0) + 80 <= 1100
}

export function validateOwnedReferences(input: unknown, userId: string) {
  const result = mediaReferencesSchema.safeParse(input ?? [])
  if (!result.success) throw new Error(result.error.issues[0]?.message || "Invalid references")
  if (result.data.some((ref) => !ref.assetPath.startsWith(`${userId}/`))) throw new Error("Reference access denied.")
  return result.data
}

import { z } from "zod"

export const REFERENCE_BUCKET = "media-references"
export const MAX_REFERENCE_BYTES = 25 * 1024 * 1024
/** Ten assets per reference panel, of any mix of types. */
export const MAX_REFERENCES = 10
export const REFERENCE_ROLES = {
  image: ["character", "wardrobe", "product", "location", "prop", "branding", "lighting", "style", "framing"],
  video: ["camera movement", "subject movement", "framing", "pacing", "performance", "lip-sync", "full motion"],
  audio: ["voiceover", "dialogue", "music", "effects", "ambience", "timing", "lip-sync"],
} as const
/** What each image role controls, so a reference can be held to that job and nothing else. */
export const ROLE_CONTROLS: Record<string, string> = {
  character: "face, body and anatomy",
  wardrobe: "clothing and accessories",
  product: "the product's exact design",
  location: "setting and architecture",
  prop: "the prop's design",
  branding: "logos, brand colours and marks",
  lighting: "lighting palette and direction",
  style: "visual style and colour treatment",
  framing: "composition and framing",
}
/** Roles that describe a subject; when chosen without "location", the reference's background is not a setting. */
const SUBJECT_ROLES = new Set(["character", "wardrobe", "product", "prop", "branding"])
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
  /** Primary role; always equals roles[0] when roles is present (kept for older readers). */
  role: z.string().max(32),
  /** Every job this reference does; one asset may hold several (e.g. character + location). */
  roles: z.array(z.string().max(32)).min(1).max(9).optional(),
  /** Deterministic tag such as @image1, stamped from the full panel order before a generation. */
  label: z.string().regex(/^@(image|video|audio)([1-9]|10)$/).optional(),
  mimeType: z.string().max(80).optional(),
  bytes: z.number().int().positive().max(MAX_REFERENCE_BYTES).optional(),
  createdAt: z.string().max(40).optional(),
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
  manualGuidance: z.string().max(500).optional(),
  analysisUnavailable: z.boolean().optional(),
  analysis: referenceAnalysisSchema.optional(),
}).superRefine((ref, ctx) => {
  const allowed = REFERENCE_ROLES[ref.mediaType] as readonly string[]
  const roles = ref.roles?.length ? ref.roles : [ref.role]
  if (!roles.every((role) => allowed.includes(role))) {
    ctx.addIssue({ code: "custom", path: ["roles"], message: "Choose roles for this media type." })
  }
  if (new Set(roles).size !== roles.length) ctx.addIssue({ code: "custom", path: ["roles"], message: "Each role can be chosen once." })
  if (ref.roles?.length && ref.roles[0] !== ref.role) ctx.addIssue({ code: "custom", path: ["role"], message: "Primary role must match the first selected role." })
  if (ref.mediaType !== "image" && (!ref.duration || !ref.trimEnd || ref.trimEnd <= ref.trimStart || ref.trimEnd > ref.duration)) {
    ctx.addIssue({ code: "custom", path: ["trimEnd"], message: "Trim end must follow start and fit within the media duration." })
  }
  if (ref.scope !== "shot" && !ref.projectId) ctx.addIssue({ code: "custom", message: "Choose a project before using a shared reference." })
  if (ref.scope === "scene" && !ref.sceneId) ctx.addIssue({ code: "custom", message: "Choose a scene before using a scene reference." })
})
export const mediaReferencesSchema = z.array(mediaReferenceSchema).max(MAX_REFERENCES).refine(
  (refs) => new Set(refs.map((ref) => ref.id)).size === refs.length,
  "Reference IDs must be unique."
)
export const referenceLibrarySchema = z.array(mediaReferenceSchema).max(120).refine(
  (refs) => new Set(refs.map((ref) => ref.id)).size === refs.length,
  "Reference IDs must be unique."
)
export type MediaReference = z.infer<typeof mediaReferenceSchema>

/** Every role a reference holds; older references carry a single role. */
export function referenceRoles(ref: Pick<MediaReference, "role" | "roles">): string[] {
  return ref.roles?.length ? ref.roles : [ref.role]
}

/** Sets a reference's roles, keeping the primary role in step. */
export function withRoles<T extends MediaReference>(ref: T, roles: string[]): T {
  const unique = [...new Set(roles)]
  return { ...ref, roles: unique, role: unique[0] ?? ref.role }
}

/**
 * Stamps @image1…, @video1…, @audio1… from the full panel order (stable IDs stay the
 * source of truth; labels re-derive after a removal). Stamp before filtering to applied,
 * so the tags in the prompt match the tags the creator sees.
 */
export function labelReferences<T extends MediaReference>(refs: T[]): T[] {
  const counts = { image: 0, video: 0, audio: 0 }
  return refs.map((ref) => ({ ...ref, label: `@${ref.mediaType}${++counts[ref.mediaType]}` }))
}

/**
 * Applies continuity locks over references: when a lock names a reference for a channel,
 * any other applied reference loses that role (an explicit lock beats an unlocked reference).
 * References left with no role drop out of this generation.
 */
export function resolveLockedRoles<T extends MediaReference>(refs: T[], lockedRoleOwners: Record<string, string>): T[] {
  return refs.map((ref) => {
    if (!ref.applied) return ref
    const roles = referenceRoles(ref).filter((role) => !lockedRoleOwners[role] || lockedRoleOwners[role] === ref.id)
    if (roles.length === referenceRoles(ref).length) return ref
    return roles.length ? withRoles(ref, roles) : { ...ref, applied: false }
  })
}
export function referenceIsInContext(ref: MediaReference, projectId: string | null, sceneId: string | null) {
  if (ref.projectId !== projectId) return false
  return ref.scope === "project" || ref.sceneId === sceneId
}

export function referenceCompatibility(refs: MediaReference[]): string[] {
  const active = refs.filter((ref) => ref.applied)
  const issues: string[] = []
  if (refs.length > MAX_REFERENCES) issues.push(`Use up to ${MAX_REFERENCES} references in this context. Remove one or narrow the scope of inherited references.`)
  if (active.filter((ref) => ref.target === "provider").length > 1) issues.push("The current video adapter accepts only one direct image. Use Director guidance for the other references.")
  for (const ref of active) {
    if (ref.target === "provider" && ref.mediaType !== "image") issues.push(`${ref.name}: direct video/audio conditioning is not wired into this adapter. Choose Director guidance.`)
  }
  return issues
}

/**
 * Where a reference goes when the user continues without analysis. An
 * unanalysed image only reaches the video as the starting frame, so it takes
 * that slot when free; everything else stays as labelled director guidance.
 */
export function continueWithoutAnalysisTarget(ref: MediaReference, refs: MediaReference[]): MediaReference["target"] {
  if (ref.mediaType !== "image") return "director"
  if (ref.target === "provider") return "provider"
  const startingFrameTaken = refs.some((item) => item.id !== ref.id && item.applied && item.target === "provider")
  return startingFrameTaken ? "director" : "provider"
}

export function referenceConflicts(refs: MediaReference[]) {
  const roles = new Set<string>()
  const warnings: string[] = []
  for (const ref of refs.filter((item) => item.applied && item.priority === "primary")) {
    for (const role of referenceRoles(ref)) {
      if (roles.has(role)) warnings.push(`Multiple primary ${role} references may conflict. Choose one primary or review their guidance.`)
      roles.add(role)
    }
  }
  return warnings
}

/** "character (face, body and anatomy) and location (setting and architecture)" */
function describeRoles(ref: MediaReference) {
  const parts = referenceRoles(ref).map((role) => ROLE_CONTROLS[role] && ref.mediaType === "image" ? `${role} (${ROLE_CONTROLS[role]})` : role)
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}

/**
 * The [REFERENCE ROLES] block: one line per applied director reference saying what it
 * controls and that it controls nothing else. A subject-only image is told not to impose
 * its background as the setting.
 */
export function referencePrompt(refs: MediaReference[]) {
  const rank = { primary: 0, secondary: 1, supporting: 2 }
  const fallbackLabels = labelReferences(refs)
  return refs.map((ref, index) => ({ ref, label: ref.label || fallbackLabels[index].label! }))
    .filter(({ ref }) => ref.applied && ref.target === "director")
    .sort((a, b) => Number(!(a.ref.analysis || a.ref.manualGuidance?.trim())) - Number(!(b.ref.analysis || b.ref.manualGuidance?.trim())) || rank[a.ref.priority] - rank[b.ref.priority])
    .map(({ ref, label }) => {
      const source = ref.analysis ? "" : ref.manualGuidance?.trim() ? " (manual)" : " (unanalysed)"
      const fallback = ref.mediaType === "image"
        ? "image not analysed; no visual details inferred; follow written shot direction"
        : ref.mediaType === "video"
        ? "follow only written shot direction; do not infer the source video's content"
        : ref.role === "voiceover" ? "no transcript or voice identity inferred; no audio mix or lip-sync"
          : ref.role === "dialogue" ? "no dialogue inferred; use written lines only; no lip-sync"
            : ref.role === "music" ? "mood only; no beat mapping or audio mix"
              : ref.role === "effects" ? "optional sound-event context; add effects in editing"
                : ref.role === "ambience" ? "optional atmosphere only; no audio mix"
                  : ref.role === "timing" ? "use written timing only; no audio events inferred"
                    : "no lip-sync inferred; use a dedicated lip-sync workflow"
      const direction = ref.analysis?.guidance || ref.manualGuidance?.trim() || fallback
      const roles = referenceRoles(ref)
      const background = ref.mediaType === "image" && !roles.includes("location") && roles.every((role) => SUBJECT_ROLES.has(role)) ? ", not its background" : ""
      const weight = ref.priority === "primary" && ref.influence === "high" ? "" : ` [${ref.priority}, ${ref.influence}]`
      return `${label} defines ${describeRoles(ref)} ONLY${background}${weight}${source}: ${direction}`
    }).join(" ")
}

export function referencePromptBudget(subject: string, refs: MediaReference[]) {
  const limit = 1100
  const guidance = referencePrompt(refs)
  // Reserve room for the reference label, duration directive and separators.
  const used = subject.replace(/\s+/g, " ").trim().length + guidance.length + (guidance ? 30 : 0) + 80
  return { limit, used, overflow: Math.max(0, used - limit) }
}

export function referencePromptFits(subject: string, refs: MediaReference[]) {
  return referencePromptBudget(subject, refs).overflow === 0
}

function shortenAtBoundary(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim()
  if (text.length <= limit) return text
  const candidate = text.slice(0, Math.max(1, limit - 1))
  const sentenceEnd = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "))
  if (sentenceEnd >= limit * 0.5) return candidate.slice(0, sentenceEnd + 1)
  const space = candidate.lastIndexOf(" ")
  return `${(space > limit * 0.5 ? candidate.slice(0, space) : candidate).replace(/[,;:\-–—]+$/, "").trimEnd()}…`
}

/** Readable list of reference names for notices: short names, at most two listed. */
function describeReferences(names: string[]) {
  const short = names.map((name) => name.length > 24 ? `${name.slice(0, 14)}…${name.slice(-7)}` : name)
  if (short.length <= 2) return short.join(" and ")
  return `${short.slice(0, 2).join(", ")} and ${short.length - 2} more ${short.length - 2 === 1 ? "reference" : "references"}`
}

export type PromptFit = {
  subject: string
  references: MediaReference[]
  /** Human-readable notes describing what was condensed; empty when nothing changed. */
  notes: string[]
}

const PRIORITY_RANK = { primary: 0, secondary: 1, supporting: 2 } as const
const INFLUENCE_RANK = { high: 0, medium: 1, low: 2 } as const

/**
 * Fits the shot prompt and applied reference directions inside the adapter's
 * budget instead of refusing to generate. Order protects the creator's words:
 * 1) shorten reference directions, least important first;
 * 2) leave lower-priority references out of the text (files stay attached);
 * 3) only then shorten the shot prompt at a sentence boundary.
 * Deterministic, so the browser preview and the server agree exactly.
 */
export function fitReferencePrompt(subject: string, refs: MediaReference[]): PromptFit {
  let fittedSubject = subject.replace(/\s+/g, " ").trim()
  let fitted = refs.map((ref) => ({ ...ref, analysis: ref.analysis ? { ...ref.analysis } : undefined }))
  const notes: string[] = []
  const fits = () => referencePromptFits(fittedSubject, fitted)
  if (fits()) return { subject: fittedSubject, references: fitted, notes }

  const inPrompt = () => fitted.filter((ref) => ref.applied && ref.target === "director")
  const leastImportantFirst = () => [...inPrompt()].sort((a, b) =>
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || INFLUENCE_RANK[b.influence] - INFLUENCE_RANK[a.influence])
  const directionOf = (ref: MediaReference) => ref.analysis?.guidance || ref.manualGuidance?.trim() || ""
  const setDirection = (ref: MediaReference, value: string) => {
    if (ref.analysis?.guidance) ref.analysis.guidance = value
    else if (ref.manualGuidance?.trim()) ref.manualGuidance = value
  }

  // 1) Condense written directions, least important first.
  const condensed = new Set<string>()
  for (const cap of [140, 80]) {
    for (const ref of leastImportantFirst()) {
      const direction = directionOf(ref)
      if (direction.length <= cap) continue
      setDirection(ref, shortenAtBoundary(direction, cap))
      condensed.add(ref.id)
      if (fits()) break
    }
    if (fits()) break
  }
  if (condensed.size) notes.push(`Condensed ${condensed.size === 1 ? "1 reference direction" : `${condensed.size} reference directions`}.`)

  // 2) Leave lower-priority references out of the text prompt; primaries stay.
  const omitted: string[] = []
  while (!fits()) {
    const candidate = leastImportantFirst().find((ref) => ref.priority !== "primary")
    if (!candidate) break
    fitted = fitted.map((ref) => ref.id === candidate.id ? { ...ref, applied: false } : ref)
    omitted.push(candidate.name)
  }
  if (omitted.length) notes.push(`Left ${describeReferences(omitted)} out of the text prompt; ${omitted.length === 1 ? "the file stays" : "the files stay"} attached.`)

  // 3) Last resort: shorten the shot prompt to whatever room remains.
  if (!fits()) {
    const { overflow } = referencePromptBudget(fittedSubject, fitted)
    const before = fittedSubject.length
    fittedSubject = shortenAtBoundary(fittedSubject, Math.max(60, before - overflow))
    if (!fits()) {
      // Primary directions still too long for the remaining room.
      for (const ref of leastImportantFirst()) setDirection(ref, shortenAtBoundary(directionOf(ref), 40))
    }
    notes.push(`Shortened your shot prompt by ${before - fittedSubject.length} characters to fit the video model.`)
  }
  // 4) Guarantee: never refuse to generate. Keep files attached, text out.
  if (!fits()) {
    const remaining = inPrompt().map((ref) => ref.name)
    fitted = fitted.map((ref) => ref.applied && ref.target === "director" ? { ...ref, applied: false } : ref)
    if (remaining.length) notes.push(`Left ${describeReferences(remaining)} out of the text prompt to make room; the files stay attached.`)
  }
  if (!fits()) fittedSubject = shortenAtBoundary(fittedSubject, referencePromptBudget("", []).limit - referencePromptBudget("", []).used)
  return { subject: fittedSubject, references: fitted, notes }
}

export function validateOwnedReferences(input: unknown, userId: string) {
  const result = mediaReferencesSchema.safeParse(input ?? [])
  if (!result.success) throw new Error(result.error.issues[0]?.message || "Invalid references")
  if (result.data.some((ref) => !ref.assetPath.startsWith(`${userId}/`))) throw new Error("Reference access denied.")
  return result.data
}

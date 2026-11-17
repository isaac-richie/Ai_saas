/**
 * Mimic (beta): turns a recorded performance plus "who or what changes" into one provider request, or
 * says exactly why it can't be sent. Pure functions only, so every rule is testable without a database,
 * a camera or a provider, and the page and the server use the same checks.
 *
 * Nothing here guesses. An assignment the model can't take blocks the request; it is never dropped,
 * merged or split into extra paid passes.
 */

/** The verified endpoint. Limits are from docs.kie.ai/market/kling/v3-omni-transformation (checked 2026-11-14). */
export const MIMIC_CAPABILITY = {
  provider: "kie",
  model: "kling-3.0-omni/transformation",
  label: "Kling 3.0 Omni",
  minClipMs: 3_000,
  maxClipMs: 15_500,
  minSide: 700,
  maxSide: 4_553,
  maxPixels: 8_294_400,
  /** Reference images and multi-image subjects share these slots. */
  maxReferenceSlots: 4,
  /** A subject built from several views needs this many images. */
  subjectMinImages: 2,
  subjectMaxImages: 4,
  resolutions: ["720p", "1080p"] as const,
  aspectRatios: ["16:9", "9:16", "1:1"] as const,
  maxPromptChars: 3_072,
} as const

export type MimicResolution = (typeof MIMIC_CAPABILITY.resolutions)[number]
export type MimicAudioPolicy = "keep_source" | "mute"
export type MimicTargetType = "person" | "object"

/** App limits, separate from the model's. */
export const MAX_MIMIC_ASSIGNMENTS = 6
export const MAX_MIMIC_SOURCE_MS = 30_000
export const MAX_MIMIC_INSTRUCTION_CHARS = 1_500
export const MAX_MIMIC_TARGET_CHARS = 200
export const MAX_MIMIC_CHANGE_CHARS = 400

/** One change: one person or object in the take, and what it becomes. */
export type MimicAssignment = {
  id: string
  /** The creator's name for it: "Sam", "My product". */
  label: string
  targetType: MimicTargetType
  /** Who or what in the take, in the creator's words. The model finds the subject from this. */
  target: string
  /** Reference images of what it becomes. */
  referenceUrls: string[]
  /** Optional extra direction for this change only. */
  instructions: string
}

export type MimicSource = { durationMs: number; width: number; height: number; hasAudio: boolean; url: string }

export type MimicSettings = {
  source: MimicSource
  trimStartMs: number
  trimEndMs: number
  assignments: MimicAssignment[]
  instructions: string
  audioPolicy: MimicAudioPolicy
  resolution: MimicResolution
}

export type MimicStatus = "ready" | "queued" | "generating" | "completed" | "failed" | "unknown"
/** Plain words for each state. No percentages: the provider reports none. */
export const MIMIC_STATUS_LABELS: Record<MimicStatus, string> = {
  ready: "Ready to generate", queued: "Queued", generating: "Generating", completed: "Completed", failed: "Failed",
  unknown: "Couldn't confirm it started",
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim()
const secs = (ms: number) => `${Number((ms / 1000).toFixed(1))} s`
const isJpgOrPng = (url: string) => /\.(jpe?g|png)(?:$|\?)/i.test(url)

/** Allowance units for one take: one per 10 seconds started, the same rule as Create. */
export function mimicUnits(clipMs: number): number {
  return Math.max(1, Math.ceil(clipMs / 10_000))
}

/** The output shape the model offers that is closest to the take. */
export function mimicAspect(width: number, height: number): (typeof MIMIC_CAPABILITY.aspectRatios)[number] {
  const ratio = width / height
  return ratio > 1.3 ? "16:9" : ratio < 0.77 ? "9:16" : "1:1"
}

/** What the source must be for this model, checked on the prepared file. */
export function mimicSourceIssues(source: Pick<MimicSource, "width" | "height">): string[] {
  const cap = MIMIC_CAPABILITY
  const issues: string[] = []
  if (Math.min(source.width, source.height) < cap.minSide) issues.push(`The take is ${source.width}×${source.height}; ${cap.label} needs each side to be at least ${cap.minSide} pixels.`)
  if (Math.max(source.width, source.height) > cap.maxSide || source.width * source.height > cap.maxPixels) issues.push(`The take is ${source.width}×${source.height}, which is larger than ${cap.label} accepts.`)
  return issues
}

/** The selected part of the take must exist and fit the model. */
export function mimicTrimIssues(startMs: number, endMs: number, sourceMs: number): string[] {
  const cap = MIMIC_CAPABILITY
  if (![startMs, endMs, sourceMs].every(Number.isFinite) || startMs < 0 || endMs <= startMs) return ["The selected part of the take must start before it ends."]
  if (endMs > sourceMs) return [`The selected part ends after the take does (${secs(sourceMs)}).`]
  const length = endMs - startMs
  if (length < cap.minClipMs) return [`${secs(length)} is selected; ${cap.label} needs at least ${secs(cap.minClipMs)}. Record a longer take or select more of it.`]
  if (length > cap.maxClipMs) return [`${secs(length)} is selected; ${cap.label} takes at most ${secs(cap.maxClipMs)} per take. Shorten the selection in Advanced.`]
  return []
}

/** How one assignment travels: as a named multi-view subject, as a single reference image, or as words only. */
export type MimicRoute = { kind: "subject"; name: string } | { kind: "image"; index: number } | { kind: "text" }

export type MimicManifestEntry = {
  assignmentId: string
  label: string
  targetType: MimicTargetType
  target: string
  route: MimicRoute["kind"]
  /** Where each reference image sits in the request. */
  fields: { url: string; field: string }[]
}

export type MimicPlan = {
  provider: string
  model: string
  /** The provider input, complete except for the clip URL, which is filled in at submission. */
  input: Record<string, unknown>
  prompt: string
  manifest: MimicManifestEntry[]
  units: number
  clipMs: number
  aspectRatio: string
  /** Every reference image and the field it must appear at. */
  required: { field: string; url: string }[]
}

export type MimicPlanResult = { ok: true; plan: MimicPlan } | { ok: false; issues: string[] }

export const MULTI_SUBJECT_UNVERIFIED = "Changing more than one person or object in a single take hasn't been verified on this model yet, so it is switched off. Your changes are saved. Keep one change to generate now."

/**
 * Builds the one request for a take, or the reasons it can't be sent. `multiSubject` is off until
 * simultaneous changes have been proven on the model; with it off, more than one change blocks.
 */
export function planMimicRequest(settings: MimicSettings, options: { multiSubject?: boolean } = {}): MimicPlanResult {
  const cap = MIMIC_CAPABILITY
  const issues: string[] = [...mimicSourceIssues(settings.source), ...mimicTrimIssues(settings.trimStartMs, settings.trimEndMs, settings.source.durationMs)]
  const assignments = settings.assignments
  if (!assignments.length && !clean(settings.instructions)) issues.push("Add a person or object to change, or describe the change you want.")
  if (assignments.length > MAX_MIMIC_ASSIGNMENTS) issues.push(`A take can hold ${MAX_MIMIC_ASSIGNMENTS} changes. Remove ${assignments.length - MAX_MIMIC_ASSIGNMENTS}.`)
  if (assignments.length > 1 && !options.multiSubject) issues.push(MULTI_SUBJECT_UNVERIFIED)
  if (!cap.resolutions.includes(settings.resolution)) issues.push(`${cap.label} makes 720p or 1080p video.`)

  const seenTargets = new Map<string, string>()
  let slots = 0
  let images = 0
  let subjects = 0
  const routes: MimicRoute[] = []
  for (const [index, a] of assignments.entries()) {
    const name = clean(a.label) || `Change ${index + 1}`
    const target = clean(a.target)
    if (!target) issues.push(`${name}: say who or what in your take this changes, for example "the man on the left" or "the bottle on the table".`)
    else {
      const other = seenTargets.get(target.toLowerCase())
      // Two changes for the same subject would leave the model to pick one; the creator must choose.
      if (other) issues.push(`${name} and ${other} both point at "${target}". Each change needs its own person or object.`)
      else seenTargets.set(target.toLowerCase(), name)
    }
    const refs = [...new Set(a.referenceUrls)]
    if (refs.length !== a.referenceUrls.length) issues.push(`${name}: the same reference image is added twice.`)
    if (!refs.length && !clean(a.instructions)) issues.push(`${name}: add a reference image, or describe the change.`)
    if (refs.length > cap.subjectMaxImages) issues.push(`${name} has ${refs.length} reference images; ${cap.label} takes at most ${cap.subjectMaxImages} for one person or object.`)
    if (refs.some(url => !isJpgOrPng(url))) issues.push(`${name}: reference images must be JPG or PNG.`)
    if (refs.length >= cap.subjectMinImages) { routes.push({ kind: "subject", name: `subject_${subjects + 1}` }); subjects += 1; slots += 1 }
    else if (refs.length === 1) { routes.push({ kind: "image", index: images }); images += 1; slots += 1 }
    else routes.push({ kind: "text" })
  }
  if (slots > cap.maxReferenceSlots) issues.push(`${slots} changes use reference images; ${cap.label} accepts ${cap.maxReferenceSlots} in one take. Remove ${slots - cap.maxReferenceSlots}, or describe some in words instead.`)

  // The prompt names every change in order and asks for everything else to stay as performed.
  const lines: string[] = [
    "Transform this video. Keep the original performance exactly: every movement, gesture, facial expression, the timing, the camera motion and the framing stay the same. Everything not listed below stays as it is.",
  ]
  const imageUrls: string[] = []
  const elements: { name: string; description: string; element_input_urls: string[] }[] = []
  const manifest: MimicManifestEntry[] = []
  for (const [index, a] of assignments.entries()) {
    const route = routes[index]
    const target = clean(a.target) || "the subject"
    const refs = [...new Set(a.referenceUrls)]
    const extra = clean(a.instructions)
    const noun = a.targetType === "person" ? "person" : "object"
    const fields: MimicManifestEntry["fields"] = []
    let becomes: string
    if (route.kind === "subject") {
      const at = elements.length
      elements.push({ name: route.name, description: `${clean(a.label) || noun}: reference views of the same ${noun}`.slice(0, 200), element_input_urls: refs })
      refs.forEach((url, i) => fields.push({ url, field: `elements[${at}].element_input_urls[${i}]` }))
      becomes = `replace ${target} with @${route.name}`
    } else if (route.kind === "image") {
      imageUrls.push(refs[0])
      fields.push({ url: refs[0], field: `image_urls[${route.index}]` })
      becomes = `replace ${target} with the ${noun} shown in reference image ${route.index + 1}`
    } else {
      becomes = `change ${target}`
    }
    lines.push(`Change ${index + 1}: ${becomes}${a.targetType === "person" ? ", keeping that person's movements and expressions" : ", keeping its position and how it is handled"}.${extra ? ` ${extra.replace(/[.\s]+$/, "")}.` : ""}`)
    manifest.push({ assignmentId: a.id, label: clean(a.label) || `Change ${index + 1}`, targetType: a.targetType, target, route: route.kind, fields })
  }
  const overall = clean(settings.instructions)
  if (overall) lines.push(`Also: ${overall.replace(/[.\s]+$/, "")}.`)
  const prompt = lines.join("\n")
  if (prompt.length > cap.maxPromptChars) issues.push(`The instructions are ${prompt.length - cap.maxPromptChars} characters too long for ${cap.label}. Shorten them.`)

  if (issues.length) return { ok: false, issues: [...new Set(issues)] }
  const clipMs = settings.trimEndMs - settings.trimStartMs
  const aspectRatio = imageUrls.length ? mimicAspect(settings.source.width, settings.source.height) : "auto"
  const input: Record<string, unknown> = {
    prompt, resolution: settings.resolution, aspect_ratio: aspectRatio,
    // The model makes no sound when given a video; the take's own sound is laid back afterwards if kept.
    audio: false,
    ...(imageUrls.length ? { image_urls: imageUrls } : {}),
    ...(elements.length ? { elements } : {}),
  }
  return {
    ok: true,
    plan: {
      provider: cap.provider, model: cap.model, input, prompt, manifest, units: mimicUnits(clipMs), clipMs, aspectRatio,
      required: manifest.flatMap(entry => entry.fields.map(f => ({ field: f.field, url: f.url }))),
    },
  }
}

/** Reads a path like `elements[1].element_input_urls[0]` from a provider input. */
function readField(input: Record<string, unknown>, path: string): unknown {
  let value: unknown = input
  for (const part of path.split(".")) {
    const m = /^([a-z_]+)(?:\[(\d+)\])?$/i.exec(part)
    if (!m || value === null || typeof value !== "object") return undefined
    value = (value as Record<string, unknown>)[m[1]]
    if (m[2] !== undefined) value = Array.isArray(value) ? value[Number(m[2])] : undefined
  }
  return value
}

/** Last check on the exact payload: every reference must be at its field. Empty is the only pass. */
export function mimicMissingFromPayload(input: Record<string, unknown>, required: { field: string; url: string }[]): { field: string; url: string }[] {
  return required.filter(r => readField(input, r.field) !== r.url)
}

/** What the creator approves before anything is spent. */
export function mimicSummary(settings: MimicSettings, plan: MimicPlan): string[] {
  const changes = plan.manifest.map(m => `${m.target} → ${m.label}${m.route === "text" ? " (described in words)" : ""}`)
  return [
    `Take: ${secs(plan.clipMs)} of your recording, ${settings.resolution}.`,
    changes.length ? `Changes: ${changes.join("; ")}.` : "Changes: as described in your instructions.",
    "Kept: the performance, timing, camera and everything not listed.",
    settings.audioPolicy === "mute" ? "Sound: the result is silent."
      : settings.source.hasAudio ? "Sound: your take's own sound is kept. The new look does not change the voice, and lips may not match perfectly."
        : "Sound: your take has no sound, so the result is silent.",
    `Cost: ${plan.units} generation${plan.units === 1 ? "" : "s"}.`,
    "Saved as a new take. Your recording is not changed.",
  ]
}

/** Reads the provider's task record. `state` is pending until it is success or fail. */
export function parseMimicRecord(record: unknown): { state: "pending" } | { state: "fail"; message: string } | { state: "success"; url: string } {
  if (!record || typeof record !== "object") return { state: "pending" }
  const r = record as { state?: unknown; resultJson?: unknown; failMsg?: unknown }
  if (r.state === "fail") return { state: "fail", message: (typeof r.failMsg === "string" && r.failMsg ? r.failMsg : "The model could not make this take.").slice(0, 300) }
  if (r.state !== "success") return { state: "pending" }
  let parsed: unknown = r.resultJson
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed) } catch { parsed = null } }
  const urls = parsed && typeof parsed === "object" ? (parsed as { resultUrls?: unknown }).resultUrls : null
  const url = Array.isArray(urls) ? urls.find((u): u is string => typeof u === "string" && /^https:\/\//.test(u)) : undefined
  return url ? { state: "success", url } : { state: "fail", message: "The model finished without returning a video." }
}

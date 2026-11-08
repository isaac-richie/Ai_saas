/**
 * Long Form mandatory image locks (spec v1.2): resolve scene + shot bindings, count them, check them
 * against the exact deployed endpoint, and map EVERY binding to a real image field of the request.
 *
 * Pure functions only, so each rule is testable without a database or a provider. Nothing here
 * truncates, substitutes, describes-instead-of-sends or switches models: when a set cannot be sent
 * whole, planning returns issues and generation is blocked.
 */

export const LOCK_ROLES = ["character", "wardrobe", "location", "prop", "start_frame", "end_frame"] as const
export type LockRole = (typeof LOCK_ROLES)[number]
export const LOCK_ROLE_LABELS: Record<LockRole, string> = {
  character: "Character", wardrobe: "Wardrobe", location: "Location", prop: "Prop", start_frame: "Start frame", end_frame: "End frame",
}

/** One saved binding (a row of long_form_reference_bindings). */
export type LockBinding = {
  id?: string
  scopeType: "scene" | "shot"
  shotNumber: number | null
  assetId: string
  /** The pinned version: an immutable storage object plus its checksum. */
  assetUrl: string
  sha256: string
  assetName: string
  contentType: "image/jpeg" | "image/png" | "image/webp"
  byteSize: number
  width: number
  height: number
  role: LockRole
  entityLabel: string
  viewLabel: string
}

/** A required binding after scene + shot are combined; `scopes` says where it came from. */
export type ResolvedBinding = LockBinding & { key: string; scopes: ("scene" | "shot")[] }

export type ResolvedLocks = {
  bindings: ResolvedBinding[]
  /** Distinct pinned image versions (asset url + checksum). */
  imageKeys: string[]
  requiredImageCount: number
  bindingCount: number
}

const norm = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase()
export const imageKey = (b: Pick<LockBinding, "assetUrl" | "sha256">) => `${b.assetUrl}#${b.sha256}`
/** Identical binding = same image version + role + entity (spec §4). Distinct roles/entities stay. */
export const bindingKey = (b: Pick<LockBinding, "assetUrl" | "sha256" | "role" | "entityLabel">) => `${imageKey(b)}|${b.role}|${norm(b.entityLabel)}`

/**
 * required_bindings = scene ∪ shot (deduplicated by version + role + entity, scope attribution kept);
 * required_images = distinct asset versions. Shot locks add to scene locks; they never remove them.
 */
export function resolveLocks(sceneBindings: LockBinding[], shotBindings: LockBinding[]): ResolvedLocks {
  const byKey = new Map<string, ResolvedBinding>()
  for (const binding of [...sceneBindings, ...shotBindings]) {
    const key = bindingKey(binding)
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.scopes.includes(binding.scopeType)) existing.scopes.push(binding.scopeType)
      // Keep the more specific view label if the scene copy had none.
      if (!existing.viewLabel && binding.viewLabel) existing.viewLabel = binding.viewLabel
      continue
    }
    byKey.set(key, { ...binding, key, scopes: [binding.scopeType] })
  }
  const bindings = [...byKey.values()]
  const imageKeys = [...new Set(bindings.map(imageKey))]
  return { bindings, imageKeys, requiredImageCount: imageKeys.length, bindingCount: bindings.length }
}

// ── Capability registry ──────────────────────────────────────────────────────────────────────────
// Exact Kie endpoints and modes, from docs.kie.ai (checked 2026-11-08). Nothing is inferred from a
// family label: an endpoint not listed here fails closed for locked generation.

type Format = LockBinding["contentType"]
export type EndpointCapability = {
  key: string
  label: string
  /** Start frame / end frame support (end needs a start). */
  frames: { start: boolean; end: boolean; formats: Format[] }
  references:
    | { kind: "elements"; maxElements: number; minPerElement: number; maxPerElement: number; formats: Format[]; maxBytes: number; withFrames: true }
    | { kind: "images"; max: number; formats: Format[]; maxBytes: number; minSide: number; maxSide: number; minAspect: number; maxAspect: number; withFrames: false }
}

const MB = 1024 * 1024
export const ENDPOINT_CAPABILITIES: Record<string, EndpointCapability> = {
  // docs.kie.ai/market/kling/kling-3-0 — single-shot pro (what the app sends).
  "kie:kling-3.0/video:pro": {
    key: "kie:kling-3.0/video:pro",
    label: "Kling 3.0 Pro",
    frames: { start: true, end: true, formats: ["image/jpeg", "image/png", "image/webp"] },
    references: { kind: "elements", maxElements: 3, minPerElement: 2, maxPerElement: 4, formats: ["image/jpeg", "image/png"], maxBytes: 10 * MB, withFrames: true },
  },
  // docs.kie.ai/market/bytedance/seedance-2-5 — references are exclusive with first/last frames.
  "kie:bytedance/seedance-2-5": {
    key: "kie:bytedance/seedance-2-5",
    label: "Seedance 2.5",
    frames: { start: true, end: true, formats: ["image/jpeg", "image/png", "image/webp"] },
    references: { kind: "images", max: 30, formats: ["image/jpeg", "image/png", "image/webp"], maxBytes: 30 * MB, minSide: 300, maxSide: 6000, minAspect: 0.4, maxAspect: 2.5, withFrames: false },
  },
}

/** The capability key for what the app would submit, or null when it is not a verified endpoint. */
export function endpointKeyFor(model: string): string | null {
  const slug = model.trim().toLowerCase()
  if (slug === "kling-3.0/video") return "kie:kling-3.0/video:pro"
  if (slug === "bytedance/seedance-2-5") return "kie:bytedance/seedance-2-5"
  return null
}

// ── Planning: every binding → an actual request field ────────────────────────────────────────────

/** Where one binding goes in the provider payload. `field` is a path into the provider input. */
export type ManifestEntry = { bindingKey: string; assetUrl: string; sha256: string; role: LockRole; entityLabel: string; viewLabel: string; field: string }

export type LockedRequestPlan = {
  endpoint: string
  startFrameUrl: string | null
  endFrameUrl: string | null
  /** Kling elements (each one subject, 2–4 images). */
  elements: { name: string; description: string; image_urls: string[] }[]
  /** Seedance reference images. */
  referenceImageUrls: string[]
  manifest: ManifestEntry[]
  /** One line for the prompt naming what each reference is. */
  promptNote: string
}

export type PlanResult = { ok: true; plan: LockedRequestPlan } | { ok: false; issues: string[] }

/**
 * Builds the exact inputs for one shot, or says why it cannot be sent whole. `continuityStartUrl` is
 * the previous take's last frame the app normally opens a continued shot on (not a lock).
 */
export function planLockedRequest(resolved: ResolvedLocks, model: string, options: { continuityStartUrl?: string | null } = {}): PlanResult {
  const endpointKey = endpointKeyFor(model)
  if (!endpointKey) return { ok: false, issues: [`Locked images can't be sent to ${model || "this model"}: it isn't a verified endpoint. Choose Kling 3.0 Pro or Seedance 2.5.`] }
  const cap = ENDPOINT_CAPABILITIES[endpointKey]
  const issues: string[] = []
  const starts = resolved.bindings.filter(b => b.role === "start_frame")
  const ends = resolved.bindings.filter(b => b.role === "end_frame")
  const refs = resolved.bindings.filter(b => b.role !== "start_frame" && b.role !== "end_frame")

  const distinct = (list: ResolvedBinding[]) => [...new Map(list.map(b => [imageKey(b), b])).values()]
  const startImages = distinct(starts)
  const endImages = distinct(ends)
  if (startImages.length > 1) issues.push(`${startImages.length} different start frames are locked. A shot can open on only one; keep one start frame.`)
  if (endImages.length > 1) issues.push(`${endImages.length} different end frames are locked. A shot can end on only one; keep one end frame.`)
  for (const frame of [...startImages, ...endImages]) {
    if (!cap.frames.formats.includes(frame.contentType)) issues.push(`${frame.assetName} is a ${frame.contentType.replace("image/", "").toUpperCase()} file, which ${cap.label} can't take as a frame.`)
  }
  const startUrl = startImages[0]?.assetUrl ?? null
  const endUrl = endImages[0]?.assetUrl ?? null
  const opening = startUrl ?? options.continuityStartUrl ?? null
  if (endUrl && !opening) issues.push(`An end frame needs a start frame on ${cap.label}. Lock a start frame too, or remove the end frame.`)

  const manifest: ManifestEntry[] = []
  const entry = (b: ResolvedBinding, field: string): ManifestEntry => ({ bindingKey: b.key, assetUrl: b.assetUrl, sha256: b.sha256, role: b.role, entityLabel: b.entityLabel, viewLabel: b.viewLabel, field })
  for (const b of starts) if (startUrl) manifest.push(entry(b, cap.references.kind === "elements" ? "image_urls[0]" : "first_frame_url"))
  for (const b of ends) if (endUrl) manifest.push(entry(b, cap.references.kind === "elements" ? "image_urls[1]" : "last_frame_url"))

  const elements: LockedRequestPlan["elements"] = []
  const referenceImageUrls: string[] = []
  const describe = (b: ResolvedBinding) => [b.entityLabel || null, b.viewLabel || null].filter(Boolean).join(" / ")
  const noteParts: string[] = []

  if (refs.length && cap.references.kind === "elements") {
    const r = cap.references
    // One element per subject: role + entity. An image without an entity is its own subject.
    const groups = new Map<string, ResolvedBinding[]>()
    for (const b of refs) {
      const gk = `${b.role}|${norm(b.entityLabel) || `#${imageKey(b)}`}`
      groups.set(gk, [...(groups.get(gk) ?? []), b])
    }
    const used = new Map<string, string>()
    for (const b of refs) {
      if (!r.formats.includes(b.contentType)) issues.push(`${b.assetName} is a ${b.contentType.replace("image/", "").toUpperCase()} file. ${cap.label} references must be JPG or PNG.`)
      if (b.byteSize > r.maxBytes) issues.push(`${b.assetName} is over ${r.maxBytes / MB} MB, the ${cap.label} limit for a reference image.`)
    }
    if (groups.size > r.maxElements) issues.push(`${groups.size} locked subjects need ${groups.size} reference elements; ${cap.label} accepts ${r.maxElements}. Remove subjects or switch to Seedance 2.5.`)
    let index = 0
    for (const group of groups.values()) {
      const images = distinct(group)
      const head = group[0]
      const subject = `${LOCK_ROLE_LABELS[head.role]}${head.entityLabel ? ` ${head.entityLabel}` : ` (${head.assetName})`}`
      if (images.length < r.minPerElement) issues.push(`${subject} has ${images.length} image; ${cap.label} needs ${r.minPerElement} to ${r.maxPerElement} images of the same subject for each reference. Add another view with the same entity label, or switch to Seedance 2.5.`)
      if (images.length > r.maxPerElement) issues.push(`${subject} has ${images.length} images; ${cap.label} takes at most ${r.maxPerElement} per subject.`)
      for (const img of images) {
        const k = imageKey(img)
        if (used.has(k) && used.get(k) !== subject) issues.push(`${img.assetName} is locked for two subjects (${used.get(k)} and ${subject}). ${cap.label} can't verify one image serving two references; give each subject its own images.`)
        used.set(k, subject)
      }
      // Kling binds elements by @name; the app's element names are reference_set_1..3.
      const name = `reference_set_${index + 1}`
      elements.push({ name, description: `${subject}: ${images.map(describe).filter(Boolean).join(", ") || "reference views"}`.slice(0, 500), image_urls: images.map(img => img.assetUrl) })
      for (const b of group) manifest.push(entry(b, `kling_elements[${index}].element_input_urls[${images.findIndex(img => imageKey(img) === imageKey(b))}]`))
      noteParts.push(`@${name} is ${subject}${images.length > 1 ? ` (${images.length} views of the same ${head.role === "character" ? "person" : "subject"})` : ""}`)
      index += 1
    }
  }

  if (refs.length && cap.references.kind === "images") {
    const r = cap.references
    if (startUrl || endUrl) issues.push(`${cap.label} can't combine locked reference images with a locked start or end frame. Remove the frame locks, or switch to Kling 3.0 Pro.`)
    else if (options.continuityStartUrl) issues.push(`This shot continues from the previous shot's last frame, and ${cap.label} can't combine that with reference images. Switch this shot to Kling 3.0 Pro, or lock its images on a shot that starts fresh.`)
    const images = distinct(refs)
    if (images.length > r.max) issues.push(`${images.length} required images; ${cap.label} accepts ${r.max} reference images.`)
    for (const img of images) {
      if (!r.formats.includes(img.contentType)) issues.push(`${img.assetName} is a format ${cap.label} can't take as a reference.`)
      if (img.byteSize > r.maxBytes) issues.push(`${img.assetName} is over ${r.maxBytes / MB} MB.`)
      if (Math.min(img.width, img.height) < r.minSide || Math.max(img.width, img.height) > r.maxSide) issues.push(`${img.assetName} is ${img.width}×${img.height}; ${cap.label} needs each side between ${r.minSide} and ${r.maxSide} pixels.`)
      const aspect = img.width / img.height
      if (aspect <= r.minAspect || aspect >= r.maxAspect) issues.push(`${img.assetName} is too ${aspect < 1 ? "tall" : "wide"} for ${cap.label} (shape must be between ${r.minAspect} and ${r.maxAspect}).`)
      referenceImageUrls.push(img.assetUrl)
    }
    // Seedance references are role-free inputs, so one image can serve several bindings at one index.
    for (const b of refs) manifest.push(entry(b, `reference_image_urls[${referenceImageUrls.indexOf(b.assetUrl)}]`))
    images.forEach((img, i) => noteParts.push(`reference image ${i + 1} is ${refs.filter(b => imageKey(b) === imageKey(img)).map(b => `${LOCK_ROLE_LABELS[b.role].toLowerCase()}${b.entityLabel ? ` ${b.entityLabel}` : ""}${b.viewLabel ? ` (${b.viewLabel})` : ""}`).join(" and ")}`))
  }

  if (issues.length) return { ok: false, issues: [...new Set(issues)] }
  // Every binding must have a place. If one does not, that is a bug: fail closed.
  const placed = new Set(manifest.map(m => m.bindingKey))
  const unplaced = resolved.bindings.filter(b => !placed.has(b.key))
  if (unplaced.length) return { ok: false, issues: [`${unplaced.length} locked image${unplaced.length === 1 ? "" : "s"} could not be placed in the request. Nothing was submitted.`] }

  const people = new Set(refs.filter(b => b.role === "character" && b.entityLabel).map(b => norm(b.entityLabel)))
  const promptNote = [
    noteParts.length ? `Reference images: ${noteParts.join("; ")}.` : "",
    people.size > 1 ? `Show exactly one of each named person (${[...people].join(", ")}).` : "",
  ].filter(Boolean).join(" ")
  return { ok: true, plan: { endpoint: endpointKey, startFrameUrl: startUrl, endFrameUrl: endUrl, elements, referenceImageUrls, manifest, promptNote } }
}

// ── Final payload check (the adapter's last line of defence) ─────────────────────────────────────

/** Reads a path like `kling_elements[1].element_input_urls[0]` from a provider input. */
export function readField(input: Record<string, unknown>, path: string): unknown {
  let value: unknown = input
  for (const part of path.split(".")) {
    const m = /^([a-z_]+)(?:\[(\d+)\])?$/i.exec(part)
    if (!m || value === null || typeof value !== "object") return undefined
    value = (value as Record<string, unknown>)[m[1]]
    if (m[2] !== undefined) value = Array.isArray(value) ? value[Number(m[2])] : undefined
  }
  return value
}

/**
 * Every manifest entry must be present at its field with its (possibly re-hosted) URL. Returns the
 * entries that are missing or substituted; an empty list is the only passing result.
 */
export function missingFromPayload(input: Record<string, unknown>, required: { field: string; url: string }[]): { field: string; url: string }[] {
  return required.filter(r => readField(input, r.field) !== r.url)
}

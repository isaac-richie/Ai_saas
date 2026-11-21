"use server"

import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { BETA_LOCKED_MESSAGE, hasBetaAccess } from "@/core/services/beta-access"
import { getBillingSnapshotForUser, reserveUsageQuota, settleUsageQuota } from "@/core/services/billing"
import { probeMedia } from "@/core/services/media-probe"
import { probeImage } from "@/core/utils/image-probe"
import { requireMediaRuntime } from "@/core/utils/security/media-runtime"
import { checkRateLimit } from "@/core/utils/security/rate-limit"
import { MOTION_AD_ENABLED } from "@/core/config/feature-flags"
import { validatePlan, type Plan } from "@/core/services/motion-ad/contract"
import { imageWarnings } from "@/core/services/motion-ad/moves"
import { planStoryboard } from "@/core/services/motion-ad/planner"
import { openAiPlanModel } from "@/core/services/motion-ad/openai-model"
import { applyVoice, retime, voiceProblem } from "@/core/services/motion-ad/timing"
import {
  ASSET_STATES, EDITABLE, FINAL_UNITS, PLANNABLE, UPLOADS, approvalProblems, finalProblems, isAdUploadPath, planState, tagForShot, withImages,
  type AdState, type Resolution, type UploadKind,
} from "@/core/services/motion-ad/state"

/**
 * Motion Ad Director (Phase 1). One ad moves through the brief's states: plan the storyboard, add the
 * images and voice, approve, preview, then the final render. Renders run on the separate render worker
 * (motion-ads/worker.mjs), which picks up queued jobs.
 */

type Db = Awaited<ReturnType<typeof createClient>>
type Result<T> = { data?: T; error?: string; needsRights?: boolean; needsUpgrade?: boolean }

const NOT_READY = "Motion ads need a database update (migration 0060)."
const OFF = "Motion ads aren't switched on yet."
const missingTable = (e: { code?: string; message?: string } | null) => Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /motion_ad/.test(e.message ?? "")))
const publicUrl = (bucket: string, path: string | null) => (path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${bucket}/${path}` : null)
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex")

type AdRow = {
  id: string; user_id: string; state: AdState; failed_from: string | null; brief: string; length_s: 10 | 15 | 20; aspect: "16:9" | "9:16"
  resolution: Resolution; plan: Plan | null; notice: string | null; rights_accepted_at: string | null; current_version: number; created_at: string; updated_at: string
}
type AssetRow = { id: string; kind: UploadKind | "music"; tag: string | null; storage_path: string; mime: string; byte_size: number; width: number | null; height: number | null; duration_s: number | null }
type VersionRow = { id: string; n: number; aspect: string; preview_path: string | null; final_path: string | null; silent_path: string | null; stem_path: string | null; final_resolution: Resolution | null; watermark: boolean; created_at: string }
type JobRow = { id: string; type: "preview" | "final"; state: string; attempt: number; error_message: string | null; created_at: string }

export type MotionAdView = {
  id: string
  state: AdState
  failedFrom: string | null
  brief: string
  lengthS: 10 | 15 | 20
  aspect: "16:9" | "9:16"
  resolution: Resolution
  plan: Plan | null
  notice: string | null
  rightsAcceptedAt: string | null
  images: { tag: string; url: string; width: number | null; height: number | null }[]
  voice: { url: string; durationS: number } | null
  logo: { url: string } | null
  /** "Image too small" chips for the chosen resolution. */
  warnings: { shot: number; tag: string; message: string; maxResolution: string }[]
  versions: { n: number; previewUrl: string | null; finalUrl: string | null; silentUrl: string | null; stemUrl: string | null; finalResolution: Resolution | null; watermark: boolean }[]
  job: { type: "preview" | "final"; state: string; attempt: number; error: string | null } | null
  finalUnits: Record<Resolution, number>
  updatedAt: string
}

async function session() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  return { db, user }
}

async function loadAd(db: Db, userId: string, id: string) {
  const { data, error } = await db.from("motion_ads").select("*").eq("id", id).eq("user_id", userId).maybeSingle()
  if (missingTable(error)) return { error: NOT_READY }
  return { ad: (data as AdRow | null) ?? null }
}

async function view(db: Db, ad: AdRow): Promise<MotionAdView> {
  const [{ data: assets }, { data: versions }, { data: jobs }] = await Promise.all([
    db.from("motion_ad_assets").select("*").eq("ad_id", ad.id),
    db.from("motion_ad_versions").select("*").eq("ad_id", ad.id).order("n", { ascending: false }),
    db.from("motion_ad_jobs").select("id,type,state,attempt,error_message,created_at").eq("ad_id", ad.id).order("created_at", { ascending: false }).limit(1),
  ])
  const rows = (assets ?? []) as AssetRow[]
  const images = rows.filter((a) => a.kind === "image" && a.tag).map((a) => ({ tag: a.tag!, url: publicUrl("elements", a.storage_path)!, width: a.width, height: a.height }))
  const voice = rows.find((a) => a.kind === "voice")
  const logo = rows.find((a) => a.kind === "logo")
  const output = ad.aspect === "9:16"
    ? (ad.resolution === "4k" ? { width: 2160, height: 3840 } : { width: 1080, height: 1920 })
    : (ad.resolution === "4k" ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 })
  const job = ((jobs ?? []) as JobRow[])[0]
  return {
    id: ad.id, state: ad.state, failedFrom: ad.failed_from, brief: ad.brief, lengthS: ad.length_s, aspect: ad.aspect, resolution: ad.resolution,
    plan: ad.plan, notice: ad.notice, rightsAcceptedAt: ad.rights_accepted_at,
    images, voice: voice ? { url: publicUrl("elements", voice.storage_path)!, durationS: Number(voice.duration_s) } : null,
    logo: logo ? { url: publicUrl("elements", logo.storage_path)! } : null,
    warnings: ad.plan ? imageWarnings(ad.plan.shots, images.map((i) => ({ tag: i.tag, width: i.width ?? 1, height: i.height ?? 1 })), output) : [],
    versions: ((versions ?? []) as VersionRow[]).map((v) => ({
      n: v.n, previewUrl: publicUrl("renders", v.preview_path), finalUrl: publicUrl("renders", v.final_path), silentUrl: publicUrl("renders", v.silent_path),
      stemUrl: publicUrl("renders", v.stem_path), finalResolution: v.final_resolution, watermark: v.watermark,
    })),
    job: job ? { type: job.type, state: job.state, attempt: job.attempt, error: job.error_message } : null,
    finalUnits: FINAL_UNITS,
    updatedAt: ad.updated_at,
  }
}

/** Move an ad on only if it is still in the state we read (two tabs or a double click can't both win). */
async function transition(db: Db, ad: AdRow, patch: Partial<AdRow>): Promise<AdRow | null> {
  const { data } = await db.from("motion_ads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", ad.id).eq("state", ad.state).select("*").maybeSingle()
  return (data as AdRow | null) ?? null
}

async function gate() {
  if (!MOTION_AD_ENABLED) return { error: OFF } as const
  const { db, user } = await session()
  if (!user) return { error: "Please sign in again." } as const
  if (!(await hasBetaAccess(user.email))) return { error: BETA_LOCKED_MESSAGE } as const
  return { db, user } as const
}

// ── Create, edit, read ──────────────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  brief: z.string().trim().max(2000).default(""),
  lengthS: z.union([z.literal(10), z.literal(15), z.literal(20)]).default(15),
  aspect: z.enum(["16:9", "9:16"]).default("16:9"),
  resolution: z.enum(["1080p", "4k"]).default("1080p"),
})

export async function createMotionAd(input: unknown): Promise<Result<MotionAdView>> {
  const g = await gate(); if ("error" in g) return { error: g.error }
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { error: "Check the brief and settings." }
  if (!checkRateLimit(`motion-create:${g.user.id}`, { max: 10, windowMs: 60_000 }).allowed) return { error: "Please wait a moment before starting another ad." }
  const { data, error } = await g.db.from("motion_ads").insert({ user_id: g.user.id, brief: parsed.data.brief, length_s: parsed.data.lengthS, aspect: parsed.data.aspect, resolution: parsed.data.resolution }).select("*").single()
  if (missingTable(error)) return { error: NOT_READY }
  if (error || !data) return { error: "Couldn't start the ad. Try again." }
  return { data: await view(g.db, data as AdRow) }
}

export async function updateMotionAd(input: unknown): Promise<Result<MotionAdView>> {
  const g = await gate(); if ("error" in g) return { error: g.error }
  const parsed = settingsSchema.partial().extend({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Check the brief and settings." }
  const loaded = await loadAd(g.db, g.user.id, parsed.data.id)
  if ("error" in loaded) return { error: loaded.error }
  const ad = loaded.ad
  if (!ad) return { error: "That ad is no longer available." }
  if (!EDITABLE.includes(ad.state)) return { error: "The brief can't change while the ad is being built." }
  const patch: Partial<AdRow> = {}
  if (parsed.data.brief !== undefined) patch.brief = parsed.data.brief
  if (parsed.data.aspect) patch.aspect = parsed.data.aspect
  if (parsed.data.resolution) patch.resolution = parsed.data.resolution
  if (parsed.data.lengthS) {
    patch.length_s = parsed.data.lengthS
    // Without a voice, the Length setting sets the times; with one, the voice still wins.
    const { data: voice } = await g.db.from("motion_ad_assets").select("id").eq("ad_id", ad.id).eq("kind", "voice").maybeSingle()
    if (ad.plan && !voice) patch.plan = { ...ad.plan, total_s: parsed.data.lengthS, shots: retime(ad.plan.shots, parsed.data.lengthS) }
  }
  const next = await transition(g.db, ad, patch)
  if (!next) return { error: "The ad changed in another tab. Reload to see the latest." }
  return { data: await view(g.db, next) }
}

export async function getMotionAd(id: string): Promise<Result<MotionAdView>> {
  if (!z.string().uuid().safeParse(id).success) return { error: "Choose an ad." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in again." }
  const loaded = await loadAd(db, user.id, id)
  if ("error" in loaded) return { error: loaded.error }
  if (!loaded.ad) return { error: "That ad is no longer available." }
  return { data: await view(db, loaded.ad) }
}

export async function listMotionAds(): Promise<Result<{ id: string; brief: string; state: AdState; updatedAt: string }[]>> {
  const { db, user } = await session()
  if (!user) return { error: "Please sign in again." }
  const { data, error } = await db.from("motion_ads").select("id,brief,state,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20)
  if (missingTable(error)) return { error: NOT_READY }
  if (error) return { error: "Couldn't load your motion ads." }
  return { data: (data ?? []).map((r) => ({ id: r.id as string, brief: r.brief as string, state: r.state as AdState, updatedAt: r.updated_at as string })) }
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Plan storyboard: works with no images. The planning AI returns validated JSON (one retry on an invalid
 * reply). If the retry fails too, the plan fails and nothing is charged; planning is free in Phase 1.
 */
export async function planMotionAd(input: unknown): Promise<Result<MotionAdView>> {
  const g = await gate(); if ("error" in g) return { error: g.error }
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose an ad." }
  const loaded = await loadAd(g.db, g.user.id, parsed.data.id)
  if ("error" in loaded) return { error: loaded.error }
  const ad = loaded.ad
  if (!ad) return { error: "That ad is no longer available." }
  if (!PLANNABLE.includes(ad.state)) return { error: "This ad is already being planned or built." }
  if (ad.brief.trim().length < 8) return { error: "Describe the product, who it's for and what viewers should do next." }
  if (!checkRateLimit(`motion-plan:${g.user.id}`, { max: 6, windowMs: 10 * 60_000 }).allowed) return { error: "You've planned several storyboards in a row. Wait a few minutes, then try again." }
  const planning = await transition(g.db, ad, { state: "planning", notice: null, failed_from: null })
  if (!planning) return { error: "This ad is already being planned." }

  const { data: assetRows } = await g.db.from("motion_ad_assets").select("*").eq("ad_id", ad.id)
  const assets = (assetRows ?? []) as AssetRow[]
  const imageTags = assets.filter((a) => a.kind === "image" && a.tag).map((a) => a.tag!)
  let result
  try {
    result = await planStoryboard(openAiPlanModel(), { text: ad.brief, lengthS: ad.length_s, aspect: ad.aspect, imageTags }, ad.id)
  } catch (cause) {
    console.error("Motion ad plan failed", { adId: ad.id, error: cause instanceof Error ? cause.message.slice(0, 300) : "unknown" })
    result = { ok: false as const, errors: ["The planning assistant couldn't be reached."], attempts: 0, charge: false as const }
  }
  if (!result.ok) {
    await transition(g.db, planning, { state: "failed", failed_from: "planning", notice: "The storyboard couldn't be planned this time. Nothing was charged; try again." })
    return { error: "The storyboard couldn't be planned this time. Nothing was charged; try again." }
  }
  // Times follow the voice when there is one, otherwise the Length setting; shots point at their images.
  const voice = assets.find((a) => a.kind === "voice")
  const timed = voice
    ? applyVoice(result.plan, Number(voice.duration_s), ad.length_s)
    : { plan: { ...result.plan, total_s: ad.length_s, shots: retime(result.plan.shots, ad.length_s) }, note: null }
  const plan = withImages(timed.plan, imageTags)
  const done = await transition(g.db, planning, { state: planState(plan), plan, notice: timed.note ?? (plan.warnings.length ? plan.warnings.join(" ") : null) })
  if (!done) return { error: "The ad changed in another tab. Reload to see the latest." }
  return { data: await view(g.db, done) }
}

// ── Assets ──────────────────────────────────────────────────────────────────────────────────────

const assetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["image", "logo", "voice"]),
  storagePath: z.string().max(400),
  tag: z.string().regex(/^@image([1-9]|10)$/).optional(),
})

async function voiceSeconds(bytes: Uint8Array, ext: string): Promise<number | { error: string }> {
  let ffmpeg: string
  try { ffmpeg = await requireMediaRuntime() } catch { return { error: "Voice checks are unavailable right now. Nothing was saved." } }
  const dir = await mkdtemp(join(tmpdir(), "motion-voice-"))
  try {
    const file = join(dir, `voice.${ext}`)
    await writeFile(file, bytes)
    const info = await probeMedia(ffmpeg, file).catch(() => null)
    if (!info?.hasAudio || !(info.durationSec > 0)) return { error: "That file isn't a recording we can play." }
    return info.durationSec
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Registers an upload after reading the real file: images and logos by their bytes (type and pixel size),
 * the voice by its playable length, which then sets every shot time. A new upload replaces the old one.
 */
export async function registerMotionAsset(input: unknown): Promise<Result<MotionAdView>> {
  const g = await gate(); if ("error" in g) return { error: g.error }
  const parsed = assetSchema.safeParse(input)
  if (!parsed.success) return { error: "Upload the file again." }
  const { id, kind, storagePath, tag } = parsed.data
  if (!checkRateLimit(`motion-asset:${g.user.id}`, { max: 30, windowMs: 60_000 }).allowed) return { error: "Please wait a moment before adding more files." }
  const loaded = await loadAd(g.db, g.user.id, id)
  if ("error" in loaded) return { error: loaded.error }
  const ad = loaded.ad
  if (!ad) return { error: "That ad is no longer available." }
  if (!ASSET_STATES.includes(ad.state)) return { error: "Files can't change while the ad is being built." }
  if (!isAdUploadPath(storagePath, g.user.id, ad.id, kind)) return { error: `Use ${UPLOADS[kind].label}.` }
  if (kind === "image") {
    if (!tag) return { error: "Choose which shot this image is for." }
    if (ad.plan && !ad.plan.shots.some((s) => tagForShot(s.idx) === tag)) return { error: "That shot isn't in the storyboard." }
  }
  const { data: blob, error: dlError } = await g.db.storage.from("elements").download(storagePath)
  if (dlError || !blob) return { error: "The upload didn't finish. Try again." }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!bytes.byteLength) return { error: "That file is empty." }
  if (bytes.byteLength > UPLOADS[kind].maxBytes) return { error: `That file is too large. Use ${UPLOADS[kind].label}.` }

  const ext = storagePath.split(".").pop()!.toLowerCase()
  const row: Record<string, unknown> = { ad_id: ad.id, user_id: g.user.id, kind, tag: kind === "image" ? tag : null, storage_path: storagePath, byte_size: bytes.byteLength, sha256: sha256(bytes) }
  if (kind === "voice") {
    const seconds = await voiceSeconds(bytes, ext)
    if (typeof seconds !== "number") return { error: seconds.error }
    const problem = voiceProblem(seconds)
    if (problem) return { error: problem }
    Object.assign(row, { mime: `audio/${ext === "mp3" ? "mpeg" : ext === "m4a" ? "mp4" : ext}`, duration_s: Math.round(seconds * 1000) / 1000 })
  } else {
    const probe = probeImage(bytes)
    if (!probe) return { error: `That isn't an image we can read. Use ${UPLOADS[kind].label}.` }
    Object.assign(row, { mime: probe.contentType, width: probe.width, height: probe.height })
  }

  // Replace any earlier file for the same shot (or the same voice or logo slot).
  const existing = kind === "image"
    ? await g.db.from("motion_ad_assets").select("id,storage_path").eq("ad_id", ad.id).eq("tag", tag!).maybeSingle()
    : await g.db.from("motion_ad_assets").select("id,storage_path").eq("ad_id", ad.id).eq("kind", kind).maybeSingle()
  if (existing.data) {
    await g.db.from("motion_ad_assets").delete().eq("id", existing.data.id)
    if (existing.data.storage_path !== storagePath) await g.db.storage.from("elements").remove([existing.data.storage_path])
  }
  const { error: insertError } = await g.db.from("motion_ad_assets").insert(row)
  if (missingTable(insertError)) return { error: NOT_READY }
  if (insertError) return { error: "Couldn't save the file. Try again." }

  // The storyboard follows the files: images fill their shots; the voice re-times every shot.
  let patch: Partial<AdRow> = {}
  if (ad.plan) {
    const { data: all } = await g.db.from("motion_ad_assets").select("kind,tag").eq("ad_id", ad.id)
    let plan = withImages(ad.plan, (all ?? []).filter((a) => a.kind === "image" && a.tag).map((a) => a.tag as string))
    let notice = ad.notice
    if (kind === "voice") {
      const timed = applyVoice(plan, Number(row.duration_s), ad.length_s)
      plan = timed.plan
      notice = timed.note
    }
    const keep = ad.state === "draft" || ad.state === "failed" ? ad.state : planState(plan)
    patch = { plan, notice, state: keep }
  }
  const next = Object.keys(patch).length ? await transition(g.db, ad, patch) : ad
  if (!next) return { error: "The ad changed in another tab. Reload to see the latest." }
  return { data: await view(g.db, next) }
}

// ── Approve, preview, final ─────────────────────────────────────────────────────────────────────

const keySchema = z.string().min(8).max(80)

/** Approve storyboard: only with the rights box ticked and every shot's image in. Starts the preview build. */
export async function approveMotionAd(input: unknown): Promise<Result<MotionAdView>> {
  const g = await gate(); if ("error" in g) return { error: g.error }
  const parsed = z.object({ id: z.string().uuid(), rightsAccepted: z.boolean(), idempotencyKey: keySchema }).safeParse(input)
  if (!parsed.success) return { error: "Try approving again." }
  const loaded = await loadAd(g.db, g.user.id, parsed.data.id)
  if ("error" in loaded) return { error: loaded.error }
  const ad = loaded.ad
  if (!ad) return { error: "That ad is no longer available." }
  // A repeated click finds its own job and returns the current state.
  const { data: repeat } = await g.db.from("motion_ad_jobs").select("id").eq("user_id", g.user.id).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle()
  if (repeat) return { data: await view(g.db, ad) }
  const problems = approvalProblems(ad, parsed.data.rightsAccepted)
  if (problems.length) return { error: problems.join(" "), needsRights: !parsed.data.rightsAccepted }
  const { data: voice } = await g.db.from("motion_ad_assets").select("duration_s").eq("ad_id", ad.id).eq("kind", "voice").maybeSingle()
  const check = validatePlan(ad.plan, voice ? { voiceS: ad.plan!.total_s } : {})
  if (!check.ok) return { error: `The storyboard needs a fresh plan: ${check.errors[0]}` }

  const n = ad.current_version + 1
  const approved = await transition(g.db, ad, { state: "approved", rights_accepted_at: new Date().toISOString(), current_version: n })
  if (!approved) return { error: "The ad changed in another tab. Reload to see the latest." }
  const { data: version, error: vError } = await g.db.from("motion_ad_versions").insert({ ad_id: ad.id, user_id: g.user.id, n, plan: ad.plan, aspect: ad.aspect, watermark: true }).select("id").single()
  const { error: jError } = version
    ? await g.db.from("motion_ad_jobs").insert({ ad_id: ad.id, user_id: g.user.id, version_id: version.id, type: "preview", idempotency_key: parsed.data.idempotencyKey, resolution: "1080p" })
    : { error: vError }
  if (vError || jError) {
    await transition(g.db, approved, { state: "failed", failed_from: "building", notice: "The preview couldn't be queued. Nothing was charged; try again." })
    return { error: "The preview couldn't be queued. Nothing was charged; try again." }
  }
  const building = await transition(g.db, approved, { state: "building" })
  return { data: await view(g.db, building ?? approved) }
}

/**
 * Final render: the user saw the cost (shownUnits) and confirmed. Credits are held first, charged when the
 * file is stored and refunded if the render fails. Not enough credits stops here, before any compute.
 */
export async function requestFinalRender(input: unknown): Promise<Result<MotionAdView>> {
  const g = await gate(); if ("error" in g) return { error: g.error }
  const parsed = z.object({ id: z.string().uuid(), resolution: z.enum(["1080p", "4k"]), shownUnits: z.number().int().min(0), idempotencyKey: keySchema }).safeParse(input)
  if (!parsed.success) return { error: "Confirm the final render again." }
  const loaded = await loadAd(g.db, g.user.id, parsed.data.id)
  if ("error" in loaded) return { error: loaded.error }
  const ad = loaded.ad
  if (!ad) return { error: "That ad is no longer available." }
  const { data: repeat } = await g.db.from("motion_ad_jobs").select("id").eq("user_id", g.user.id).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle()
  if (repeat) return { data: await view(g.db, ad) }
  const problems = finalProblems(ad, parsed.data.resolution, parsed.data.shownUnits)
  if (problems.length) return { error: problems.join(" ") }
  const { data: version } = await g.db.from("motion_ad_versions").select("id").eq("ad_id", ad.id).eq("n", ad.current_version).maybeSingle()
  if (!version) return { error: "Build the preview first." }

  const units = FINAL_UNITS[parsed.data.resolution]
  const reservationId = crypto.randomUUID()
  const quota = await reserveUsageQuota(g.db, g.user.id, "fast_video", reservationId, units)
  if (!quota.allowed) return { error: quota.message || "You don't have enough generations for this render.", needsUpgrade: true }
  const billing = await getBillingSnapshotForUser(g.db, g.user.id).catch(() => null)
  const paid = billing?.planCode === "studio_pro"
  const rendering = await transition(g.db, ad, { state: "final_rendering", resolution: parsed.data.resolution })
  const { error: jError } = rendering
    ? await g.db.from("motion_ad_jobs").insert({ ad_id: ad.id, user_id: g.user.id, version_id: version.id, type: "final", idempotency_key: parsed.data.idempotencyKey, resolution: parsed.data.resolution, reservation_id: reservationId, units })
    : { error: { message: "changed" } }
  if (!rendering || jError) {
    await settleUsageQuota(g.user.id, reservationId, false)
    if (rendering) await transition(g.db, rendering, { state: ad.state })
    return { error: "The final render couldn't be queued. Your generations were returned; try again." }
  }
  await g.db.from("motion_ad_versions").update({ watermark: !paid, final_resolution: parsed.data.resolution }).eq("id", version.id)
  return { data: await view(g.db, rendering) }
}

/** After a failure: planning goes back to the storyboard; a failed preview is queued again; a failed final asks to confirm the cost again. */
export async function retryMotionAd(input: unknown): Promise<Result<MotionAdView>> {
  const g = await gate(); if ("error" in g) return { error: g.error }
  const parsed = z.object({ id: z.string().uuid(), idempotencyKey: keySchema }).safeParse(input)
  if (!parsed.success) return { error: "Try again." }
  const loaded = await loadAd(g.db, g.user.id, parsed.data.id)
  if ("error" in loaded) return { error: loaded.error }
  const ad = loaded.ad
  if (!ad) return { error: "That ad is no longer available." }
  if (ad.state !== "failed") return { data: await view(g.db, ad) }
  if (ad.failed_from === "building") {
    const { data: version } = await g.db.from("motion_ad_versions").select("id").eq("ad_id", ad.id).eq("n", ad.current_version).maybeSingle()
    if (!version) return { error: "Approve the storyboard again." }
    const { error } = await g.db.from("motion_ad_jobs").insert({ ad_id: ad.id, user_id: g.user.id, version_id: version.id, type: "preview", idempotency_key: parsed.data.idempotencyKey, resolution: "1080p" })
    if (error && error.code !== "23505") return { error: "Couldn't queue the preview. Try again." }
    const next = await transition(g.db, ad, { state: "building", failed_from: null, notice: null })
    return { data: await view(g.db, next ?? ad) }
  }
  const back: AdState = ad.failed_from === "final_rendering" ? "preview_ready" : ad.plan ? planState(ad.plan) : "draft"
  const next = await transition(g.db, ad, { state: back, failed_from: null })
  return { data: await view(g.db, next ?? ad) }
}

/** Deletes the ad, its uploads and its renders. */
export async function deleteMotionAd(input: unknown): Promise<Result<{ deleted: true }>> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose an ad." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in again." }
  const loaded = await loadAd(db, user.id, parsed.data.id)
  if ("error" in loaded) return { error: loaded.error }
  if (!loaded.ad) return { data: { deleted: true } }
  if (loaded.ad.state === "final_rendering" || loaded.ad.state === "building") return { error: "Wait for the render to finish, then delete the ad." }
  const [{ data: assets }, { data: versions }] = await Promise.all([
    db.from("motion_ad_assets").select("storage_path").eq("ad_id", loaded.ad.id),
    db.from("motion_ad_versions").select("preview_path,final_path,silent_path,stem_path").eq("ad_id", loaded.ad.id),
  ])
  const uploads = (assets ?? []).map((a) => a.storage_path as string)
  const renders = (versions ?? []).flatMap((v) => [v.preview_path, v.final_path, v.silent_path, v.stem_path]).filter((p): p is string => Boolean(p))
  const { error } = await db.from("motion_ads").delete().eq("id", loaded.ad.id).eq("user_id", user.id)
  if (error) return { error: "Couldn't delete the ad. Try again." }
  if (uploads.length) await db.storage.from("elements").remove(uploads)
  if (renders.length) await db.storage.from("renders").remove(renders)
  return { data: { deleted: true } }
}

"use server"

import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { createKieMimicTask, getKieMimicTask } from "@/infrastructure/ai/kie-mimic"
import { resolveKieApiKey } from "@/core/services/kie-key"
import { reserveUsageQuota, settleUsageQuota } from "@/core/services/billing"
import { requireMediaRuntime } from "@/core/utils/security/media-runtime"
import { fetchPublicBytes } from "@/core/utils/security/safe-fetch"
import { checkRateLimit } from "@/core/utils/security/rate-limit"
import { ownsAssetUrl } from "@/core/validation/production-assets"
import { fetchBounded } from "@/core/services/long-form-video-store"
import { saveFastVideoClipToGallery } from "@/core/actions/fast-video"
import {
  MAX_MIMIC_ASSIGNMENTS, MAX_MIMIC_CHANGE_CHARS, MAX_MIMIC_INSTRUCTION_CHARS, MAX_MIMIC_SOURCE_MS, MAX_MIMIC_TARGET_CHARS, MIMIC_CAPABILITY,
  mimicMissingFromPayload, parseMimicRecord, planMimicRequest,
  type MimicAssignment, type MimicAudioPolicy, type MimicResolution, type MimicSettings, type MimicStatus,
} from "@/core/services/mimic"
import { MAX_MIMIC_FILE_BYTES, MAX_MIMIC_UPLOAD_BYTES, MIMIC_BUCKET, cutMimicClip, finishMimicResult, prepareMimicSource } from "@/core/services/mimic-media"
import { MIMIC_ENABLED, MIMIC_MULTI_SUBJECT_ENABLED } from "@/core/config/feature-flags"

const MIGRATION = "Mimic needs a database update (migration 0055). Nothing was saved."
const OFF = "Mimic is turned off."
/** How long an unconfirmed submission is held before it can be released, so it is never paid for twice. */
const AMBIGUOUS_HOLD_MS = 10 * 60 * 1000
const MAX_GENERATING = 2

type Result<T> = { data?: T; error?: string; issues?: string[] }
type Db = Awaited<ReturnType<typeof createClient>>

type Row = {
  id: string; user_id: string; status: MimicStatus; title: string; source_origin: "recorded" | "uploaded" | "library"; source_path: string; source_url: string
  source_sha256: string; source_duration_ms: number; source_width: number; source_height: number; source_has_audio: boolean
  trim_start_ms: number; trim_end_ms: number; assignments: unknown; instructions: string; audio_policy: MimicAudioPolicy; resolution: MimicResolution
  provider_task_id: string | null; reservation_id: string | null; cost_units: number | null; manifest: Record<string, unknown> | null
  sent_path: string | null; result_path: string | null; result_url: string | null; error_message: string | null; parent_task_id: string | null
  submitted_at: string | null; completed_at: string | null; created_at: string
}

/** One take as the page sees it. */
export type MimicTaskView = {
  id: string
  status: MimicStatus
  title: string
  source: { origin: Row["source_origin"]; url: string; durationMs: number; width: number; height: number; hasAudio: boolean }
  trimStartMs: number
  trimEndMs: number
  assignments: MimicAssignment[]
  instructions: string
  audioPolicy: MimicAudioPolicy
  resolution: MimicResolution
  costUnits: number | null
  resultUrl: string | null
  errorMessage: string | null
  parentTaskId: string | null
  submittedAt: string | null
  createdAt: string
}

const assignmentSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().max(60).default(""),
  targetType: z.enum(["person", "object"]),
  target: z.string().trim().max(MAX_MIMIC_TARGET_CHARS).default(""),
  referenceUrls: z.array(z.string().url().max(2000)).max(MIMIC_CAPABILITY.subjectMaxImages),
  instructions: z.string().trim().max(MAX_MIMIC_CHANGE_CHARS).default(""),
})
const assignmentsSchema = z.array(assignmentSchema).max(MAX_MIMIC_ASSIGNMENTS)

const toView = (row: Row): MimicTaskView => {
  const parsed = assignmentsSchema.safeParse(row.assignments)
  return {
    id: row.id, status: row.status, title: row.title,
    source: { origin: row.source_origin, url: row.source_url, durationMs: row.source_duration_ms, width: row.source_width, height: row.source_height, hasAudio: row.source_has_audio },
    trimStartMs: row.trim_start_ms, trimEndMs: row.trim_end_ms, assignments: parsed.success ? parsed.data : [], instructions: row.instructions,
    audioPolicy: row.audio_policy, resolution: row.resolution, costUnits: row.cost_units, resultUrl: row.result_url, errorMessage: row.error_message,
    parentTaskId: row.parent_task_id, submittedAt: row.submitted_at, createdAt: row.created_at,
  }
}

const toSettings = (view: MimicTaskView): MimicSettings => ({
  source: { durationMs: view.source.durationMs, width: view.source.width, height: view.source.height, hasAudio: view.source.hasAudio, url: view.source.url },
  trimStartMs: view.trimStartMs, trimEndMs: view.trimEndMs, assignments: view.assignments, instructions: view.instructions,
  audioPolicy: view.audioPolicy, resolution: view.resolution,
})

const missingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /mimic_tasks/.test(error.message ?? "")))

async function session() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  return { db, user }
}

/** A finished video in the creator's own My videos storage. */
function ownsRenderUrl(url: string, userId: string) {
  try {
    const target = new URL(url)
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    return target.origin === base.origin && target.pathname.startsWith(`/storage/v1/object/public/renders/${userId}/`) && !target.search && !target.pathname.includes("..")
  } catch { return false }
}

async function ownedTask(db: Db, userId: string, taskId: string): Promise<Row | null> {
  const { data } = await db.from("mimic_tasks").select("*").eq("id", taskId).eq("user_id", userId).maybeSingle()
  return (data as Row | null) ?? null
}

const publicUrl = (db: Db, path: string) => db.storage.from(MIMIC_BUCKET).getPublicUrl(path).data.publicUrl

/** The creator's takes, newest first. */
export async function listMimicTasks(): Promise<Result<{ tasks: MimicTaskView[]; multiSubject: boolean; available: boolean }>> {
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const { data, error } = await db.from("mimic_tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40)
  if (missingTable(error)) return { data: { tasks: [], multiSubject: MIMIC_MULTI_SUBJECT_ENABLED, available: false } }
  if (error) return { error: "Could not load your Mimic takes." }
  return { data: { tasks: ((data ?? []) as Row[]).map(toView), multiSubject: MIMIC_MULTI_SUBJECT_ENABLED, available: true } }
}

const sourceSchema = z.object({
  url: z.string().url().max(2000),
  name: z.string().trim().min(1).max(160),
  origin: z.enum(["recorded", "uploaded", "library"]),
})

/**
 * Turns a recording into a take. The file is decoded to confirm it is a video, prepared as an MP4 the
 * model accepts, and saved beside the original. Nothing is generated and nothing is charged here.
 */
export async function createMimicTask(input: unknown): Promise<Result<MimicTaskView>> {
  if (!MIMIC_ENABLED) return { error: OFF }
  const parsed = sourceSchema.safeParse(input)
  if (!parsed.success) return { error: "Record or upload the take again." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  if (!checkRateLimit(`mimic-source:${user.id}`, { max: 8, windowMs: 60_000 }).allowed) return { error: "Please wait a moment before adding another take." }
  const { url, name, origin } = parsed.data
  // Recordings and uploads come from the creator's own folder; a library pick from their own videos.
  if (!(ownsAssetUrl(url, user.id) || (origin === "library" && ownsRenderUrl(url, user.id)))) return { error: "Choose a video from your own account." }

  let ffmpeg: string
  try { ffmpeg = await requireMediaRuntime() } catch { return { error: "Video processing is unavailable right now. Your recording is unchanged; try again shortly." } }
  let prepared
  try {
    const bytes = await fetchBounded(url, name, MAX_MIMIC_UPLOAD_BYTES)
    prepared = await prepareMimicSource(ffmpeg, bytes, MAX_MIMIC_SOURCE_MS)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That video could not be prepared." }
  }
  if (prepared.durationMs < MIMIC_CAPABILITY.minClipMs) return { error: `That take is ${(prepared.durationMs / 1000).toFixed(1)} seconds. Record at least ${MIMIC_CAPABILITY.minClipMs / 1000} seconds.` }

  const path = `${user.id}/mimic/${crypto.randomUUID()}.mp4`
  const { error: uploadError } = await db.storage.from(MIMIC_BUCKET).upload(path, prepared.bytes, { contentType: "video/mp4", upsert: false })
  if (uploadError) return { error: "The take could not be saved. Try again." }
  const { data, error } = await db.from("mimic_tasks").insert({
    user_id: user.id, status: "ready", title: name.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 160) || "Mimic take", source_origin: origin,
    source_path: path, source_url: publicUrl(db, path), source_sha256: prepared.sha256, source_duration_ms: prepared.durationMs,
    source_width: prepared.width, source_height: prepared.height, source_has_audio: prepared.hasAudio,
    trim_start_ms: 0, trim_end_ms: Math.min(prepared.durationMs, MIMIC_CAPABILITY.maxClipMs),
  }).select("*").single()
  if (error || !data) {
    // A take that failed to save must not linger as a usable file.
    await db.storage.from(MIMIC_BUCKET).remove([path]).catch(() => undefined)
    return { error: missingTable(error) ? MIGRATION : "The take could not be saved. Try again." }
  }
  return { data: toView(data as Row) }
}

const settingsSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  trimStartMs: z.number().int().min(0).max(3_600_000),
  trimEndMs: z.number().int().min(1).max(3_600_000),
  assignments: assignmentsSchema,
  instructions: z.string().trim().max(MAX_MIMIC_INSTRUCTION_CHARS).default(""),
  audioPolicy: z.enum(["keep_source", "mute"]),
  resolution: z.enum(MIMIC_CAPABILITY.resolutions),
})

/** Saves a take's settings. Saving never depends on the model: a blocked combination is still saved. */
export async function saveMimicTask(input: unknown): Promise<Result<MimicTaskView>> {
  if (!MIMIC_ENABLED) return { error: OFF }
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { error: "Check the changes and try again." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const row = await ownedTask(db, user.id, parsed.data.taskId)
  if (!row) return { error: "Take not found." }
  if (row.status !== "ready" && row.status !== "failed") return { error: "This take has been submitted. Make a new version to change it." }
  const s = parsed.data
  if (s.trimStartMs >= s.trimEndMs || s.trimEndMs > row.source_duration_ms) return { error: "The selected part must sit inside the take." }
  if (s.assignments.some(a => a.referenceUrls.some(url => !ownsAssetUrl(url, user.id)))) return { error: "Use reference images uploaded to your account." }
  if (new Set(s.assignments.map(a => a.id)).size !== s.assignments.length) return { error: "Two changes share an id. Reload and try again." }
  const { data, error } = await db.from("mimic_tasks").update({
    ...(s.title ? { title: s.title } : {}), trim_start_ms: s.trimStartMs, trim_end_ms: s.trimEndMs, assignments: s.assignments,
    instructions: s.instructions, audio_policy: s.audioPolicy, resolution: s.resolution, updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("user_id", user.id).in("status", ["ready", "failed"]).select("*").maybeSingle()
  if (error || !data) return { error: "Could not save the take." }
  return { data: toView(data as Row) }
}

const generateSchema = z.object({
  taskId: z.string().uuid(),
  /** The cost the creator saw and approved. A different cost means they must look again. */
  approvedUnits: z.number().int().min(1).max(20),
  /** The creator confirmed their rights to the footage, likenesses and references. */
  rightsConfirmed: z.literal(true),
})

/**
 * Submits one take for generation after the creator approved its summary and cost. Everything is
 * re-checked on the server first; only one submission can claim a take, so repeated clicks cannot be
 * charged twice. Nothing is spent until the provider request is about to be made.
 */
export async function generateMimic(input: unknown): Promise<Result<MimicTaskView>> {
  if (!MIMIC_ENABLED) return { error: OFF }
  const parsed = generateSchema.safeParse(input)
  if (!parsed.success) return { error: "Review the summary, confirm your rights to the footage and approve the cost first." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  if (!checkRateLimit(`mimic-generate:${user.id}`, { max: 6, windowMs: 60_000 }).allowed) return { error: "Please wait a moment before generating again." }
  const row = await ownedTask(db, user.id, parsed.data.taskId)
  if (!row) return { error: "Take not found." }
  if (row.status !== "ready" && row.status !== "failed") return { error: "This take is already submitted.", data: toView(row) }

  const view = toView(row)
  const planned = planMimicRequest(toSettings(view), { multiSubject: MIMIC_MULTI_SUBJECT_ENABLED })
  if (!planned.ok) return { error: `Cannot generate this take yet. ${planned.issues.join(" ")} Nothing was charged.`, issues: planned.issues }
  const plan = planned.plan
  if (plan.units !== parsed.data.approvedUnits) return { error: `The cost is now ${plan.units} generation${plan.units === 1 ? "" : "s"}. Review the summary and approve again. Nothing was charged.` }
  if (plan.required.some(r => !ownsAssetUrl(r.url, user.id))) return { error: "A reference image doesn't belong to your account. Nothing was charged." }
  const unreadable = await firstUnreadable(plan.required.map(r => r.url))
  if (unreadable) return { error: "A reference image is missing from storage. Remove it and add it again. Nothing was charged." }

  const { data: open, error: openError } = await db.from("mimic_tasks").select("id,status,submitted_at").eq("user_id", user.id).in("status", ["queued", "generating", "unknown"])
  if (openError) return { error: "Could not check your other takes. Nothing was charged." }
  if ((open ?? []).some(t => t.status === "unknown" && Date.now() - Date.parse(t.submitted_at ?? "") < AMBIGUOUS_HOLD_MS)) return { error: "An earlier take couldn't be confirmed. Wait a few minutes so it isn't paid for twice, then try again." }
  if ((open ?? []).filter(t => t.status !== "unknown").length >= MAX_GENERATING) return { error: `Up to ${MAX_GENERATING} takes can generate at once. Wait for one to finish.` }

  const apiKey = await resolveKieApiKey(user.id)
  if (!apiKey) return { error: "The video service isn't connected. Nothing was charged." }
  let ffmpeg: string
  try { ffmpeg = await requireMediaRuntime() } catch { return { error: "Video processing is unavailable right now. Nothing was charged." } }

  // Claim the take. Only one request can move it out of ready, so a double click stops here.
  const submittedAt = new Date().toISOString()
  const { data: claimed } = await db.from("mimic_tasks").update({ status: "queued", error_message: null, submitted_at: submittedAt, rights_confirmed_at: submittedAt })
    .eq("id", row.id).eq("user_id", user.id).in("status", ["ready", "failed"]).select("id").maybeSingle()
  if (!claimed) return { error: "This take is already being submitted." }
  const release = async (message: string, sentPath?: string) => {
    if (sentPath) await db.storage.from(MIMIC_BUCKET).remove([sentPath]).catch(() => undefined)
    const { data } = await db.from("mimic_tasks").update({ status: "ready", error_message: message.slice(0, 500), submitted_at: null }).eq("id", row.id).eq("status", "queued").select("*").maybeSingle()
    return { error: message, data: data ? toView(data as Row) : undefined }
  }

  // The source must still be the file that was saved; then the selected part is cut for the model.
  let clipUrl = row.source_url
  let sentPath: string | undefined
  let clipSha = row.source_sha256
  try {
    const source = await fetchBounded(row.source_url, row.title, MAX_MIMIC_FILE_BYTES)
    const whole = row.trim_start_ms === 0 && row.trim_end_ms === row.source_duration_ms
    if (!whole) {
      const clip = await cutMimicClip(ffmpeg, source, row.trim_start_ms, row.trim_end_ms)
      sentPath = `${user.id}/mimic/sent/${crypto.randomUUID()}.mp4`
      const { error: uploadError } = await db.storage.from(MIMIC_BUCKET).upload(sentPath, clip.bytes, { contentType: "video/mp4", upsert: false })
      if (uploadError) return release("The selected part of the take could not be saved. Nothing was charged.")
      clipUrl = publicUrl(db, sentPath)
      clipSha = clip.sha256
    }
  } catch (error) {
    return release(`${error instanceof Error ? error.message : "Your take could not be read."} Nothing was charged.`, sentPath)
  }

  const providerInput = { ...plan.input, video_urls: [clipUrl] }
  if (mimicMissingFromPayload(providerInput, plan.required).length) return release("A reference could not be placed in the request. Nothing was submitted or charged.", sentPath)

  const quota = await reserveUsageQuota(db, user.id, "fast_video", undefined, plan.units)
  if (!quota.allowed || !quota.reservationId) return release(quota.message || "Your generation allowance is used up.", sentPath)

  const manifest = {
    provider: plan.provider, model: plan.model, input: providerInput, assignments: plan.manifest, units: plan.units,
    source_sha256: row.source_sha256, clip: { url: clipUrl, sha256: clipSha, start_ms: row.trim_start_ms, end_ms: row.trim_end_ms },
    audio_policy: row.audio_policy, multi_subject: MIMIC_MULTI_SUBJECT_ENABLED,
  }
  const created = await createKieMimicTask(apiKey, { model: plan.model, input: providerInput })
  if (created.ok) {
    // The provider has the job; keep its id or the take could never be collected. One retry, then report.
    const save = () => db.from("mimic_tasks").update({
      status: "generating", provider: plan.provider, model: plan.model, provider_task_id: created.taskId, reservation_id: quota.reservationId,
      cost_units: plan.units, manifest, sent_path: sentPath ?? null,
    }).eq("id", row.id).select("*").maybeSingle()
    let { data: started } = await save()
    if (!started) ({ data: started } = await save())
    if (!started) return { error: "The take started, but we couldn't record it. It may still count toward your allowance; contact support if it doesn't appear." }
    return { data: toView(started as Row) }
  }
  if (created.definite) {
    // Nothing started: give the allowance back and leave the take editable.
    await settleUsageQuota(user.id, quota.reservationId, false)
    return release(`${created.message} Nothing was charged.`, sentPath)
  }
  const { data: held } = await db.from("mimic_tasks").update({ status: "unknown", reservation_id: quota.reservationId, cost_units: plan.units, manifest, sent_path: sentPath ?? null, error_message: created.message })
    .eq("id", row.id).select("*").maybeSingle()
  return { error: `${created.message} We won't retry it automatically so it can't be charged twice.`, data: held ? toView(held as Row) : undefined }
}

async function firstUnreadable(urls: string[]): Promise<string | null> {
  const checks = await Promise.all([...new Set(urls)].map(async (url) => {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" })
      return response.ok ? null : url
    } catch { return url }
  }))
  return checks.find((url): url is string => Boolean(url)) ?? null
}

/** Checks a generating take. When ready, the result is saved to the creator's storage as a new file. */
export async function refreshMimic(input: unknown): Promise<Result<MimicTaskView>> {
  const parsed = z.object({ taskId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose a take." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const row = await ownedTask(db, user.id, parsed.data.taskId)
  if (!row) return { error: "Take not found." }
  if (row.status !== "generating" || !row.provider_task_id) return { data: toView(row) }
  const apiKey = await resolveKieApiKey(user.id)
  if (!apiKey) return { error: "The video service isn't connected." }
  const record = parseMimicRecord(await getKieMimicTask(apiKey, row.provider_task_id))
  if (record.state === "pending") return { data: toView(row) }
  if (record.state === "fail") {
    // Only the request that moves the take to failed gives the allowance back.
    const { data: failed } = await db.from("mimic_tasks").update({ status: "failed", error_message: `${record.message} Nothing was charged for this take.`.slice(0, 500), completed_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "generating").select("*").maybeSingle()
    if (failed && row.reservation_id) await settleUsageQuota(user.id, row.reservation_id, false)
    return { data: toView((failed as Row | null) ?? row) }
  }

  let ffmpeg: string
  try { ffmpeg = await requireMediaRuntime() } catch { return { error: "Your take is ready but can't be saved right now. Try again shortly." } }
  let finished
  try {
    const result = await fetchPublicBytes(record.url, MAX_MIMIC_FILE_BYTES, AbortSignal.timeout(90_000))
    const clipUrl = typeof (row.manifest?.clip as { url?: unknown } | undefined)?.url === "string" ? (row.manifest!.clip as { url: string }).url : row.source_url
    const keepSound = row.audio_policy === "keep_source" && row.source_has_audio
    const sound = keepSound ? await fetchBounded(clipUrl, row.title, MAX_MIMIC_FILE_BYTES) : null
    finished = await finishMimicResult(ffmpeg, result, sound)
  } catch (error) {
    return { error: error instanceof Error && /sound/.test(error.message) ? error.message : "Your take is ready but couldn't be downloaded yet. Try again in a moment.", data: toView(row) }
  }
  const path = `${user.id}/mimic/results/${crypto.randomUUID()}.mp4`
  const { error: uploadError } = await db.storage.from(MIMIC_BUCKET).upload(path, finished.bytes, { contentType: "video/mp4", upsert: false })
  if (uploadError) return { error: "Your take is ready but could not be saved. Try again.", data: toView(row) }
  const { data: done } = await db.from("mimic_tasks").update({ status: "completed", result_path: path, result_url: publicUrl(db, path), error_message: null, completed_at: new Date().toISOString() })
    .eq("id", row.id).eq("status", "generating").select("*").maybeSingle()
  if (!done) {
    // Another check saved it first; keep that one and drop this copy.
    await db.storage.from(MIMIC_BUCKET).remove([path]).catch(() => undefined)
    const current = await ownedTask(db, user.id, row.id)
    return { data: toView(current ?? row) }
  }
  if (row.reservation_id) await settleUsageQuota(user.id, row.reservation_id, true)
  return { data: toView(done as Row) }
}

/** A new version of a take: same recording and settings, editable, pointing at the one it came from. */
export async function duplicateMimicTask(input: unknown): Promise<Result<MimicTaskView>> {
  if (!MIMIC_ENABLED) return { error: OFF }
  const parsed = z.object({ taskId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose a take." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const row = await ownedTask(db, user.id, parsed.data.taskId)
  if (!row) return { error: "Take not found." }
  const { data, error } = await db.from("mimic_tasks").insert({
    user_id: user.id, status: "ready", title: row.title, source_origin: row.source_origin, source_path: row.source_path, source_url: row.source_url,
    source_sha256: row.source_sha256, source_duration_ms: row.source_duration_ms, source_width: row.source_width, source_height: row.source_height,
    source_has_audio: row.source_has_audio, trim_start_ms: row.trim_start_ms, trim_end_ms: row.trim_end_ms, assignments: row.assignments,
    instructions: row.instructions, audio_policy: row.audio_policy, resolution: row.resolution, parent_task_id: row.id,
  }).select("*").single()
  if (error || !data) return { error: "Could not make a new version." }
  return { data: toView(data as Row) }
}

/** Releases a take whose submission could not be confirmed, once it is safe to say it never started. */
export async function releaseUnconfirmedMimic(input: unknown): Promise<Result<MimicTaskView>> {
  const parsed = z.object({ taskId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose a take." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const row = await ownedTask(db, user.id, parsed.data.taskId)
  if (!row) return { error: "Take not found." }
  if (row.status !== "unknown") return { data: toView(row) }
  if (Date.now() - Date.parse(row.submitted_at ?? row.created_at) < AMBIGUOUS_HOLD_MS) return { error: "Wait a few minutes while we make sure this take didn't start." }
  const { data } = await db.from("mimic_tasks").update({ status: "ready", error_message: "The earlier attempt never started. Nothing was charged.", submitted_at: null })
    .eq("id", row.id).eq("status", "unknown").select("*").maybeSingle()
  if (data && row.reservation_id) await settleUsageQuota(user.id, row.reservation_id, false)
  return { data: toView((data as Row | null) ?? row) }
}

/** Deletes a take and the files only it uses. A take the provider is working on can't be deleted. */
export async function deleteMimicTask(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = z.object({ taskId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose a take." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const row = await ownedTask(db, user.id, parsed.data.taskId)
  if (!row) return { error: "Take not found." }
  if (row.status === "queued" || row.status === "generating" || row.status === "unknown") return { error: "This take is still being generated. Delete it once it finishes." }
  // The recording is shared by every version made from it; remove it only with the last one.
  const { count } = await db.from("mimic_tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("source_path", row.source_path).neq("id", row.id)
  const { error } = await db.from("mimic_tasks").delete().eq("id", row.id).eq("user_id", user.id)
  if (error) return { error: "Could not delete the take." }
  const paths = [row.result_path, row.sent_path, count ? null : row.source_path].filter((path): path is string => Boolean(path))
  if (paths.length) await db.storage.from(MIMIC_BUCKET).remove(paths).catch(() => undefined)
  return { data: { id: row.id } }
}

/** Copies a finished take into My videos as a new clip. The take and its recording stay as they are. */
export async function saveMimicToVideos(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = z.object({ taskId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose a take." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const row = await ownedTask(db, user.id, parsed.data.taskId)
  if (!row || row.status !== "completed" || !row.result_url) return { error: "This take has no finished video yet." }
  const prompt = typeof (row.manifest?.input as { prompt?: unknown } | undefined)?.prompt === "string" ? (row.manifest!.input as { prompt: string }).prompt : row.title
  const saved = await saveFastVideoClipToGallery({
    url: row.result_url, prompt, subject: `Mimic: ${row.title}`.slice(0, 120),
    durationSeconds: Math.max(1, Math.round((row.trim_end_ms - row.trim_start_ms) / 1000)),
  })
  if ("error" in saved && saved.error) return { error: saved.error }
  return { data: { id: row.id } }
}

"use server"

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { createKieAudioTask, getKieAudioTask } from "@/infrastructure/ai/kie-audio"
import { resolveKieApiKey } from "@/core/services/kie-key"
import { reserveUsageQuota, settleUsageQuota } from "@/core/services/billing"
import { probeMedia } from "@/core/services/media-probe"
import { requireMediaRuntime } from "@/core/utils/security/media-runtime"
import { fetchPublicBytes } from "@/core/utils/security/safe-fetch"
import { checkRateLimit } from "@/core/utils/security/rate-limit"
import { productionPlanSchema } from "@/core/validation/production-crew"
import {
  AI_AUDIO_CAPABILITIES, AUDIO_PLAYBACK, AUDIO_PURPOSES, buildAiAudioTask, defaultPlacement, parseAiAudioRecord,
  type AudioAsset, type AudioPurpose, type FilmAudioData, type FilmShotIndex,
} from "@/core/services/long-form-audio"
import {
  AUDIO_BUCKET, AUDIO_MIME, AUDIO_PATH, MAX_AUDIO_BINDINGS, MAX_AUDIO_BYTES, MAX_AUDIO_MS,
  downloadAudio, filmShotIndex, loadFilmAudio, loadFilmsAudio, sha256Hex, toAudioAsset,
} from "@/core/services/long-form-audio-store"
import { isMissingLocksTable, loadFilmLocks } from "@/core/services/long-form-lock-store"
import { LONG_FORM_AI_AUDIO_ENABLED, LONG_FORM_AUDIO_ENABLED } from "@/core/config/feature-flags"

type Db = Awaited<ReturnType<typeof createClient>>
type Result<T> = { data?: T; error?: string; stale?: boolean }

const MIGRATION = "Locked audio needs a database update (migration 0053). Nothing was saved."
/** An AI request whose submission couldn't be confirmed holds new requests of that film for this long. */
const AMBIGUOUS_HOLD_MS = 10 * 60 * 1000
const MAX_GENERATING = 3

async function session() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  return { db, user }
}

/** The film (lineage root) this production belongs to, if the signed-in account owns it. */
async function ownedFilm(db: Db, userId: string, productionId: string) {
  if (!z.string().uuid().safeParse(productionId).success) return null
  const { data: job } = await db.from("production_jobs").select("id,parent_job_id,plan").eq("id", productionId).eq("user_id", userId).maybeSingle()
  if (!job) return null
  const plan = productionPlanSchema.safeParse(job.plan)
  return { rootId: (job.parent_job_id as string | null) || (job.id as string), titles: plan.success ? plan.data.deliverables.map(d => d.title) : [] }
}

const missingTable = (error: { code?: string; message?: string } | null) => isMissingLocksTable(error) || /long_form_audio|bump_long_form_revision|save_long_form_audio/.test(error?.message ?? "")

/** Reads a recording's real length and checks it is audio, using the server's ffmpeg. */
async function inspectAudio(bytes: Buffer, ext: string): Promise<{ durationMs: number } | { error: string }> {
  let ffmpeg: string
  try { ffmpeg = await requireMediaRuntime() } catch { return { error: "Audio checks are unavailable right now. Nothing was saved." } }
  const dir = await mkdtemp(join(tmpdir(), "lf-audio-"))
  try {
    const file = join(dir, `audio.${ext}`)
    await writeFile(file, bytes)
    const info = await probeMedia(ffmpeg, file).catch(() => null)
    if (!info?.hasAudio || !(info.durationSec > 0.2)) return { error: "That file isn't a recording we can play." }
    const durationMs = Math.round(info.durationSec * 1000)
    if (durationMs > MAX_AUDIO_MS) return { error: "Recordings can be up to 10 minutes long." }
    return { durationMs }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── Library ─────────────────────────────────────────────────────────────────────────────────────

const uploadSchema = z.object({
  productionId: z.string().uuid(),
  storagePath: z.string().max(400),
  name: z.string().trim().min(1).max(160),
  purpose: z.enum(AUDIO_PURPOSES),
})

/** Saves an uploaded recording to the film's library after reading its real length and checksum. */
export async function registerUploadedAudio(input: unknown): Promise<Result<AudioAsset>> {
  if (!LONG_FORM_AUDIO_ENABLED) return { error: "Locked audio is turned off." }
  const parsed = uploadSchema.safeParse(input)
  if (!parsed.success) return { error: "Upload the recording again." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  if (!checkRateLimit(`lf-audio-upload:${user.id}`, { max: 12, windowMs: 60_000 }).allowed) return { error: "Please wait a moment before adding more audio." }
  const film = await ownedFilm(db, user.id, parsed.data.productionId)
  if (!film) return { error: "Production not found." }
  const path = parsed.data.storagePath
  if (!AUDIO_PATH.test(path) || !path.startsWith(`${user.id}/`)) return { error: "Upload the recording again." }
  const ext = path.split(".").pop()!.toLowerCase()

  let bytes: Buffer
  try { bytes = await downloadAudio(db, path, parsed.data.name) } catch (error) { return { error: error instanceof Error ? error.message : "Upload the recording again." } }
  if (!bytes.byteLength || bytes.byteLength > MAX_AUDIO_BYTES) return { error: "Recordings must be under 40 MB." }
  const inspected = await inspectAudio(bytes, ext)
  if ("error" in inspected) return { error: inspected.error }

  const { data, error } = await db.from("long_form_audio_assets").insert({
    user_id: user.id, production_root_id: film.rootId, origin: "uploaded", purpose: parsed.data.purpose, name: parsed.data.name,
    status: "ready", storage_path: path, playback_path: path, sha256: sha256Hex(bytes), mime_type: AUDIO_MIME[ext],
    byte_size: bytes.byteLength, duration_ms: inspected.durationMs,
  }).select("*").single()
  if (missingTable(error)) return { error: MIGRATION }
  if (error || !data) return { error: "Could not save the recording." }
  return { data: toAudioAsset(data) }
}

const aiSchema = z.object({
  productionId: z.string().uuid(),
  purpose: z.enum(AUDIO_PURPOSES),
  text: z.string().max(5000),
  name: z.string().trim().max(160).optional(),
  voiceId: z.string().max(40).optional(),
  targetSec: z.number().optional(),
  instrumental: z.boolean().optional(),
  loop: z.boolean().optional(),
  speed: z.number().optional(),
})

/**
 * Starts one AI take. It is only a candidate: nothing is locked until the creator previews it and
 * chooses Use and lock. Validation happens before any allowance is reserved or provider called.
 */
export async function createAiAudio(input: unknown): Promise<Result<AudioAsset>> {
  if (!LONG_FORM_AUDIO_ENABLED || !LONG_FORM_AI_AUDIO_ENABLED) return { error: "Creating audio with AI is turned off." }
  const parsed = aiSchema.safeParse(input)
  if (!parsed.success) return { error: "Check the audio details and try again." }
  const request = parsed.data
  const task = buildAiAudioTask(request)
  if (!task.ok) return { error: task.error }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  if (!checkRateLimit(`lf-audio-ai:${user.id}`, { max: 6, windowMs: 60_000 }).allowed) return { error: "Please wait a moment before creating more audio." }
  const film = await ownedFilm(db, user.id, request.productionId)
  if (!film) return { error: "Production not found." }

  const { data: open, error: openError } = await db.from("long_form_audio_assets").select("id,status,created_at")
    .eq("production_root_id", film.rootId).in("status", ["generating", "unknown"])
  if (missingTable(openError)) return { error: MIGRATION }
  if ((open ?? []).some(a => a.status === "unknown" && Date.now() - Date.parse(a.created_at) < AMBIGUOUS_HOLD_MS)) {
    return { error: "An earlier audio request couldn't be confirmed. Wait a few minutes so it isn't paid for twice, then try again." }
  }
  if ((open ?? []).filter(a => a.status === "generating").length >= MAX_GENERATING) return { error: `Up to ${MAX_GENERATING} takes can be created at once. Wait for one to finish.` }

  const apiKey = await resolveKieApiKey(user.id)
  if (!apiKey) return { error: "The audio service isn't connected. Nothing was created." }
  const units = AI_AUDIO_CAPABILITIES[request.purpose].units
  const quota = await reserveUsageQuota(db, user.id, "fast_video", undefined, units)
  if (!quota.allowed || !quota.reservationId) return { error: quota.message || "Your generation allowance is used up." }

  const name = (request.name || request.text).replace(/\s+/g, " ").trim().slice(0, 80) || "AI audio"
  const generation = {
    provider: "kie", model: task.body.model, purpose: request.purpose, text: request.text.slice(0, 5000), voice_id: request.voiceId ?? null,
    target_sec: request.targetSec ?? null, instrumental: request.instrumental ?? null, loop: request.loop ?? null, speed: request.speed ?? null,
    units, reservation_id: quota.reservationId, track_index: 0,
  }
  const { data: row, error } = await db.from("long_form_audio_assets").insert({
    user_id: user.id, production_root_id: film.rootId, origin: "ai_generated", purpose: request.purpose, name, status: "generating", generation,
  }).select("*").single()
  if (error || !row) {
    await settleUsageQuota(user.id, quota.reservationId, false)
    return { error: missingTable(error) ? MIGRATION : "Could not start the audio." }
  }

  const created = await createKieAudioTask(apiKey, task.body)
  if (created.ok) {
    // Kie has the job; keep its id or the take could never be collected. One retry, then report it.
    const save = () => db.from("long_form_audio_assets").update({ provider_task_id: created.taskId }).eq("id", row.id).select("*").maybeSingle()
    let { data: started } = await save()
    if (!started) ({ data: started } = await save())
    if (!started) return { error: "The audio started, but we couldn't record it. It may still count toward your allowance; remove it after a few minutes and try again." }
    return { data: toAudioAsset(started) }
  }
  if (created.definite) {
    // Nothing started: release the allowance and keep the failed candidate visible.
    await settleUsageQuota(user.id, quota.reservationId, false)
    const { data: failed } = await db.from("long_form_audio_assets").update({ status: "failed", error_message: created.message }).eq("id", row.id).select("*").single()
    return { error: created.message, data: failed ? toAudioAsset(failed) : undefined }
  }
  const { data: unknown } = await db.from("long_form_audio_assets").update({ status: "unknown", error_message: created.message }).eq("id", row.id).select("*").single()
  return { error: `${created.message} We won't retry it automatically so it can't be charged twice.`, data: unknown ? toAudioAsset(unknown) : undefined }
}

/** Checks a generating take. When ready, the audio is copied into the creator's storage and checked. */
export async function refreshAiAudio(input: unknown): Promise<Result<AudioAsset[]>> {
  const parsed = z.object({ assetId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose a take." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const { data: row } = await db.from("long_form_audio_assets").select("*").eq("id", parsed.data.assetId).eq("user_id", user.id).maybeSingle()
  if (!row) return { error: "Take not found." }
  const asset = toAudioAsset(row)
  if (asset.status !== "generating" || !asset.providerTaskId) return { data: [asset] }
  const apiKey = await resolveKieApiKey(user.id)
  if (!apiKey) return { error: "The audio service isn't connected." }
  const record = parseAiAudioRecord(await getKieAudioTask(apiKey, asset.providerTaskId))
  if (record.state === "pending") return { data: [asset] }
  const reservation = typeof asset.generation?.reservation_id === "string" ? asset.generation.reservation_id : null
  if (record.state === "fail") {
    if (reservation) await settleUsageQuota(user.id, reservation, false)
    const { data: failed } = await db.from("long_form_audio_assets").update({ status: "failed", error_message: record.failMessage }).eq("id", asset.id).select("*").single()
    return { data: [failed ? toAudioAsset(failed) : asset] }
  }

  // Save every returned track (Suno returns two). The first fills this take; others become new takes.
  const saved: AudioAsset[] = []
  for (const [index, track] of record.tracks.slice(0, 2).entries()) {
    let bytes: Buffer
    try { bytes = await fetchPublicBytes(track.url, MAX_AUDIO_BYTES, AbortSignal.timeout(60_000)) } catch {
      if (index === 0) return { error: "The take is ready but couldn't be downloaded yet. Try again in a moment." }
      continue
    }
    const ext = /\.wav(\?|$)/i.test(track.url) ? "wav" : /\.m4a(\?|$)/i.test(track.url) ? "m4a" : "mp3"
    const inspected = await inspectAudio(bytes, ext)
    if ("error" in inspected) { if (index === 0) return { error: inspected.error }; continue }
    const path = `${user.id}/audio/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await db.storage.from(AUDIO_BUCKET).upload(path, bytes, { contentType: AUDIO_MIME[ext], upsert: false })
    if (uploadError) { if (index === 0) return { error: "Could not save the take." }; continue }
    const fields = { status: "ready", storage_path: path, playback_path: path, sha256: sha256Hex(bytes), mime_type: AUDIO_MIME[ext], byte_size: bytes.byteLength, duration_ms: inspected.durationMs, error_message: null }
    if (index === 0) {
      const { data: ready, error } = await db.from("long_form_audio_assets").update(fields).eq("id", asset.id).eq("status", "generating").select("*").maybeSingle()
      if (error || !ready) {
        // Another check saved it first; keep that one and drop this copy.
        await db.storage.from(AUDIO_BUCKET).remove([path])
        const { data: current } = await db.from("long_form_audio_assets").select("*").eq("id", asset.id).maybeSingle()
        return { data: current ? [toAudioAsset(current)] : [asset] }
      }
      if (reservation) await settleUsageQuota(user.id, reservation, true)
      saved.push(toAudioAsset(ready))
    } else {
      const { data: extra } = await db.from("long_form_audio_assets").insert({
        user_id: user.id, production_root_id: (row as { production_root_id: string }).production_root_id, origin: "ai_generated", purpose: asset.purpose,
        name: `${asset.name} (take 2)`.slice(0, 160), provider_task_id: asset.providerTaskId,
        generation: { ...(asset.generation ?? {}), track_index: index, reservation_id: null }, ...fields,
      }).select("*").maybeSingle()
      if (extra) saved.push(toAudioAsset(extra))
      else await db.storage.from(AUDIO_BUCKET).remove([path])
    }
  }
  return { data: saved }
}

/** Removes a take that isn't locked anywhere. Locked recordings can't be removed until unlocked. */
export async function discardAudio(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = z.object({ assetId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose a take." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const { data: row } = await db.from("long_form_audio_assets").select("*").eq("id", parsed.data.assetId).eq("user_id", user.id).maybeSingle()
  if (!row) return { error: "Take not found." }
  const asset = toAudioAsset(row)
  // A take with a provider job is collected, not discarded. One that never got a job id (the record
  // failed after submission) is treated like an unconfirmed request: held, then removable.
  if (asset.status === "generating" && asset.providerTaskId) return { error: "This take is still being created." }
  const unconfirmed = asset.status === "unknown" || (asset.status === "generating" && !asset.providerTaskId)
  if (unconfirmed && Date.now() - Date.parse(asset.createdAt) < AMBIGUOUS_HOLD_MS) return { error: "Wait a few minutes while we make sure this request didn't start." }
  const { count } = await db.from("long_form_audio_bindings").select("id", { count: "exact", head: true }).eq("audio_asset_id", asset.id)
  if (count) return { error: "This recording is locked. Remove its placements first." }
  const reservation = typeof asset.generation?.reservation_id === "string" ? asset.generation.reservation_id : null
  // An unconfirmed request may have run, so it counts toward the allowance.
  if (unconfirmed && reservation) await settleUsageQuota(user.id, reservation, true)
  const { error } = await db.from("long_form_audio_assets").delete().eq("id", asset.id)
  if (error) return { error: error.code === "23503" ? "This recording is locked. Remove its placements first." : "Could not remove the take." }
  if (asset.storagePath) await db.storage.from(AUDIO_BUCKET).remove([asset.storagePath])
  return { data: { id: asset.id } }
}

// ── Locks (placements) ──────────────────────────────────────────────────────────────────────────

const placementSchema = z.object({
  sourceInMs: z.number().int().min(0).default(0),
  sourceOutMs: z.number().int().positive().nullable().default(null),
  offsetMs: z.number().int().min(0).max(3_600_000).default(0),
  playback: z.enum(AUDIO_PLAYBACK).default("once"),
  gain: z.number().min(0).max(2).default(1),
  fadeInMs: z.number().int().min(0).max(10_000).default(0),
  fadeOutMs: z.number().int().min(0).max(10_000).default(0),
  loop: z.boolean().default(false),
  overflow: z.enum(["block", "cut_at_end"]).default("block"),
  nativeAudio: z.enum(["keep", "mute"]).nullable().default(null),
  dialogueDisplay: z.enum(["voice_over", "match_speech"]).default("voice_over"),
})

const lockSchema = z.object({
  productionId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  assetId: z.string().uuid(),
  scope: z.enum(["scene", "shot"]),
  shotNumber: z.number().int().min(1).max(24).nullable(),
  placement: placementSchema.partial().default({}),
}).refine(v => (v.scope === "scene") === (v.shotNumber === null), { message: "Scene audio has no shot number; shot audio needs one." })

function checkPlacement(p: z.infer<typeof placementSchema>, scope: "scene" | "shot", asset: AudioAsset): string | null {
  if (p.dialogueDisplay === "match_speech") return "Matching visible speech needs a lip-sync step that Long Form doesn't run yet. Use voice-over."
  if (scope === "shot" && p.playback !== "once") return "Shot audio plays once; continuous and per-shot playback are for scene audio."
  const total = asset.durationMs ?? 0
  if (p.sourceInMs >= total) return "The start point is after the end of the recording."
  if (p.sourceOutMs != null && (p.sourceOutMs > total || p.sourceOutMs <= p.sourceInMs)) return "The end point must be after the start and within the recording."
  return null
}

const placementRow = (p: z.infer<typeof placementSchema>) => ({
  source_in_ms: p.sourceInMs, source_out_ms: p.sourceOutMs, timeline_offset_ms: p.offsetMs, playback: p.playback, gain: p.gain,
  fade_in_ms: p.fadeInMs, fade_out_ms: p.fadeOutMs, loop: p.loop, overflow: p.overflow, native_audio: p.nativeAudio, dialogue_display: p.dialogueDisplay,
})

async function rpcRevision(db: Db, fn: string, args: Record<string, unknown>): Promise<Result<{ revision: number }>> {
  const { data, error } = await db.rpc(fn, args)
  if (missingTable(error) || error?.code === "PGRST202") return { error: MIGRATION }
  if (error?.code === "40001") return { error: "Locked media changed in another window. Reload to see the latest, then try again.", stale: true }
  if (error?.code === "P0002") return { error: "That placement no longer exists. Reload and try again.", stale: true }
  if (error) return { error: "Could not save the audio lock. Nothing was changed." }
  return { data: { revision: Number(data) } }
}

/** Use and lock: makes an approved recording mandatory for this shot or the whole scene. */
export async function lockAudio(input: unknown): Promise<Result<{ revision: number }>> {
  if (!LONG_FORM_AUDIO_ENABLED) return { error: "Locked audio is turned off." }
  const parsed = lockSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the audio lock and try again." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const film = await ownedFilm(db, user.id, parsed.data.productionId)
  if (!film) return { error: "Production not found." }
  const { data: row } = await db.from("long_form_audio_assets").select("*").eq("id", parsed.data.assetId).eq("user_id", user.id).eq("production_root_id", film.rootId).maybeSingle()
  if (!row) return { error: "Choose a recording from this film's audio." }
  const asset = toAudioAsset(row)
  if (asset.status !== "ready" || !asset.sha256) return { error: "Only a finished, previewed recording can be locked." }
  const audio = await loadFilmAudio(db, film.rootId).catch(() => null)
  if (!audio?.available) return { error: MIGRATION }
  if (audio.bindings.length >= MAX_AUDIO_BINDINGS) return { error: `A film can hold ${MAX_AUDIO_BINDINGS} audio placements.` }

  const placement = placementSchema.parse({ ...defaultPlacement(asset.purpose, parsed.data.scope), ...parsed.data.placement })
  const problem = checkPlacement(placement, parsed.data.scope, asset)
  if (problem) return { error: problem }
  return rpcRevision(db, "save_long_form_audio_binding", {
    p_root: film.rootId, p_expected_revision: parsed.data.expectedRevision, p_id: null,
    p_binding: {
      scope_type: parsed.data.scope, shot_number: parsed.data.shotNumber, audio_asset_id: asset.id, asset_sha256: asset.sha256, purpose: asset.purpose,
      anchor_title: parsed.data.shotNumber ? film.titles[parsed.data.shotNumber - 1] ?? "" : "", ...placementRow(placement),
    },
  })
}

const updateSchema = z.object({
  productionId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  bindingId: z.string().uuid(),
  placement: placementSchema,
  /** Re-anchor to the shot's current title (the creator confirmed it after the plan changed). */
  confirmShot: z.boolean().default(false),
})

/** Changes where and how a locked recording plays. The recording itself never changes. */
export async function updateAudioPlacement(input: unknown): Promise<Result<{ revision: number }>> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the audio settings and try again." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const film = await ownedFilm(db, user.id, parsed.data.productionId)
  if (!film) return { error: "Production not found." }
  const audio = await loadFilmAudio(db, film.rootId).catch(() => null)
  if (!audio?.available) return { error: MIGRATION }
  const binding = audio.bindings.find(b => b.id === parsed.data.bindingId)
  const asset = binding ? audio.assets.find(a => a.id === binding.audioAssetId) : undefined
  if (!binding || !asset) return { error: "That placement no longer exists. Reload and try again.", stale: true }
  const problem = checkPlacement(parsed.data.placement, binding.scopeType, asset)
  if (problem) return { error: problem }
  const anchor = parsed.data.confirmShot && binding.shotNumber ? film.titles[binding.shotNumber - 1] ?? binding.anchorTitle : binding.anchorTitle
  return rpcRevision(db, "save_long_form_audio_binding", {
    p_root: film.rootId, p_expected_revision: parsed.data.expectedRevision, p_id: binding.id,
    p_binding: { ...placementRow(parsed.data.placement), anchor_title: anchor },
  })
}

export async function removeAudioPlacement(input: unknown): Promise<Result<{ revision: number }>> {
  const parsed = z.object({ productionId: z.string().uuid(), expectedRevision: z.number().int().min(0), bindingId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { error: "Choose a placement." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const film = await ownedFilm(db, user.id, parsed.data.productionId)
  if (!film) return { error: "Production not found." }
  return rpcRevision(db, "delete_long_form_audio_binding", { p_root: film.rootId, p_expected_revision: parsed.data.expectedRevision, p_id: parsed.data.bindingId })
}

/** Current revision (shared with image locks), for a fresh save after another window changed things. */
export async function filmMediaRevision(productionId: string): Promise<Result<{ revision: number }>> {
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  const film = await ownedFilm(db, user.id, productionId)
  if (!film) return { error: "Production not found." }
  try { return { data: { revision: (await loadFilmLocks(db, film.rootId)).revision } } } catch { return { error: "Could not load locked media." } }
}

export type AudioPurposeOption = { id: AudioPurpose; ai: boolean }

export type EditorLockedAudio = { index: FilmShotIndex; audio: Record<string, FilmAudioData> }

/**
 * The locked audio of every Long Form film in an edit, for the editor's preview. The editor plans the
 * cues itself from its live clip positions (with the same planner the export uses), so moving or
 * trimming a shot updates what you hear before anything is saved.
 */
export async function getEditorLockedAudio(timelineId: string): Promise<Result<EditorLockedAudio>> {
  if (!z.string().uuid().safeParse(timelineId).success) return { error: "Choose a timeline." }
  const { db, user } = await session()
  if (!user) return { error: "Please sign in." }
  // RLS limits timelines to their owner; an unknown id simply has no clips.
  const { data: tracks } = await db.from("timeline_tracks").select("id").eq("timeline_id", timelineId).eq("track_type", "video")
  if (!tracks?.length) return { data: { index: {}, audio: {} } }
  const { data: clips } = await db.from("timeline_clips").select("id, start_ms, end_ms, metadata").in("track_id", tracks.map(t => t.id))
  try {
    const index = await filmShotIndex(db, user.id, clips ?? [])
    return { data: { index, audio: await loadFilmsAudio(db, index) } }
  } catch {
    return { error: "Could not load locked audio." }
  }
}

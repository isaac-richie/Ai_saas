"use server"

import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { MAX_PRODUCTION_REFERENCES, labelProductionAssets, ownsAssetUrl, productionAssetsSchema, type ProductionAsset } from "@/core/validation/production-assets"
import { productionPlanSchema } from "@/core/validation/production-crew"
import { requireMediaRuntime } from "@/core/utils/security/media-runtime"
import { checkRateLimit } from "@/core/utils/security/rate-limit"
import { loadFilmLocks, type FilmLocks } from "@/core/services/long-form-lock-store"
import {
  MAX_VIDEO_GUIDANCE_CHARS, MAX_VIDEO_REFS_PER_SCOPE, VIDEO_PURPOSES, trimRangeIssue, videoRefKey, type VideoRefBinding,
} from "@/core/services/long-form-video-refs"
import {
  MAX_VIDEO_SOURCE_BYTES, VIDEO_REF_BUCKET, cutClip, fetchBounded, isMissingVideoTable, loadFilmVideoRefs, openSourceVideo, type FilmVideoRefs, type SourceVideo,
} from "@/core/services/long-form-video-store"
import { LONG_FORM_LOCKS_ENABLED, LONG_FORM_VIDEO_REFS_ENABLED } from "@/core/config/feature-flags"

const MIGRATION = "Video references need a database update (migration 0054). Nothing was saved."
const STALE = "This shot's locked media changed in another window. Reload to see the latest, then try again."

type Session = Awaited<ReturnType<typeof createClient>>

async function ownedFilm(db: Session, userId: string, productionId: string) {
  const { data: job } = await db.from("production_jobs").select("id,parent_job_id,reference_assets,plan").eq("id", productionId).eq("user_id", userId).maybeSingle()
  if (!job) return null
  const parsed = productionAssetsSchema.safeParse(job.reference_assets ?? [])
  const assets = parsed.success ? labelProductionAssets(parsed.data) : []
  const plan = productionPlanSchema.safeParse(job.plan)
  return {
    job, rootId: (job.parent_job_id as string | null) || (job.id as string), assets,
    videos: assets.filter(asset => asset.mediaType === "video"),
    titles: plan.success ? plan.data.deliverables.map(d => d.title) : [],
  }
}

const bindingInput = z.object({
  /** Present for a reference that is already saved; its clip is kept unless the range changes. */
  id: z.string().uuid().optional(),
  assetId: z.string().uuid(),
  trimStartMs: z.number().int().min(0).max(3_600_000),
  /** Null = to the end of the video. */
  trimEndMs: z.number().int().min(1).max(3_600_000).nullable(),
  purpose: z.enum(VIDEO_PURPOSES),
  guidanceText: z.string().trim().max(MAX_VIDEO_GUIDANCE_CHARS).default(""),
})

const saveSchema = z.object({
  productionId: z.string().uuid(),
  scope: z.enum(["scene", "shot"]),
  shotNumber: z.number().int().min(1).max(24).nullable(),
  expectedRevision: z.number().int().min(0),
  bindings: z.array(bindingInput).max(MAX_VIDEO_REFS_PER_SCOPE),
}).refine(v => (v.scope === "scene") === (v.shotNumber === null), { message: "Scene references have no shot number; shot references need one." })

/**
 * Saves one scope's video references (this shot, or the entire scene) as a whole. A new reference, or
 * one whose range changed, is read from the film's library, checked by decoding it, and cut into a
 * silent clip of exactly the selected range; that clip is what the model will receive. A reference
 * whose range is unchanged keeps its clip. Saving never depends on the selected model.
 */
export async function saveVideoRefScope(input: unknown): Promise<{ data?: { revision: number }; error?: string; stale?: boolean }> {
  if (!LONG_FORM_LOCKS_ENABLED || !LONG_FORM_VIDEO_REFS_ENABLED) return { error: "Video references are turned off." }
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the video references and try again." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  if (!checkRateLimit(`lf-video-refs:${user.id}`, { max: 12, windowMs: 60_000 }).allowed) return { error: "Please wait a moment before saving again." }
  const film = await ownedFilm(db, user.id, parsed.data.productionId)
  if (!film) return { error: "Production not found." }
  if (parsed.data.shotNumber && parsed.data.shotNumber > film.titles.length) return { error: "That shot isn't in this film's plan." }

  let locks: FilmLocks, current: FilmVideoRefs
  try { [locks, current] = await Promise.all([loadFilmLocks(db, film.rootId), loadFilmVideoRefs(db, film.rootId)]) } catch { return { error: "Could not load this film's video references." } }
  if (!locks.available || !current.available) return { error: MIGRATION }
  if (locks.revision !== parsed.data.expectedRevision) return { error: STALE, stale: true }

  const existing = parsed.data.scope === "scene" ? current.scene : current.shots[parsed.data.shotNumber!] ?? []
  const savedById = new Map(existing.map(b => [b.id!, b]))
  const libraryById = new Map(film.videos.map(asset => [asset.id, asset]))
  const anchorTitle = parsed.data.shotNumber ? film.titles[parsed.data.shotNumber - 1] ?? "" : ""

  // Decide, for every row, whether its saved clip still stands or a new one must be cut.
  type Kept = { kind: "kept"; saved: VideoRefBinding; item: z.infer<typeof bindingInput> }
  type Fresh = { kind: "new"; asset: ProductionAsset; item: z.infer<typeof bindingInput> }
  const work: (Kept | Fresh)[] = []
  for (const item of parsed.data.bindings) {
    const saved = item.id ? savedById.get(item.id) : undefined
    if (item.id && !saved) return { error: "A video reference isn't part of this shot's saved references. Reload and try again." }
    if (saved) {
      if (saved.assetId !== item.assetId) return { error: "A video reference doesn't match its saved version. Reload and try again." }
      if (saved.trimStartMs === item.trimStartMs && saved.trimEndMs === (item.trimEndMs ?? saved.sourceDurationMs)) { work.push({ kind: "kept", saved, item }); continue }
    }
    // A new reference, or a new range, comes from THIS film's library, uploaded by this account.
    const asset = libraryById.get(item.assetId)
    if (!asset || !ownsAssetUrl(asset.url, user.id)) {
      return { error: saved ? `${saved.assetName} is no longer in this film's library, so its range can't be changed. Remove the reference, or add the video again.` : "Choose videos from this film's library." }
    }
    work.push({ kind: "new", asset, item })
  }

  let ffmpeg = ""
  if (work.some(w => w.kind === "new")) {
    try { ffmpeg = await requireMediaRuntime() } catch { return { error: "Video processing is unavailable right now. Nothing was saved." } }
  }

  const sources = new Map<string, SourceVideo>()
  const uploaded: string[] = []
  const discard = async () => { if (uploaded.length) await db.storage.from(VIDEO_REF_BUCKET).remove(uploaded).catch(() => undefined) }
  try {
    const rows: Record<string, unknown>[] = []
    const keys = new Set<string>()
    for (const entry of work) {
      const { item } = entry
      let row: Record<string, unknown>
      let key: string
      if (entry.kind === "kept") {
        const b = entry.saved
        key = videoRefKey(b)
        row = {
          asset_id: b.assetId, source_url: b.sourceUrl, asset_name: b.assetName, source_duration_ms: b.sourceDurationMs,
          trim_start_ms: b.trimStartMs, trim_end_ms: b.trimEndMs, clip_url: b.clipUrl, clip_sha256: b.sha256, clip_bytes: b.byteSize,
          clip_duration_ms: b.clipDurationMs, width: b.width, height: b.height,
        }
      } else {
        const { asset } = entry
        let source = sources.get(asset.url)
        if (!source) {
          const bytes = await fetchBounded(asset.url, asset.name, MAX_VIDEO_SOURCE_BYTES)
          source = await openSourceVideo(ffmpeg, bytes, asset.name)
          sources.set(asset.url, source)
        }
        const endMs = item.trimEndMs ?? source.durationMs
        // A range drawn on the browser's reading of the length may run a few frames past the real end.
        const clampedEnd = endMs > source.durationMs && endMs - source.durationMs <= 250 ? source.durationMs : endMs
        const issue = trimRangeIssue(item.trimStartMs, clampedEnd, source.durationMs, asset.name)
        if (issue) { await discard(); return { error: issue } }
        key = videoRefKey({ sourceUrl: asset.url, trimStartMs: item.trimStartMs, trimEndMs: clampedEnd })
        if (keys.has(key)) { await discard(); return { error: `${asset.name} is added twice with the same range. Remove one, or change its range.` } }
        const clip = await cutClip(ffmpeg, source, item.trimStartMs, clampedEnd, asset.name)
        const path = `${user.id}/video-refs/${randomUUID()}.mp4`
        const { error: uploadError } = await db.storage.from(VIDEO_REF_BUCKET).upload(path, clip.bytes, { contentType: "video/mp4", upsert: false })
        if (uploadError) { await discard(); return { error: `${asset.name} could not be saved. Nothing was changed; try again.` } }
        uploaded.push(path)
        row = {
          asset_id: asset.id, source_url: asset.url, asset_name: asset.name.slice(0, 160), source_duration_ms: source.durationMs,
          trim_start_ms: item.trimStartMs, trim_end_ms: clampedEnd, clip_url: db.storage.from(VIDEO_REF_BUCKET).getPublicUrl(path).data.publicUrl,
          clip_sha256: clip.sha256, clip_bytes: clip.bytes.byteLength, clip_duration_ms: clip.durationMs, width: clip.width, height: clip.height,
        }
      }
      if (keys.has(key)) { await discard(); return { error: `${String(row.asset_name)} is added twice with the same range. Remove one, or change its range.` } }
      keys.add(key)
      rows.push({ ...row, guidance_purpose: item.purpose, guidance_text: item.guidanceText, anchor_title: anchorTitle })
    }

    const { data: revision, error } = await db.rpc("save_long_form_video_bindings", {
      p_root: film.rootId, p_scope: parsed.data.scope, p_shot: parsed.data.shotNumber, p_expected_revision: parsed.data.expectedRevision, p_bindings: rows,
    })
    if (error) await discard()
    if (isMissingVideoTable(error)) return { error: MIGRATION }
    if (error?.code === "40001") return { error: STALE, stale: true }
    if (error) return { error: "Could not save the video references. Nothing was changed." }
    return { data: { revision: Number(revision) } }
  } catch (error) {
    await discard()
    return { error: error instanceof Error ? error.message : "Could not save the video references. Nothing was changed." }
  } finally {
    await Promise.all([...sources.values()].map(source => rm(source.dir, { recursive: true, force: true }).catch(() => undefined)))
  }
}

const addSchema = z.object({
  productionId: z.string().uuid(),
  url: z.string().url().max(2000),
  name: z.string().trim().min(1).max(160),
  /** The creator confirmed they may use this footage as a reference. */
  permissionConfirmed: z.literal(true),
})

/**
 * Adds one uploaded video to the film's library so it can be used as a reference here and reused later.
 * The file is decoded to confirm it really is a video before it is listed. Adding never changes or
 * removes anything already in the library, so it stays possible after takes exist.
 */
export async function addFilmReferenceVideo(input: unknown): Promise<{ data?: { asset: ProductionAsset; durationMs: number }; error?: string }> {
  if (!LONG_FORM_LOCKS_ENABLED || !LONG_FORM_VIDEO_REFS_ENABLED) return { error: "Video references are turned off." }
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) return { error: "Confirm you have permission to use this video, then upload it again." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  if (!checkRateLimit(`lf-video-upload:${user.id}`, { max: 10, windowMs: 60_000 }).allowed) return { error: "Please wait a moment before adding more videos." }
  if (!ownsAssetUrl(parsed.data.url, user.id)) return { error: "Upload the video again." }
  const film = await ownedFilm(db, user.id, parsed.data.productionId)
  if (!film) return { error: "Production not found." }
  if (film.assets.length >= MAX_PRODUCTION_REFERENCES) return { error: `A film's library holds ${MAX_PRODUCTION_REFERENCES} references. Remove one in References, then upload again.` }
  if (film.assets.some(asset => asset.url === parsed.data.url)) return { error: "That video is already in this film's library." }

  let ffmpeg: string
  try { ffmpeg = await requireMediaRuntime() } catch { return { error: "Video processing is unavailable right now. Nothing was saved." } }
  let durationMs: number
  try {
    const bytes = await fetchBounded(parsed.data.url, parsed.data.name, MAX_VIDEO_SOURCE_BYTES)
    const source = await openSourceVideo(ffmpeg, bytes, parsed.data.name)
    durationMs = source.durationMs
    await rm(source.dir, { recursive: true, force: true }).catch(() => undefined)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That file could not be read as a video." }
  }

  const next = labelProductionAssets([...film.assets, { id: randomUUID(), name: parsed.data.name, url: parsed.data.url, role: "character" as const, mediaType: "video" as const }])
  const checked = productionAssetsSchema.safeParse(next)
  if (!checked.success) return { error: "This film's library can't take another video. Remove one in References, then upload again." }
  const { data: updated, error } = await db.from("production_jobs").update({ reference_assets: checked.data }).eq("id", film.job.id).eq("user_id", user.id).select("id").maybeSingle()
  if (error || !updated) return { error: "Could not add the video to this film's library." }
  return { data: { asset: checked.data[checked.data.length - 1], durationMs } }
}

import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  planEditAudio,
  type AudioAsset, type AudioBinding, type AudioCue, type AudioPurpose, type EditClip, type ExportAudio, type FilmAudioData, type FilmShotIndex,
} from "@/core/services/long-form-audio"
import { isMissingLocksTable } from "@/core/services/long-form-lock-store"

/** Largest recording the film will lock (uploaded or AI-created). */
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024
/** Longest recording: a full scene bed. */
export const MAX_AUDIO_MS = 10 * 60 * 1000
/** Operational limit on placements per film, separate from any provider capability. */
export const MAX_AUDIO_BINDINGS = 60
export const AUDIO_BUCKET = "elements"
export const AUDIO_PATH = /^[0-9a-f-]{36}\/audio\/[0-9a-f-]{36}\.(mp3|m4a|aac|wav|ogg)$/i
export const AUDIO_MIME: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg" }

type AssetRow = {
  id: string; origin: AudioAsset["origin"]; purpose: AudioPurpose; name: string; status: AudioAsset["status"]
  storage_path: string | null; playback_path: string | null; sha256: string | null; mime_type: string | null
  byte_size: number | null; duration_ms: number | null; generation: Record<string, unknown> | null
  provider_task_id: string | null; error_message: string | null; created_at: string
}
type BindingRow = {
  id: string; scope_type: "scene" | "shot"; shot_number: number | null; audio_asset_id: string; asset_sha256: string
  purpose: AudioPurpose; source_in_ms: number; source_out_ms: number | null; timeline_offset_ms: number
  playback: AudioBinding["playback"]; gain: number | string; fade_in_ms: number; fade_out_ms: number; loop: boolean
  overflow: AudioBinding["overflow"]; native_audio: AudioBinding["nativeAudio"]; dialogue_display: AudioBinding["dialogueDisplay"]; anchor_title: string
}

export const toAudioAsset = (r: AssetRow): AudioAsset => ({
  id: r.id, origin: r.origin, purpose: r.purpose, name: r.name, status: r.status, storagePath: r.storage_path,
  playbackPath: r.playback_path, sha256: r.sha256, mimeType: r.mime_type, byteSize: r.byte_size, durationMs: r.duration_ms,
  generation: r.generation, providerTaskId: r.provider_task_id, errorMessage: r.error_message, createdAt: r.created_at,
})
export const toAudioBinding = (r: BindingRow): AudioBinding => ({
  id: r.id, scopeType: r.scope_type, shotNumber: r.shot_number, audioAssetId: r.audio_asset_id, sha256: r.asset_sha256,
  purpose: r.purpose, sourceInMs: r.source_in_ms, sourceOutMs: r.source_out_ms, offsetMs: r.timeline_offset_ms,
  playback: r.playback, gain: Number(r.gain), fadeInMs: r.fade_in_ms, fadeOutMs: r.fade_out_ms, loop: r.loop,
  overflow: r.overflow, nativeAudio: r.native_audio, dialogueDisplay: r.dialogue_display, anchorTitle: r.anchor_title,
})

export type FilmAudio = { available: boolean; assets: AudioAsset[]; bindings: AudioBinding[] }

/** The film's recordings and placements (RLS limits rows to the owner). */
export async function loadFilmAudio(db: SupabaseClient, rootId: string): Promise<FilmAudio> {
  const [assets, bindings] = await Promise.all([
    db.from("long_form_audio_assets").select("*").eq("production_root_id", rootId).order("created_at", { ascending: true }),
    db.from("long_form_audio_bindings").select("*").eq("production_root_id", rootId).order("created_at", { ascending: true }),
  ])
  if (isMissingLocksTable(assets.error) || isMissingLocksTable(bindings.error) || /long_form_audio/.test(`${assets.error?.message ?? ""}${bindings.error?.message ?? ""}`)) {
    return { available: false, assets: [], bindings: [] }
  }
  if (assets.error || bindings.error) throw new Error("Could not load locked audio.")
  return {
    available: true,
    assets: ((assets.data ?? []) as AssetRow[]).map(toAudioAsset),
    bindings: ((bindings.data ?? []) as BindingRow[]).map(toAudioBinding),
  }
}

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

/** Downloads one saved recording from the creator's own storage folder. Throws a plain message. */
export async function downloadAudio(db: SupabaseClient, path: string, name: string): Promise<Buffer> {
  const { data, error } = await db.storage.from(AUDIO_BUCKET).download(path)
  if (error || !data) throw new Error(`"${name}" is missing from storage.`)
  if (data.size > MAX_AUDIO_BYTES) throw new Error(`"${name}" is over 40 MB.`)
  return Buffer.from(await data.arrayBuffer())
}

type ClipRow = EditClip

/**
 * Which Long Form film and shot each film clip in an edit came from. The newest plan for each scene
 * names its shots; its lineage root owns the locks. Clips from anywhere else aren't listed.
 */
export async function filmShotIndex(db: SupabaseClient, userId: string, videoClips: ClipRow[]): Promise<FilmShotIndex> {
  const shotIds = [...new Set(videoClips.map(c => (c.metadata ?? {}).film_shot_id).filter((id): id is string => typeof id === "string"))]
  if (!shotIds.length) return {}
  const { data: shots } = await db.from("shots").select("id, scene_id, sequence_order, name").in("id", shotIds)
  const sceneIds = [...new Set((shots ?? []).map(s => s.scene_id as string))]
  if (!sceneIds.length) return {}
  const { data: jobs } = await db.from("production_jobs").select("id, parent_job_id, scene_id, plan, revision_number").in("scene_id", sceneIds).eq("user_id", userId)
  const filmByScene = new Map<string, { rootId: string; titles: Record<number, string>; revision: number }>()
  for (const job of jobs ?? []) {
    const revision = Number(job.revision_number ?? 0)
    const existing = filmByScene.get(job.scene_id as string)
    if (existing && existing.revision >= revision) continue
    const deliverables = ((job.plan as { deliverables?: { title?: string }[] } | null)?.deliverables ?? [])
    filmByScene.set(job.scene_id as string, {
      rootId: (job.parent_job_id as string | null) || (job.id as string), revision,
      titles: Object.fromEntries(deliverables.map((d, i) => [i + 1, String(d.title ?? "")])),
    })
  }
  const index: FilmShotIndex = {}
  for (const shot of shots ?? []) {
    const film = filmByScene.get(shot.scene_id as string)
    if (film) index[shot.id as string] = { rootId: film.rootId, shotNumber: Number(shot.sequence_order), shotName: String(shot.name ?? ""), titles: film.titles }
  }
  return index
}

/** The recordings and placements of each film in the index. */
export async function loadFilmsAudio(db: SupabaseClient, index: FilmShotIndex): Promise<Record<string, FilmAudioData>> {
  const roots = [...new Set(Object.values(index).map(f => f.rootId))]
  const out: Record<string, FilmAudioData> = {}
  for (const rootId of roots) {
    const audio = await loadFilmAudio(db, rootId)
    if (audio.available && audio.bindings.length) out[rootId] = { assets: audio.assets, bindings: audio.bindings }
  }
  return out
}

/** Plans every locked recording of every film in this edit. Blocking issues stop the export. */
export async function planTimelineAudio(db: SupabaseClient, userId: string, videoClips: ClipRow[]): Promise<ExportAudio> {
  const index = await filmShotIndex(db, userId, videoClips)
  return planEditAudio(videoClips, index, await loadFilmsAudio(db, index))
}

/** A stable fingerprint of the edit's video clips (ids and positions), so a render can tell if they moved. */
export function videoClipFingerprint(clips: Pick<ClipRow, "id" | "start_ms" | "end_ms">[]): string {
  const rows = [...clips].sort((a, b) => a.start_ms - b.start_ms || a.id.localeCompare(b.id)).map(c => `${c.id}:${c.start_ms}:${c.end_ms}`)
  return createHash("sha256").update(rows.join("|")).digest("hex")
}

/** The locked-audio snapshot a render job runs from (never the live editor state). */
export type LockedAudioSnapshot = {
  cues: (AudioCue & { rootId: string })[]
  mutedClipIds: string[]
  clipFingerprint: string
}

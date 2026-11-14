import { createHash, randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type { SupabaseClient } from "@supabase/supabase-js"
import { probeMedia } from "@/core/services/media-probe"
import { isMissingLocksTable } from "@/core/services/long-form-lock-store"
import type { ResolvedVideoRef, VideoPurpose, VideoRefBinding } from "@/core/services/long-form-video-refs"

const run = promisify(execFile)

/** Largest library video the app will read to cut a reference from (the library's own upload limit). */
export const MAX_VIDEO_SOURCE_BYTES = 25 * 1024 * 1024
/** Largest pinned clip the app will keep or send. */
export const MAX_VIDEO_CLIP_BYTES = 30 * 1024 * 1024
export const VIDEO_REF_BUCKET = "elements"
/** Pinned clips live in the creator's own folder: {userId}/video-refs/{uuid}.mp4 */
export const VIDEO_CLIP_PATH = /^[0-9a-f-]{36}\/video-refs\/[0-9a-f-]{36}\.mp4$/i

type Row = {
  id: string; scope_type: "scene" | "shot"; shot_number: number | null; asset_id: string; source_url: string; asset_name: string
  source_duration_ms: number; trim_start_ms: number; trim_end_ms: number; clip_url: string; clip_sha256: string; clip_bytes: number
  clip_duration_ms: number; width: number; height: number; guidance_purpose: VideoPurpose; guidance_text: string; anchor_title?: string | null
}

export const toVideoBinding = (row: Row): VideoRefBinding => ({
  id: row.id, scopeType: row.scope_type, shotNumber: row.shot_number, assetId: row.asset_id, sourceUrl: row.source_url, assetName: row.asset_name,
  sourceDurationMs: row.source_duration_ms, trimStartMs: row.trim_start_ms, trimEndMs: row.trim_end_ms, clipUrl: row.clip_url, sha256: row.clip_sha256,
  byteSize: row.clip_bytes, clipDurationMs: row.clip_duration_ms, width: row.width, height: row.height, purpose: row.guidance_purpose,
  guidanceText: row.guidance_text, anchorTitle: row.anchor_title ?? "",
})

export type FilmVideoRefs = { available: boolean; scene: VideoRefBinding[]; shots: Record<number, VideoRefBinding[]> }

/** True when the error means the video-reference table has not been created yet (migration 0054 pending). */
export const isMissingVideoTable = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (isMissingLocksTable(error) || /long_form_video_bindings|save_long_form_video_bindings/.test(error.message ?? "") || error.code === "PGRST202"))

/** The film's video references (RLS limits rows to the signed-in owner). */
export async function loadFilmVideoRefs(db: SupabaseClient, rootId: string): Promise<FilmVideoRefs> {
  const { data: rows, error } = await db.from("long_form_video_bindings").select("*").eq("production_root_id", rootId).order("created_at", { ascending: true })
  if (isMissingVideoTable(error)) return { available: false, scene: [], shots: {} }
  if (error) throw new Error("Could not load video references.")
  const scene: VideoRefBinding[] = []
  const shots: Record<number, VideoRefBinding[]> = {}
  for (const row of (rows ?? []) as Row[]) {
    const binding = toVideoBinding(row)
    if (binding.scopeType === "scene") scene.push(binding)
    else if (binding.shotNumber) (shots[binding.shotNumber] ??= []).push(binding)
  }
  return { available: true, scene, shots }
}

/** Downloads one file with a hard size limit. Throws a plain message. */
export async function fetchBounded(url: string, name: string, maxBytes: number): Promise<Buffer> {
  let response: Response
  try {
    response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(45_000), cache: "no-store" })
  } catch {
    throw new Error(`${name} could not be read. Check the file is still in your library.`)
  }
  if (!response.ok || !response.body) throw new Error(`${name} is missing or not accessible (${response.status}).`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new Error(`${name} is over ${Math.round(maxBytes / 1024 / 1024)} MB.`)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks)
}

export type SourceVideo = { dir: string; file: string; durationMs: number; width: number; height: number }

/**
 * Writes a library video to a temp folder and reads what it really is by decoding its header, not by
 * trusting its name. The caller removes `dir`. Throws a plain message for anything that isn't a video.
 */
export async function openSourceVideo(ffmpeg: string, bytes: Buffer, name: string): Promise<SourceVideo> {
  const dir = await mkdtemp(join(tmpdir(), "lf-video-"))
  try {
    const file = join(dir, "source")
    await writeFile(file, bytes)
    const info = await probeMedia(ffmpeg, file).catch(() => null)
    if (!info?.hasVideo || !(info.durationSec > 0) || !info.width || !info.height) throw new Error(`${name} isn't a video we can read. Upload an MP4, MOV or WebM file.`)
    return { dir, file, durationMs: Math.floor(info.durationSec * 1000), width: info.width, height: info.height }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/** The ffmpeg arguments for one pinned clip: the selected range only, no sound, plain H.264 MP4. */
export function clipArgs(source: string, output: string, startMs: number, endMs: number): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", (startMs / 1000).toFixed(3), "-i", source, "-t", ((endMs - startMs) / 1000).toFixed(3),
    // First video stream only: no audio, subtitles, data or source metadata reaches the clip.
    "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-f", "mp4", output,
  ]
}

export type CutClip = { bytes: Buffer; sha256: string; durationMs: number; width: number; height: number }

/** Cuts the selected range into a silent clip and checks the result really is that clip. */
export async function cutClip(ffmpeg: string, source: SourceVideo, startMs: number, endMs: number, name: string): Promise<CutClip> {
  const output = join(source.dir, `${randomUUID()}.mp4`)
  try {
    await run(ffmpeg, clipArgs(source.file, output, startMs, endMs), { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
  } catch {
    throw new Error(`${name} could not be processed. Try a different file or a shorter range.`)
  }
  const info = await probeMedia(ffmpeg, output).catch(() => null)
  if (!info?.hasVideo || info.hasAudio || !(info.durationSec > 0)) throw new Error(`${name} could not be processed. Try a different file or a shorter range.`)
  const bytes = await readFile(output)
  if (!bytes.byteLength || bytes.byteLength > MAX_VIDEO_CLIP_BYTES) throw new Error(`${name}: the selected range is too large to send. Select a shorter range.`)
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), durationMs: Math.round(info.durationSec * 1000), width: info.width, height: info.height }
}

/**
 * Before a paid submission: every pinned clip must still be readable and byte-identical to the version
 * that was saved. Returns plain issues; empty means every clip checked out.
 */
export async function verifyPinnedClips(videos: Pick<ResolvedVideoRef, "clipUrl" | "sha256" | "assetName">[]): Promise<string[]> {
  const results = await Promise.all(videos.map(async (video) => {
    try {
      const bytes = await fetchBounded(video.clipUrl, video.assetName, MAX_VIDEO_CLIP_BYTES)
      return createHash("sha256").update(bytes).digest("hex") === video.sha256 ? null : `${video.assetName} has changed since it was saved as a reference. Remove it and add it again.`
    } catch (error) {
      return error instanceof Error ? `${error.message} Remove this video reference and add it again.` : `${video.assetName} could not be checked.`
    }
  }))
  return results.filter((issue): issue is string => Boolean(issue))
}

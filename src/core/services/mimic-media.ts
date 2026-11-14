import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { probeMedia } from "@/core/services/media-probe"

const run = promisify(execFile)

/** Largest recording the app will read. */
export const MAX_MIMIC_UPLOAD_BYTES = 80 * 1024 * 1024
/** Largest prepared take, sent clip or result the app will keep. */
export const MAX_MIMIC_FILE_BYTES = 150 * 1024 * 1024
export const MIMIC_BUCKET = "elements"

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

/**
 * Scales so the short side is at least 720 px (the model needs 700) and the long side at most 1920,
 * keeping the shape; dimensions are made even for H.264.
 */
const FIT = "max(720/min(iw,ih),min(1,1920/max(iw,ih)))"
const VIDEO = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p"]
const AUDIO = ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]

/** Any phone or browser recording → a steady 30 fps H.264 MP4 the model accepts. Sound is kept. */
export function prepareArgs(source: string, output: string): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y", "-i", source,
    "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1",
    "-vf", `fps=30,scale=w='trunc(iw*${FIT}/2)*2':h='trunc(ih*${FIT}/2)*2'`,
    ...VIDEO, ...AUDIO, "-movflags", "+faststart", "-f", "mp4", output,
  ]
}

/** The selected part of the prepared take, re-encoded so the cut is exact. */
export function cutArgs(source: string, output: string, startMs: number, endMs: number): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", (startMs / 1000).toFixed(3), "-i", source, "-t", ((endMs - startMs) / 1000).toFixed(3),
    "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1",
    ...VIDEO, ...AUDIO, "-movflags", "+faststart", "-f", "mp4", output,
  ]
}

/** The generated picture with the take's own sound laid back under it. The picture is not re-encoded. */
export function muxArgs(result: string, soundFrom: string, output: string): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y", "-i", result, "-i", soundFrom,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", ...AUDIO, "-shortest", "-movflags", "+faststart", "-f", "mp4", output,
  ]
}

export type MimicFile = { bytes: Buffer; sha256: string; durationMs: number; width: number; height: number; hasAudio: boolean }

async function inTemp<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "mimic-"))
  try { return await work(dir) } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

async function finish(ffmpeg: string, output: string, problem: string): Promise<MimicFile> {
  const info = await probeMedia(ffmpeg, output).catch(() => null)
  if (!info?.hasVideo || !(info.durationSec > 0) || !info.width || !info.height) throw new Error(problem)
  const bytes = await readFile(output)
  if (!bytes.byteLength || bytes.byteLength > MAX_MIMIC_FILE_BYTES) throw new Error("That video is too large to use. Try a shorter take.")
  return { bytes, sha256: sha256(bytes), durationMs: Math.floor(info.durationSec * 1000), width: info.width, height: info.height, hasAudio: info.hasAudio }
}

/**
 * Reads a recording by decoding it (not by trusting its name) and prepares it for the model. Throws a
 * plain message when it isn't a usable video or runs past `maxSourceMs`.
 */
export async function prepareMimicSource(ffmpeg: string, bytes: Buffer, maxSourceMs: number): Promise<MimicFile> {
  return inTemp(async (dir) => {
    const source = join(dir, "source")
    await writeFile(source, bytes)
    const info = await probeMedia(ffmpeg, source).catch(() => null)
    if (!info?.hasVideo || !(info.durationSec > 0)) throw new Error("That file isn't a video we can read. Use an MP4, MOV or WebM recording.")
    if (info.durationSec * 1000 > maxSourceMs + 500) throw new Error(`Takes can be up to ${Math.round(maxSourceMs / 1000)} seconds long. This one is ${Math.round(info.durationSec)} seconds; trim it and upload again.`)
    const output = join(dir, "prepared.mp4")
    try { await run(ffmpeg, prepareArgs(source, output), { timeout: 240_000, maxBuffer: 4 * 1024 * 1024 }) }
    catch { throw new Error("That video could not be prepared. Try recording again or use a different file.") }
    return finish(ffmpeg, output, "That video could not be prepared. Try recording again or use a different file.")
  })
}

/** Cuts the selected part of a prepared take. */
export async function cutMimicClip(ffmpeg: string, prepared: Buffer, startMs: number, endMs: number): Promise<MimicFile> {
  return inTemp(async (dir) => {
    const source = join(dir, "prepared.mp4")
    await writeFile(source, prepared)
    const output = join(dir, "clip.mp4")
    try { await run(ffmpeg, cutArgs(source, output, startMs, endMs), { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }) }
    catch { throw new Error("The selected part of the take could not be cut. Try a different selection.") }
    return finish(ffmpeg, output, "The selected part of the take could not be cut. Try a different selection.")
  })
}

/** Checks a generated result and, when asked, lays the take's own sound back under it. */
export async function finishMimicResult(ffmpeg: string, result: Buffer, soundFrom: Buffer | null): Promise<MimicFile> {
  return inTemp(async (dir) => {
    const picture = join(dir, "result.mp4")
    await writeFile(picture, result)
    if (!soundFrom) return finish(ffmpeg, picture, "The result isn't a playable video.")
    const sound = join(dir, "sound.mp4")
    await writeFile(sound, soundFrom)
    const output = join(dir, "final.mp4")
    try { await run(ffmpeg, muxArgs(picture, sound, output), { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }) }
    catch { throw new Error("The result is ready, but your take's sound could not be added to it.") }
    return finish(ffmpeg, output, "The result isn't a playable video.")
  })
}

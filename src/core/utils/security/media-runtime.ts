import { execFile } from "node:child_process"
import { promisify } from "node:util"
import bundledFFmpegPath from "ffmpeg-static"

const exec = promisify(execFile)

export class MediaRuntimeUnavailableError extends Error {
  constructor() {
    super("Media processing is temporarily unavailable. Your saved media is unchanged.")
    this.name = "MediaRuntimeUnavailableError"
  }
}

// Check deployment binaries before consuming an account's analysis allowance.
export async function requireMediaRuntime(probe = false, signal?: AbortSignal) {
  const candidates = [
    { binary: process.env.FFMPEG_PATH, source: "FFMPEG_PATH" },
    { binary: bundledFFmpegPath || undefined, source: "bundled" },
    { binary: "ffmpeg", source: "PATH" },
  ].filter((candidate, index, all): candidate is { binary: string; source: string } =>
    Boolean(candidate.binary) && all.findIndex((item) => item.binary === candidate.binary) === index,
  )
  const failures: Array<{ source: string; code: string }> = []
  let ffmpegPath: string | undefined
  for (const candidate of candidates) {
    try {
      await exec(candidate.binary, ["-version"], { timeout: 3000, maxBuffer: 64 * 1024, signal })
      ffmpegPath = candidate.binary
      if (failures.length) console.warn("A configured FFmpeg path failed; using a working fallback.", { failedSources: failures.map(({ source }) => source) })
      break
    } catch (error) {
      if (signal?.aborted) throw error
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unavailable"
      failures.push({ source: candidate.source, code: code.slice(0, 48) })
    }
  }
  if (!ffmpegPath) {
    console.error("No FFmpeg candidate is executable in this runtime.", { failures })
    throw new MediaRuntimeUnavailableError()
  }

  if (probe) {
    const ffprobePath = process.env.FFPROBE_PATH || "ffprobe"
    try {
      await exec(ffprobePath, ["-version"], { timeout: 3000, maxBuffer: 64 * 1024, signal })
    } catch (error) {
      if (signal?.aborted) throw error
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unavailable"
      console.error("FFprobe is unavailable in this runtime.", { source: process.env.FFPROBE_PATH ? "FFPROBE_PATH" : "PATH", code: code.slice(0, 48) })
      throw new MediaRuntimeUnavailableError()
    }
  }

  return ffmpegPath
}

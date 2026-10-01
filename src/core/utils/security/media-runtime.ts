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

// Prefer an explicit deployment override, then the binary bundled with this
// application. The bare command remains a compatibility fallback for local
// development environments that install FFmpeg themselves.
export function getFFmpegPath() {
  return process.env.FFMPEG_PATH || bundledFFmpegPath || "ffmpeg"
}

// Check deployment binaries before consuming an account's analysis allowance.
export async function requireMediaRuntime(probe = false, signal?: AbortSignal) {
  const binaries = [getFFmpegPath()]
  if (probe) binaries.push(process.env.FFPROBE_PATH || "ffprobe")
  for (const binary of binaries) {
    try {
      await exec(binary, ["-version"], { timeout: 3000, maxBuffer: 64 * 1024, signal })
    } catch {
      throw new MediaRuntimeUnavailableError()
    }
  }
}

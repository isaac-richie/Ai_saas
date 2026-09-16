import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)

export class MediaRuntimeUnavailableError extends Error {
  constructor() {
    super("Media processing is temporarily unavailable. Your saved media is unchanged.")
    this.name = "MediaRuntimeUnavailableError"
  }
}

// Check deployment binaries before consuming an account's analysis allowance.
export async function requireMediaRuntime(probe = false, signal?: AbortSignal) {
  const binaries = [process.env.FFMPEG_PATH || "ffmpeg"]
  if (probe) binaries.push(process.env.FFPROBE_PATH || "ffprobe")
  for (const binary of binaries) {
    try {
      await exec(binary, ["-version"], { timeout: 3000, maxBuffer: 64 * 1024, signal })
    } catch {
      throw new MediaRuntimeUnavailableError()
    }
  }
}

import { createClient } from "@/infrastructure/supabase/client"
import { REFERENCE_BUCKET, type MediaReference } from "@/core/validation/media-reference"

/** Longest lip-sync take we send: long enough for a line or a chorus, short enough to keep cost predictable. */
export const LIP_SYNC_MAX_SECONDS = 30

/** 16-bit PCM WAV, mono, at the decoded sample rate. */
function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)) }
  write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE")
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  write(36, "data"); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: "audio/wav" })
}

/**
 * Cuts the audio reference to its trim window (capped at 30 s), with 10 ms edge fades so the
 * cut never clicks, and uploads it as a WAV the server can hand to the lip-sync model.
 * The sample-accurate cut keeps the original timing, so the voice lands at 0 ms offset.
 */
export async function prepareLipSyncAudio(reference: MediaReference): Promise<{ audioPath: string; seconds: number }> {
  const db = createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error("Please sign in to lip-sync audio.")
  const { data: signed, error } = await db.storage.from(REFERENCE_BUCKET).createSignedUrl(reference.assetPath, 600)
  if (error || !signed) throw new Error(`${reference.name} is unavailable. Re-add it, then try again.`)
  const response = await fetch(signed.signedUrl)
  if (!response.ok) throw new Error(`Couldn't read ${reference.name}. Check your connection and try again.`)
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await response.arrayBuffer())
    const start = Math.max(0, reference.trimStart || 0)
    const end = Math.min(decoded.duration, reference.trimEnd ?? decoded.duration, start + LIP_SYNC_MAX_SECONDS)
    if (end - start < 1) throw new Error("Trim the audio to at least 1 second to lip-sync it.")
    const from = Math.floor(start * decoded.sampleRate)
    const to = Math.floor(end * decoded.sampleRate)
    const mono = new Float32Array(to - from)
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel)
      for (let i = 0; i < mono.length; i++) mono[i] += data[from + i] / decoded.numberOfChannels
    }
    const fade = Math.min(Math.floor(decoded.sampleRate * 0.01), Math.floor(mono.length / 2))
    for (let i = 0; i < fade; i++) { mono[i] *= i / fade; mono[mono.length - 1 - i] *= i / fade }
    const audioPath = `${user.id}/${crypto.randomUUID()}.wav`
    const { error: uploadError } = await db.storage.from(REFERENCE_BUCKET).upload(audioPath, encodeWav(mono, decoded.sampleRate), { contentType: "audio/wav", upsert: false })
    if (uploadError) throw new Error("The trimmed audio didn't upload. Check your connection and try again.")
    return { audioPath, seconds: end - start }
  } finally {
    if (context.state !== "closed") void context.close()
  }
}

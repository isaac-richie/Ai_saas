/**
 * Shot timing. A draft plan gets even times from the Length setting; once a voice file is uploaded its
 * length wins (brief: "Voice length wins") and every shot is re-timed from it, snapped to frames.
 */
import type { Plan, Shot } from "./contract"

export const FPS = 25
const snap = (s: number, fps = FPS) => Math.round(s * fps) / fps

/**
 * Re-times shots to fill `total` seconds exactly. The end card holds the closing beat (22% of the ad,
 * between 2.5 s and 4 s); the other shots share the rest evenly. Times are contiguous and frame-exact.
 */
export function retime(shots: Shot[], total: number, fps = FPS): Shot[] {
  const t = snap(total, fps)
  const endCard = snap(Math.min(4, Math.max(2.5, t * 0.22)), fps)
  const body = shots.length - 1
  const each = (t - endCard) / body
  let cursor = 0
  return shots.map((shot, i) => {
    const start = cursor
    const end = i === shots.length - 1 ? t : snap((i + 1) * each, fps)
    cursor = end
    return { ...shot, start_s: start, end_s: end }
  })
}

/** The plan with the voice length applied, and a note for the user when it differs from the Length setting. */
export function applyVoice(plan: Plan, voiceS: number, lengthSetting: number, fps = FPS): { plan: Plan; note: string | null } {
  const total = snap(voiceS, fps)
  const note = Math.abs(total - lengthSetting) >= 0.5
    ? `Your voice file is ${total.toFixed(1)} s, so the ad is ${total.toFixed(1)} s long instead of the ${lengthSetting} s you chose.`
    : null
  return { plan: { ...plan, total_s: total, shots: retime(plan.shots, total, fps) }, note }
}

export const MAX_VOICE_S = 20
export function voiceProblem(voiceS: number): string | null {
  if (!Number.isFinite(voiceS) || voiceS <= 0) return "That voice file has no length we can read. Export it again as MP3 or WAV."
  if (voiceS > MAX_VOICE_S + 0.5) return `The voice is ${voiceS.toFixed(1)} s; ads can be at most ${MAX_VOICE_S} s. Trim the voice and upload it again.`
  if (voiceS < 6) return `The voice is only ${voiceS.toFixed(1)} s; an ad needs at least 6 s for its shots and end card.`
  return null
}

import { atempoChain } from './timeline-render'

/**
 * Captions are made from the edit as it is now, not from an exported video. This builds one quiet,
 * speech-only audio file of the timeline: each shot's own sound, trimmed and sped exactly as it plays,
 * placed at the moment it starts in the edit. Music is left out: captions follow speech.
 */
export type SpeechCue = {
  /** Local copy of the shot's file. */
  path: string
  /** Where the shot starts on the timeline, in seconds. */
  startSec: number
  /** Where in its file the shot starts playing. */
  trimSec: number
  /** How long the shot lasts on the timeline. */
  durationSec: number
  /** Playback speed: 2 plays twice as much footage in the same time. */
  speed: number
  /** The shot's level; 0 means muted, and a muted shot is not captioned. */
  volume: number
}

/** The cues that actually carry sound. */
export function audibleCues(cues: SpeechCue[]): SpeechCue[] {
  return cues.filter((cue) => cue.volume > 0 && cue.durationSec > 0.05)
}

/** ffmpeg arguments for a mono 16 kHz speech mix of the cues, `totalSec` long. */
export function buildSpeechMixArgs(cues: SpeechCue[], totalSec: number, output: string): string[] {
  const audible = audibleCues(cues)
  if (!audible.length) throw new Error('No shot in this edit has sound.')
  const inputs: string[] = []
  const filters: string[] = []
  audible.forEach((cue, i) => {
    const footageSec = cue.durationSec * cue.speed
    inputs.push('-ss', cue.trimSec.toFixed(3), '-t', footageSec.toFixed(3), '-i', cue.path)
    const delayMs = Math.max(0, Math.round(cue.startSec * 1000))
    const chain = [
      'aresample=16000', 'aformat=channel_layouts=mono',
      ...atempoChain(cue.speed),
      // A trailing pad keeps every stream the full length, so the mix is the edit's length.
      `adelay=${delayMs}:all=1`, `apad=whole_dur=${totalSec.toFixed(3)}`,
    ]
    filters.push(`[${i}:a:0]${chain.join(',')}[a${i}]`)
  })
  const labels = audible.map((_, i) => `[a${i}]`).join('')
  // normalize=0: overlapping shots keep their levels instead of being divided by the input count.
  filters.push(`${labels}amix=inputs=${audible.length}:duration=longest:normalize=0,atrim=0:${totalSec.toFixed(3)}[out]`)
  return [
    '-hide_banner', '-loglevel', 'error', '-y', ...inputs,
    '-filter_complex', filters.join(';'), '-map', '[out]', '-ac', '1', '-ar', '16000', '-b:a', '48k', output,
  ]
}

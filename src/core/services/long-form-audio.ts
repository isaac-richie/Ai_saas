/**
 * Long Form locked audio (spec v2.0): recordings, AI audio requests, and where approved recordings
 * play in the finished film.
 *
 * Pure functions only. Nothing here stretches, speeds up, trims, loops or replaces a recording on its
 * own: when a placement doesn't fit, planning returns an issue and the export is blocked until the
 * creator chooses (extend the shot, trim explicitly, loop explicitly, or pick another take).
 */

export const AUDIO_PURPOSES = ["dialogue", "music", "sound_effect", "ambience"] as const
export type AudioPurpose = (typeof AUDIO_PURPOSES)[number]
export const AUDIO_PURPOSE_LABELS: Record<AudioPurpose, string> = {
  dialogue: "Dialogue / voice-over", music: "Music", sound_effect: "Sound effect", ambience: "Ambience",
}

export const AUDIO_PLAYBACK = ["once", "continuous", "repeat_per_shot"] as const
export type AudioPlayback = (typeof AUDIO_PLAYBACK)[number]

export type AudioAsset = {
  id: string
  origin: "uploaded" | "ai_generated"
  purpose: AudioPurpose
  name: string
  status: "generating" | "unknown" | "ready" | "failed"
  storagePath: string | null
  playbackPath: string | null
  sha256: string | null
  mimeType: string | null
  byteSize: number | null
  durationMs: number | null
  generation: Record<string, unknown> | null
  providerTaskId: string | null
  errorMessage: string | null
  createdAt: string
}

export type AudioBinding = {
  id: string
  scopeType: "scene" | "shot"
  shotNumber: number | null
  audioAssetId: string
  sha256: string
  purpose: AudioPurpose
  sourceInMs: number
  /** null = to the end of the recording. */
  sourceOutMs: number | null
  /** From the start of the shot (shot scope) or of the scene (scene scope). */
  offsetMs: number
  playback: AudioPlayback
  gain: number
  fadeInMs: number
  fadeOutMs: number
  loop: boolean
  overflow: "block" | "cut_at_end"
  /** The shot's own generated sound under this placement; null until the creator decides. */
  nativeAudio: "keep" | "mute" | null
  dialogueDisplay: "voice_over" | "match_speech"
  anchorTitle: string
}

/** Defaults the spec sets for a new placement of a recording with this purpose and scope. */
export function defaultPlacement(purpose: AudioPurpose, scope: "scene" | "shot"): Pick<AudioBinding, "playback" | "gain" | "fadeInMs" | "fadeOutMs" | "loop" | "overflow" | "nativeAudio" | "dialogueDisplay" | "offsetMs" | "sourceInMs" | "sourceOutMs"> {
  return {
    // Scene audio plays continuously across cuts by default; a shot's plays once.
    playback: scope === "scene" && purpose !== "dialogue" && purpose !== "sound_effect" ? "continuous" : "once",
    gain: 1, fadeInMs: 0, fadeOutMs: 0, loop: false, overflow: "block",
    // Approved dialogue proposes muting the generated voice, but the creator must confirm it.
    nativeAudio: purpose === "dialogue" ? null : "keep",
    dialogueDisplay: "voice_over", offsetMs: 0, sourceInMs: 0, sourceOutMs: null,
  }
}

// ── AI audio capabilities ─────────────────────────────────────────────────────────────────────────
// Exact Kie endpoints (docs.kie.ai, checked 2026-11-08). One endpoint does not make every audio type:
// each type maps to its own model, and anything not listed here is unavailable.

/**
 * Stock ElevenLabs voices Kie lists for Turbo 2.5. Only these may be chosen; the server rejects any
 * other id. Voices named after real people or trademarks are left out on purpose.
 */
export const DIALOGUE_VOICES = [
  { id: "EkK5I93UQWFDigLMpZcX", name: "James", note: "Warm, steady male" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", note: "Young male, clear" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", note: "Deep male narrator" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", note: "Husky male" },
  { id: "DYkrAHD8iwork3YSUBbs", name: "Tom", note: "Conversational male" },
  { id: "zYcjlYFOd3taleS0gkk3", name: "Edward", note: "Older male, measured" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", note: "Bright female" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", note: "Soft female" },
  { id: "TC0Zp7WVFzhA8zpTlRqV", name: "Aria", note: "Expressive female" },
  { id: "pPdl9cQBQq4p6mRkZy2Z", name: "Emma", note: "Calm female" },
  { id: "lcMyyd2HUfFzxdCaC4Ta", name: "Lucy", note: "Young female" },
  { id: "Z3R5wn05IrDiVCyEkUrK", name: "Arabella", note: "Mature female narrator" },
] as const
export const DIALOGUE_VOICE_IDS: ReadonlySet<string> = new Set(DIALOGUE_VOICES.map(v => v.id))
export const voicePreviewUrl = (voiceId: string) => `https://static.aiquickdraw.com/elevenlabs/voice/${voiceId}.mp3`

export const AI_AUDIO_MODELS = {
  dialogue: "elevenlabs/text-to-speech-turbo-2-5",
  music: "ai-music-api/generate",
  sound_effect: "ai-music-api/sounds",
  ambience: "ai-music-api/sounds",
} as const satisfies Record<AudioPurpose, string>

/** What each AI type takes. `durationControl` false means the length can't be set, only checked after. */
export const AI_AUDIO_CAPABILITIES: Record<AudioPurpose, { textLimit: number; durationControl: boolean; minSec?: number; maxSec?: number; units: number }> = {
  dialogue: { textLimit: 5000, durationControl: false, units: 1 },
  music: { textLimit: 1000, durationControl: true, minSec: 10, maxSec: 360, units: 2 },
  sound_effect: { textLimit: 500, durationControl: false, units: 1 },
  ambience: { textLimit: 500, durationControl: false, units: 1 },
}

export type AiAudioRequest = {
  purpose: AudioPurpose
  /** Dialogue: the words to speak. Others: a description of the sound. */
  text: string
  voiceId?: string
  /** Music only: target length in seconds. A target, not a promise; the real length is checked. */
  targetSec?: number
  instrumental?: boolean
  title?: string
  loop?: boolean
  speed?: number
}

export function buildAiAudioTask(request: AiAudioRequest): { ok: true; body: { model: string; input: Record<string, unknown> } } | { ok: false; error: string } {
  const capability = AI_AUDIO_CAPABILITIES[request.purpose]
  if (!capability) return { ok: false, error: "That kind of audio can't be created here." }
  const text = request.text.replace(/\s+/g, " ").trim()
  if (!text) return { ok: false, error: request.purpose === "dialogue" ? "Write the line to be spoken." : "Describe the sound you want." }
  if (text.length > capability.textLimit) return { ok: false, error: `Keep it under ${capability.textLimit} characters (now ${text.length}).` }

  if (request.purpose === "dialogue") {
    if (!request.voiceId || !DIALOGUE_VOICE_IDS.has(request.voiceId)) return { ok: false, error: "Choose one of the listed voices." }
    const speed = request.speed ?? 1
    if (!(speed >= 0.7 && speed <= 1.2)) return { ok: false, error: "Speech speed must be between 0.7 and 1.2." }
    return { ok: true, body: { model: AI_AUDIO_MODELS.dialogue, input: { text, voice: request.voiceId, stability: 0.5, similarity_boost: 0.75, style: 0, speed } } }
  }
  if (request.purpose === "music") {
    const target = request.targetSec
    if (target == null || !Number.isFinite(target) || target < capability.minSec! || target > capability.maxSec!) {
      return { ok: false, error: `Choose a length between ${capability.minSec} and ${capability.maxSec} seconds.` }
    }
    const title = (request.title || text).slice(0, 80)
    return {
      ok: true,
      body: { model: AI_AUDIO_MODELS.music, input: { custom_mode: true, instrumental: request.instrumental !== false, model: "V6", title, style: text, duration: Math.round(target) } },
    }
  }
  // Sound effects and ambience: Kie's sounds model has no length control. Ambience loops seamlessly.
  return { ok: true, body: { model: AI_AUDIO_MODELS[request.purpose], input: { prompt: text, model: "V6", sound_loop: request.loop ?? request.purpose === "ambience" } } }
}

export type AiAudioRecord = { state: "pending" | "success" | "fail"; tracks: { url: string; durationSec: number | null }[]; failMessage: string | null }

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value
  try { return JSON.parse(value) } catch { return null }
}

/** Reads Kie's task record for any of the audio models: ElevenLabs (resultUrls) or Suno (data[]). */
export function parseAiAudioRecord(data: unknown): AiAudioRecord {
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>
  const state = String(record.state ?? record.status ?? "").toLowerCase()
  if (state === "fail" || state === "failed" || state === "error") {
    return { state: "fail", tracks: [], failMessage: typeof record.failMsg === "string" && record.failMsg ? record.failMsg.slice(0, 300) : "The audio could not be created." }
  }
  if (state !== "success") return { state: "pending", tracks: [], failMessage: null }
  const result = (parseMaybeJson(record.resultJson) ?? record.response ?? {}) as Record<string, unknown>
  const tracks: AiAudioRecord["tracks"] = []
  const urls = Array.isArray(result.resultUrls) ? result.resultUrls : []
  for (const url of urls) if (typeof url === "string" && /^https:\/\//.test(url)) tracks.push({ url, durationSec: null })
  const response = (record.response && typeof record.response === "object" ? record.response : result) as Record<string, unknown>
  const clips = Array.isArray(response.data) ? response.data : Array.isArray(result.data) ? result.data : []
  for (const clip of clips) {
    if (!clip || typeof clip !== "object") continue
    const c = clip as Record<string, unknown>
    const url = typeof c.audio_url === "string" ? c.audio_url : typeof c.audioUrl === "string" ? c.audioUrl : null
    if (url && /^https:\/\//.test(url)) tracks.push({ url, durationSec: typeof c.duration === "number" ? c.duration : null })
  }
  if (!tracks.length) return { state: "fail", tracks: [], failMessage: "The provider finished but returned no audio." }
  return { state: "success", tracks, failMessage: null }
}

// ── Placement and timing ──────────────────────────────────────────────────────────────────────────

/** Where one film shot sits in the edit (or, before an edit exists, in the planned film). */
export type ShotSpan = { shotNumber: number; startMs: number; endMs: number; title: string }

export type AudioCue = {
  bindingId: string
  assetId: string
  sha256: string
  path: string
  purpose: AudioPurpose
  startMs: number
  sourceInMs: number
  durationMs: number
  gain: number
  fadeInMs: number
  fadeOutMs: number
  /** Repeat the chosen segment to fill durationMs (only when the creator chose loop). */
  loop: boolean
  segmentMs: number
  /** True when the length was set to fill its shot or scene (loop or "end with it"), so it follows that span. */
  fillsScope: boolean
}

export type AudioIssue = { bindingId: string | null; kind: "missing" | "too_long" | "too_short" | "out_of_range" | "decision" | "sync" | "conflict" | "moved"; message: string }

export type AudioPlan = {
  cues: AudioCue[]
  /** Shots whose own sound is muted because approved dialogue plays over them. Clip audio is kept. */
  mutedShots: number[]
  issues: AudioIssue[]
}

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const where = (b: AudioBinding) => b.scopeType === "scene" ? "Scene audio" : `Shot ${b.shotNumber} audio`

/** The chosen segment's length, or an issue when the trim points fall outside the recording. */
export function segmentLength(binding: AudioBinding, asset: Pick<AudioAsset, "durationMs">): number | null {
  const total = asset.durationMs ?? 0
  const end = binding.sourceOutMs ?? total
  if (binding.sourceInMs >= total || end > total || end <= binding.sourceInMs) return null
  return end - binding.sourceInMs
}

/**
 * Places every locked recording against the film's shots, or says why it can't. `spans` are the
 * film's shots in this edit; `foreign` are other clips' ranges that a scene recording must not cross.
 */
export function planFilmAudio(
  bindings: AudioBinding[], assets: Map<string, AudioAsset>, spans: ShotSpan[],
  options: { foreign?: { startMs: number; endMs: number }[]; currentTitles?: Map<number, string> } = {},
): AudioPlan {
  const cues: AudioCue[] = []
  const muted = new Set<number>()
  const keep = new Set<number>()
  const issues: AudioIssue[] = []
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs)
  const byShot = new Map(sorted.map(s => [s.shotNumber, s]))
  const sceneStart = sorted.length ? sorted[0].startMs : 0
  const sceneEnd = sorted.length ? Math.max(...sorted.map(s => s.endMs)) : 0

  for (const b of bindings) {
    const asset = assets.get(b.audioAssetId)
    if (!asset || asset.status !== "ready" || !asset.playbackPath || asset.sha256 !== b.sha256) {
      issues.push({ bindingId: b.id, kind: "missing", message: `${where(b)}: the locked recording is missing or has changed. Re-lock a recording.` })
      continue
    }
    if (b.scopeType === "shot" && options.currentTitles) {
      const now = options.currentTitles.get(b.shotNumber!)
      if (b.anchorTitle && now !== undefined && now !== b.anchorTitle) {
        issues.push({ bindingId: b.id, kind: "moved", message: `Shot ${b.shotNumber} is now "${now}", but this audio was locked to "${b.anchorTitle}". Open Locked media and confirm or move it.` })
        continue
      }
    }
    if (b.dialogueDisplay === "match_speech") {
      issues.push({ bindingId: b.id, kind: "sync", message: `${where(b)}: matching visible speech needs a lip-sync step that Long Form doesn't run. Use voice-over, or remove this placement.` })
      continue
    }
    if (b.purpose === "dialogue" && !b.nativeAudio) {
      issues.push({ bindingId: b.id, kind: "decision", message: `${where(b)}: choose whether the shot's own generated sound is muted or kept under "${asset.name}".` })
    }
    const segment = segmentLength(b, asset)
    if (segment == null) {
      issues.push({ bindingId: b.id, kind: "out_of_range", message: `${where(b)}: the trim points fall outside "${asset.name}" (${sec(asset.durationMs ?? 0)}).` })
      continue
    }

    // The ranges this placement must fill or fit inside.
    const targets: { startMs: number; endMs: number; shots: number[]; label: string }[] = []
    if (b.scopeType === "shot") {
      const span = byShot.get(b.shotNumber!)
      if (!span) {
        issues.push({ bindingId: b.id, kind: "missing", message: `Shot ${b.shotNumber} has locked audio but isn't in this edit. Add the shot back or remove the lock.` })
        continue
      }
      targets.push({ startMs: span.startMs, endMs: span.endMs, shots: [span.shotNumber], label: `shot ${span.shotNumber}` })
    } else if (!sorted.length) {
      issues.push({ bindingId: b.id, kind: "missing", message: "Scene audio is locked, but none of this film's shots are in the edit." })
      continue
    } else if (b.playback === "repeat_per_shot") {
      for (const s of sorted) targets.push({ startMs: s.startMs, endMs: s.endMs, shots: [s.shotNumber], label: `shot ${s.shotNumber}` })
    } else {
      targets.push({ startMs: sceneStart, endMs: sceneEnd, shots: sorted.map(s => s.shotNumber), label: "the scene" })
    }

    let blocked = false
    for (const target of targets) {
      const start = target.startMs + b.offsetMs
      const available = target.endMs - start
      if (available <= 0) {
        issues.push({ bindingId: b.id, kind: "out_of_range", message: `${where(b)} starts ${sec(b.offsetMs)} in, after the end of ${target.label} (${sec(target.endMs - target.startMs)}).` })
        blocked = true; break
      }
      let duration = segment
      let fills = false
      if (b.loop || (b.playback === "continuous" && segment < available)) {
        if (!b.loop) {
          issues.push({ bindingId: b.id, kind: "too_short", message: `${where(b)}: "${asset.name}" covers ${sec(segment)} of ${target.label}'s ${sec(available)}. Loop it, extend it, change its coverage or choose another recording.` })
          blocked = true; break
        }
        duration = available
        fills = true
      }
      if (duration > available) {
        if (b.overflow !== "cut_at_end") {
          issues.push({ bindingId: b.id, kind: "too_long", message: `${where(b)}: "${asset.name}" runs ${sec(duration)} but ${target.label} has ${sec(available)} from its start. Extend the shot, trim the recording, choose another take, or set it to end with the ${b.scopeType}.` })
          blocked = true; break
        }
        duration = available
        fills = true
      }
      cues.push({
        bindingId: b.id, assetId: asset.id, sha256: asset.sha256!, path: asset.playbackPath!, purpose: b.purpose,
        startMs: start, sourceInMs: b.sourceInMs, durationMs: duration, gain: b.gain,
        fadeInMs: Math.min(b.fadeInMs, Math.floor(duration / 2)), fadeOutMs: Math.min(b.fadeOutMs, Math.floor(duration / 2)),
        loop: b.loop, segmentMs: segment, fillsScope: fills,
      })
      // The shots under this cue: whole shots whose time overlaps it.
      for (const shot of target.shots) {
        const s = byShot.get(shot)!
        if (s.startMs < start + duration && s.endMs > start) (b.nativeAudio === "mute" ? muted : b.nativeAudio === "keep" && b.purpose === "dialogue" ? keep : new Set<number>()).add(shot)
      }
    }
    if (blocked) continue

    if (b.scopeType === "scene" && b.playback !== "repeat_per_shot" && options.foreign?.length) {
      const last = cues[cues.length - 1]
      const crosses = options.foreign.some(f => f.startMs < last.startMs + last.durationMs && f.endMs > last.startMs)
      if (crosses) {
        cues.pop()
        issues.push({ bindingId: b.id, kind: "conflict", message: `${where(b)} would play over clips that aren't part of this film. Keep the film's shots together in the edit.` })
      }
    }
  }

  // Two approved dialogue recordings speaking at once would be two overlapping versions of a line.
  const dialogue = cues.filter(c => c.purpose === "dialogue").sort((a, b) => a.startMs - b.startMs)
  for (let i = 1; i < dialogue.length; i++) {
    const prev = dialogue[i - 1], cur = dialogue[i]
    if (cur.startMs < prev.startMs + prev.durationMs) {
      issues.push({ bindingId: cur.bindingId, kind: "conflict", message: `Two dialogue recordings overlap at ${sec(cur.startMs)}. Move one so they don't speak over each other.` })
    }
  }
  for (const shot of muted) if (keep.has(shot)) {
    issues.push({ bindingId: null, kind: "conflict", message: `Shot ${shot}: one dialogue recording mutes the shot's own sound and another keeps it. Choose one.` })
  }
  return { cues, mutedShots: [...muted].sort((a, b) => a - b), issues }
}

/** Planned shot spans from the plan's durations, for the Long Form readiness check before an edit exists. */
export function plannedSpans(shots: { title: string; durationSec: number }[]): ShotSpan[] {
  let cursor = 0
  return shots.map((shot, index) => {
    const span = { shotNumber: index + 1, startMs: cursor, endMs: cursor + Math.round(shot.durationSec * 1000), title: shot.title }
    cursor = span.endMs
    return span
  })
}

// ── Edits: films in a timeline ──────────────────────────────────────────────────────────────────

/** A video clip on the edit's video track (only what audio planning needs). */
export type EditClip = { id: string; start_ms: number; end_ms: number; metadata: Record<string, unknown> | null }
/** film_shot_id → the film (lineage root) and shot it came from, with the film's current shot titles. */
export type FilmShotIndex = Record<string, { rootId: string; shotNumber: number; shotName: string; titles: Record<number, string> }>
export type FilmAudioData = { assets: AudioAsset[]; bindings: AudioBinding[] }
export type TimelineFilm = {
  rootId: string
  spans: ShotSpan[]
  /** Clip ids of each film shot in the edit, for muting their own sound. */
  clipsByShot: Map<number, string[]>
  foreign: { startMs: number; endMs: number }[]
  currentTitles: Map<number, string>
}

/** Groups an edit's film clips by film, with each shot's place; everything else is foreign to that film. */
export function groupFilmClips(videoClips: EditClip[], index: FilmShotIndex): TimelineFilm[] {
  const films = new Map<string, TimelineFilm>()
  for (const clip of videoClips) {
    const ref = index[String((clip.metadata ?? {}).film_shot_id ?? "")]
    if (!ref) continue
    const entry: TimelineFilm = films.get(ref.rootId) ?? {
      rootId: ref.rootId, spans: [], clipsByShot: new Map(), foreign: [],
      currentTitles: new Map(Object.entries(ref.titles).map(([n, t]) => [Number(n), t])),
    }
    films.set(ref.rootId, entry)
    if (!entry.spans.some(s => s.shotNumber === ref.shotNumber)) entry.spans.push({ shotNumber: ref.shotNumber, startMs: clip.start_ms, endMs: clip.end_ms, title: ref.shotName })
    entry.clipsByShot.set(ref.shotNumber, [...(entry.clipsByShot.get(ref.shotNumber) ?? []), clip.id])
  }
  for (const film of films.values()) {
    const own = new Set([...film.clipsByShot.values()].flat())
    film.foreign = videoClips.filter(c => !own.has(c.id)).map(c => ({ startMs: c.start_ms, endMs: c.end_ms }))
  }
  return [...films.values()]
}

export type ExportAudio = {
  cues: (AudioCue & { rootId: string })[]
  mutedClipIds: string[]
  issues: (AudioIssue & { rootId: string })[]
  manifest: Record<string, unknown>[]
}

/**
 * Plans every locked recording of every film in an edit. The export gate and the editor preview both
 * use this, so what you hear while editing is what the export will contain.
 */
export function planEditAudio(videoClips: EditClip[], index: FilmShotIndex, audioByRoot: Record<string, FilmAudioData>): ExportAudio {
  const result: ExportAudio = { cues: [], mutedClipIds: [], issues: [], manifest: [] }
  for (const film of groupFilmClips(videoClips, index)) {
    const audio = audioByRoot[film.rootId]
    if (!audio?.bindings.length) continue
    const plan = planFilmAudio(audio.bindings, new Map(audio.assets.map(a => [a.id, a])), film.spans, { foreign: film.foreign, currentTitles: film.currentTitles })
    result.cues.push(...plan.cues.map(c => ({ ...c, rootId: film.rootId })))
    result.issues.push(...plan.issues.map(i => ({ ...i, rootId: film.rootId })))
    result.mutedClipIds.push(...plan.mutedShots.flatMap(n => film.clipsByShot.get(n) ?? []))
    result.manifest.push({ production_root_id: film.rootId, ...audioManifest(plan) })
  }
  return result
}

/** One video clip as placed in the edit and as it actually lands in the rendered output. */
export type RenderedClip = { startMs: number; endMs: number; outStartMs: number; outDurationMs: number }

/** Edit time to output time: inside a clip, time runs 1:1 from where that clip really starts. */
export function toOutputMs(timelineMs: number, clips: RenderedClip[]): number {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs)
  let clip = sorted[0]
  for (const c of sorted) if (c.startMs <= timelineMs) clip = c
  if (!clip) return timelineMs
  return clip.outStartMs + Math.max(0, Math.min(timelineMs - clip.startMs, clip.outDurationMs))
}

/**
 * Moves each cue from edit time to where its shot really plays in the render (crossfades pull later
 * shots earlier). A recording keeps its own length; only a cue set to fill its span follows the
 * span's real end, so nothing is cut that the creator didn't choose to cut.
 */
export function remapCues<C extends AudioCue>(cues: C[], clips: RenderedClip[]): C[] {
  if (!clips.length) return cues
  return cues.map(cue => {
    const startMs = toOutputMs(cue.startMs, clips)
    if (!cue.fillsScope) return { ...cue, startMs }
    // The span end is the last moment of the clip the cue ends in.
    const endMs = toOutputMs(cue.startMs + cue.durationMs - 1, clips) + 1
    const durationMs = Math.max(50, endMs - startMs)
    return { ...cue, startMs, durationMs, fadeOutMs: Math.min(cue.fadeOutMs, Math.floor(durationMs / 2)), fadeInMs: Math.min(cue.fadeInMs, Math.floor(durationMs / 2)) }
  })
}

// ── Preview ──────────────────────────────────────────────────────────────────────────────────────

/** Where a cue plays in output time: a recording keeps its length; a fill cue follows its span. */
export function cueWindow(cue: Pick<AudioCue, "startMs" | "durationMs" | "fillsScope">, toOutputMs: (timelineMs: number) => number) {
  const start = toOutputMs(cue.startMs)
  const end = cue.fillsScope ? toOutputMs(cue.startMs + cue.durationMs - 1) + 1 : start + cue.durationMs
  return { start, end: Math.max(start + 50, end) }
}

/** Position in the file and loudness at a moment of output time, or null when the cue is silent then. */
export function cueStateAt(cue: Pick<AudioCue, "sourceInMs" | "loop" | "segmentMs" | "fadeInMs" | "fadeOutMs" | "gain">, window: { start: number; end: number }, outputMs: number): { fileSec: number; volume: number } | null {
  if (outputMs < window.start || outputMs >= window.end) return null
  const elapsed = outputMs - window.start
  const fileMs = cue.sourceInMs + (cue.loop ? elapsed % Math.max(1, cue.segmentMs) : elapsed)
  const length = window.end - window.start
  let fade = 1
  if (cue.fadeInMs > 0 && elapsed < cue.fadeInMs) fade = elapsed / cue.fadeInMs
  if (cue.fadeOutMs > 0 && length - elapsed < cue.fadeOutMs) fade = Math.min(fade, (length - elapsed) / cue.fadeOutMs)
  // Browsers can't play above 100%; a louder-than-original gain is heard at full volume in preview.
  return { fileSec: fileMs / 1000, volume: Math.max(0, Math.min(1, cue.gain * fade)) }
}

// ── Rendering ─────────────────────────────────────────────────────────────────────────────────────

const n3 = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0).toFixed(3)

/**
 * Lays the locked recordings over the finished picture at exactly their placed times and gains,
 * without ducking or time-stretching them. The picture's own sound (already muted where decided)
 * stays underneath. A looped cue repeats only its chosen segment.
 */
export function buildLockedAudioMixArgs(o: { video: string; output: string; totalSec: number; cues: (AudioCue & { localPath: string })[]; baseHasAudio?: boolean }): string[] {
  if (!o.cues.length) throw new Error("No locked audio to mix")
  const filters: string[] = []
  o.cues.forEach((c, i) => {
    const duration = Math.max(0.05, c.durationMs / 1000)
    const delay = Math.round(Math.max(0, c.startMs))
    const gain = Math.max(0, Math.min(2, c.gain))
    const segment = `atrim=start=${n3(c.sourceInMs / 1000)}:duration=${n3(c.segmentMs / 1000)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo`
    const loop = c.loop ? `,aloop=loop=-1:size=${Math.max(1, Math.round((c.segmentMs / 1000) * 48000))},atrim=duration=${n3(duration)},asetpts=PTS-STARTPTS` : `,atrim=duration=${n3(duration)}`
    const fades = [
      c.fadeInMs > 0 ? `afade=t=in:st=0:d=${n3(c.fadeInMs / 1000)}` : "",
      c.fadeOutMs > 0 ? `afade=t=out:st=${n3(duration - c.fadeOutMs / 1000)}:d=${n3(c.fadeOutMs / 1000)}` : "",
    ].filter(Boolean).join(",")
    filters.push(`[${i + 1}:a]${segment}${loop},volume=${gain.toFixed(3)}${fades ? `,${fades}` : ""},adelay=${delay}|${delay}[l${i}]`)
  })
  // A picture with its sound removed still gets the locked audio, over silence.
  filters.push(o.baseHasAudio === false ? "anullsrc=channel_layout=stereo:sample_rate=48000[base]" : "[0:a]aresample=48000,aformat=channel_layouts=stereo[base]")
  filters.push(`[base]${o.cues.map((_, i) => `[l${i}]`).join("")}amix=inputs=${o.cues.length + 1}:duration=first:normalize=0[aout]`)
  return [
    "-y", "-i", o.video,
    ...o.cues.flatMap(c => ["-i", c.localPath]),
    "-filter_complex", filters.join(";"),
    "-map", "0:v:0", "-map", "[aout]",
    "-t", n3(o.totalSec),
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    o.output,
  ]
}

/** What the render manifest records about locked audio. */
export function audioManifest(plan: AudioPlan) {
  return {
    placements: plan.cues.map(c => ({
      binding_id: c.bindingId, asset_id: c.assetId, sha256: c.sha256, purpose: c.purpose, start_ms: c.startMs,
      source_in_ms: c.sourceInMs, duration_ms: c.durationMs, gain: c.gain, fade_in_ms: c.fadeInMs, fade_out_ms: c.fadeOutMs, loop: c.loop,
    })),
    muted_shots: plan.mutedShots,
  }
}

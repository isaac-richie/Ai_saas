import type { TimelineClip } from '@/core/types/timeline';
import { MIN_CLIP_MS, isClipLocked, rippleClips } from '@/core/services/edit-agent';
import { clipSpeed, sourceDurationMs, timelineToOutputMs } from '@/core/services/timeline-ops';
import { wordsToCaptionSegments, type CaptionSegment, type CaptionWord } from '@/core/services/captions';

/**
 * Transcript editing (Professional Editor spec 4).
 *
 * Words are timed in their source video's own footage and keyed to that source, never to a
 * timeline position. Where a word sits in the edit is worked out from the clips each time, so
 * splitting, trimming, reordering or undoing shots always moves the right words with them.
 * Cuts are made from the exact word a creator picked (its clip and id), never by matching text.
 */

export interface TranscriptWord {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  /** The speech engine was unsure about the line this word is in. */
  low?: boolean;
  /** The creator corrected the spelling; `heard` keeps what the engine wrote. */
  fixed?: boolean;
  heard?: string;
}

export interface SourceTranscript {
  source_key: string;
  language: string | null;
  words: TranscriptWord[];
}

type Clip = TimelineClip;

/** Silence kept either side of a cut, so word endings and the next word's first sound survive. */
export const CUT_HANDLE_MS = 80;
export const MAX_WORD_CHARS = 60;

/** Which source a clip plays: its take when it has one, otherwise the video file. */
export function sourceKeyOf(clip: Pick<Clip, 'take_id' | 'asset_url'>): string | null {
  return clip.take_id || clip.asset_url || null;
}

type RawWord = { word: string; start: number; end: number };
type RawSegment = { start: number; end: number; avg_logprob?: number; no_speech_prob?: number };

/** Turns the speech engine's words (seconds) into transcript words (ms), flagging unsure lines. */
export function buildTranscriptWords(words: RawWord[], segments: RawSegment[] = []): TranscriptWord[] {
  const unsure = segments.filter((s) => (s.avg_logprob ?? 0) < -1 || (s.no_speech_prob ?? 0) > 0.6);
  return words
    .map((w) => ({ text: String(w.word ?? '').trim(), start: Number(w.start), end: Number(w.end) }))
    .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end) && w.start >= 0)
    .sort((a, b) => a.start - b.start)
    .map((w, i) => {
      const start_ms = Math.round(w.start * 1000);
      const end_ms = Math.max(start_ms, Math.round(w.end * 1000));
      const mid = (w.start + w.end) / 2;
      const low = unsure.some((s) => mid >= s.start && mid <= s.end);
      return { id: `w${i}`, text: w.text.slice(0, MAX_WORD_CHARS), start_ms, end_ms, ...(low ? { low: true } : {}) };
    });
}

/** Reads words saved in the database, dropping anything malformed. */
export function readWords(value: unknown): TranscriptWord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((w) => {
    const r = w as Partial<TranscriptWord> | null;
    if (!r || typeof r.id !== 'string' || typeof r.text !== 'string') return [];
    const start = Number(r.start_ms);
    const end = Number(r.end_ms);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return [];
    return [{
      id: r.id, text: r.text, start_ms: start, end_ms: end,
      ...(r.low ? { low: true } : {}), ...(r.fixed ? { fixed: true } : {}), ...(typeof r.heard === 'string' ? { heard: r.heard } : {}),
    }];
  });
}

/** Correcting spelling changes the words only; the footage is never touched. */
export function correctWords(words: TranscriptWord[], id: string, text: string): TranscriptWord[] | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > MAX_WORD_CHARS) return null;
  const target = words.find((w) => w.id === id);
  if (!target) return null;
  return words.map((w) => {
    if (w.id !== id) return w;
    const heard = w.heard ?? w.text;
    const rest: TranscriptWord = { id: w.id, text: clean, start_ms: w.start_ms, end_ms: w.end_ms, ...(w.low ? { low: true } : {}) };
    return clean === heard ? rest : { ...rest, fixed: true, heard };
  });
}

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'hmm', 'hm', 'mm']);

/** A filler sound worth suggesting for removal. Quoted words are never suggested. */
export function isFiller(text: string): boolean {
  if (/["“”‘’]/.test(text)) return false;
  return FILLERS.has(text.toLowerCase().replace(/[^a-z]/g, ''));
}

const mid = (w: TranscriptWord) => (w.start_ms + w.end_ms) / 2;

/** The stretch of footage a clip plays, in source milliseconds. */
export function footageWindow(clip: Pick<Clip, 'start_ms' | 'end_ms' | 'trim_start_ms' | 'metadata'>) {
  const from = Math.max(0, clip.trim_start_ms);
  return { from, to: from + (clip.end_ms - clip.start_ms) * clipSpeed(clip) };
}

export type TranscriptItem =
  | { kind: 'shot'; clipId: string; index: number; atMs: number; state: 'ready' | 'missing' | 'silent' }
  | { kind: 'word'; key: string; clipId: string; sourceKey: string; word: TranscriptWord; atMs: number; endMs: number }
  | { kind: 'removed'; key: string; clipId: string; edge: 'head' | 'tail'; words: TranscriptWord[] };

const sorted = (videoClips: Clip[]) => [...videoClips].sort((a, b) => a.start_ms - b.start_ms);

/**
 * The edit as text: each shot's words in playing order, with the words that were cut shown
 * where they were, so they can be brought back. Each cut word appears once, beside the shot
 * whose footage it sits just before (or after, at the end of the source).
 */
export function transcriptView(videoClips: Clip[], transcripts: SourceTranscript[]): TranscriptItem[] {
  const bySource = new Map(transcripts.map((t) => [t.source_key, t]));
  const clips = sorted(videoClips);
  // Cut words per source, anchored to one clip edge.
  const anchors = new Map<string, { head: TranscriptWord[]; tail: TranscriptWord[] }>();
  for (const [key, t] of bySource) {
    const own = clips.filter((c) => sourceKeyOf(c) === key);
    if (!own.length) continue;
    const windows = own.map((c) => ({ c, ...footageWindow(c) }));
    for (const w of t.words) {
      const m = mid(w);
      if (windows.some((x) => m >= x.from && m < x.to)) continue;
      const after = windows.filter((x) => x.from > m).sort((a, b) => a.from - b.from)[0];
      const before = windows.filter((x) => x.to <= m).sort((a, b) => b.to - a.to)[0];
      const target = after ?? before;
      if (!target) continue;
      const slot = anchors.get(target.c.id) ?? { head: [], tail: [] };
      (after ? slot.head : slot.tail).push(w);
      anchors.set(target.c.id, slot);
    }
  }

  const items: TranscriptItem[] = [];
  clips.forEach((clip, index) => {
    const key = sourceKeyOf(clip);
    const t = key ? bySource.get(key) : undefined;
    const state = !t ? 'missing' : t.words.length === 0 ? 'silent' : 'ready';
    items.push({ kind: 'shot', clipId: clip.id, index, atMs: clip.start_ms, state });
    if (!t || !key) return;
    const { from, to } = footageWindow(clip);
    const speed = clipSpeed(clip);
    const slot = anchors.get(clip.id);
    if (slot?.head.length) items.push({ kind: 'removed', key: `${clip.id}:head`, clipId: clip.id, edge: 'head', words: slot.head });
    for (const w of t.words) {
      const m = mid(w);
      if (m < from || m >= to) continue;
      const atMs = Math.round(clip.start_ms + Math.max(0, w.start_ms - from) / speed);
      const endMs = Math.round(Math.min(clip.end_ms, clip.start_ms + Math.max(0, w.end_ms - from) / speed));
      items.push({ kind: 'word', key: `${clip.id}:${w.id}`, clipId: clip.id, sourceKey: key, word: w, atMs, endMs: Math.max(atMs, endMs) });
    }
    if (slot?.tail.length) items.push({ kind: 'removed', key: `${clip.id}:tail`, clipId: clip.id, edge: 'tail', words: slot.tail });
  });
  return items;
}

type Result = { clips: Clip[] } | { error: string };

function lockedReason(clip: Clip, lockedTracks: Set<string>): string | null {
  if (lockedTracks.has(clip.track_id)) return 'The shots track is locked. Unlock it to cut.';
  if (isClipLocked(clip)) return 'One of those shots is locked. Unlock it to cut.';
  return null;
}

/** Lays a track's clips end to end again, in the given order, leaving other tracks alone. */
function relay(all: Clip[], trackId: string, ordered: Clip[]): Clip[] {
  const laid = rippleClips(ordered);
  return [...all.filter((c) => c.track_id !== trackId), ...laid];
}

/**
 * Removes the footage under the chosen words. Each run of neighbouring words becomes one cut that
 * stops just short of the words either side; a shot cut in the middle becomes two shots joined by
 * a plain cut. Nothing is deleted: the footage stays in the source and the words can be brought back.
 */
export function cutWords(
  allClips: Clip[],
  videoTrackId: string,
  transcripts: SourceTranscript[],
  keys: string[],
  opts: { newId?: () => string; lockedTracks?: Set<string> } = {},
): Result {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const lockedTracks = opts.lockedTracks ?? new Set<string>();
  const picked = new Set(keys);
  if (!picked.size) return { error: 'Select the words to cut first.' };
  const track = sorted(allClips.filter((c) => c.track_id === videoTrackId));
  const view = transcriptView(track, transcripts);
  const words = view.filter((i): i is Extract<TranscriptItem, { kind: 'word' }> => i.kind === 'word');
  const touched = new Set(words.filter((w) => picked.has(w.key)).map((w) => w.clipId));
  if (!touched.size) return { error: 'Those words are no longer in the edit.' };

  const out: Clip[] = [];
  for (const clip of track) {
    if (!touched.has(clip.id)) { out.push(clip); continue; }
    const locked = lockedReason(clip, lockedTracks);
    if (locked) return { error: locked };
    const own = words.filter((w) => w.clipId === clip.id).map((w) => ({ w: w.word, on: picked.has(w.key) }));
    const { from, to } = footageWindow(clip);
    // Each run of picked words, widened into the silence around it.
    const cuts: [number, number][] = [];
    for (let i = 0; i < own.length; i++) {
      if (!own[i].on) continue;
      let j = i;
      while (j + 1 < own.length && own[j + 1].on) j++;
      const prev = own[i - 1]?.w;
      const next = own[j + 1]?.w;
      const first = own[i].w;
      const last = own[j].w;
      const c0 = prev ? prev.end_ms + Math.min(CUT_HANDLE_MS, Math.max(0, first.start_ms - prev.end_ms) / 2) : from;
      const c1 = next ? next.start_ms - Math.min(CUT_HANDLE_MS, Math.max(0, next.start_ms - last.end_ms) / 2) : to;
      cuts.push([Math.max(from, c0), Math.min(to, Math.max(c0, c1))]);
      i = j;
    }
    // What is left of the shot, as stretches of footage.
    const pieces: [number, number][] = [];
    let cursor = from;
    for (const [a, b] of cuts) {
      if (a > cursor) pieces.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < to) pieces.push([cursor, to]);
    const speed = clipSpeed(clip);
    const kept = own.filter((x) => !x.on).map((x) => x.w);
    const usable: [number, number][] = [];
    for (const p of pieces) {
      if ((p[1] - p[0]) / speed >= MIN_CLIP_MS) { usable.push(p); continue; }
      // A sliver of silence just disappears; a sliver holding a word would be too short to play.
      if (kept.some((w) => mid(w) >= p[0] && mid(w) < p[1])) return { error: 'That would leave a piece of a shot too short to play. Select a word or two more.' };
    }
    usable.forEach(([a, b], n) => {
      const firstPiece = n === 0;
      const lastPiece = n === usable.length - 1;
      out.push({
        ...clip,
        id: firstPiece ? clip.id : newId(),
        trim_start_ms: Math.round(a),
        start_ms: 0,
        end_ms: Math.round((b - a) / speed),
        transition_in: firstPiece ? clip.transition_in : null,
        transition_in_ms: firstPiece ? clip.transition_in_ms : 0,
        transition_out: lastPiece ? clip.transition_out : null,
        transition_out_ms: lastPiece ? clip.transition_out_ms : 0,
      });
    });
  }
  return { clips: relay(allClips, videoTrackId, out) };
}

/**
 * Brings back cut words beside a shot, by opening that edge of the shot back up. When that closes
 * the gap to the neighbouring piece of the same footage, the two pieces become one shot again.
 */
export function restoreWords(
  allClips: Clip[],
  videoTrackId: string,
  transcripts: SourceTranscript[],
  clipId: string,
  edge: 'head' | 'tail',
  opts: { lockedTracks?: Set<string> } = {},
): Result {
  const track = sorted(allClips.filter((c) => c.track_id === videoTrackId));
  const at = track.findIndex((c) => c.id === clipId);
  const clip = track[at];
  if (!clip) return { error: 'That shot is no longer in the edit.' };
  const locked = lockedReason(clip, opts.lockedTracks ?? new Set());
  if (locked) return { error: locked };
  const run = transcriptView(track, transcripts).find((i) => i.kind === 'removed' && i.clipId === clipId && i.edge === edge);
  if (!run || run.kind !== 'removed') return { error: 'There is nothing to bring back there.' };
  const key = sourceKeyOf(clip);
  const { from, to } = footageWindow(clip);
  const speed = clipSpeed(clip);
  const siblings = track.filter((c) => c.id !== clip.id && sourceKeyOf(c) === key).map((c) => ({ c, ...footageWindow(c) }));
  const out = [...track];

  if (edge === 'head') {
    const below = siblings.filter((s) => s.to <= from + 1).sort((a, b) => b.to - a.to)[0];
    const floor = below ? below.to : 0;
    // Between two pieces of the same footage, the whole gap comes back so they can join again.
    const newFrom = below ? floor : Math.max(0, run.words[0].start_ms - CUT_HANDLE_MS);
    const prev = track[at - 1];
    if (below && prev?.id === below.c.id && newFrom <= floor + 1 && clipSpeed(prev) === speed && !lockedReason(prev, opts.lockedTracks ?? new Set())) {
      // The previous shot is the footage just before this one: join them.
      out.splice(at - 1, 2, { ...prev, end_ms: prev.start_ms + Math.round((to - below.from) / speed), transition_out: clip.transition_out, transition_out_ms: clip.transition_out_ms });
    } else {
      out[at] = { ...clip, trim_start_ms: Math.round(newFrom), end_ms: clip.start_ms + Math.round((to - newFrom) / speed) };
    }
  } else {
    const above = siblings.filter((s) => s.from >= to - 1).sort((a, b) => a.from - b.from)[0];
    const source = sourceDurationMs(clip);
    const lastWord = run.words[run.words.length - 1];
    let ceiling = above ? above.from : lastWord.end_ms + CUT_HANDLE_MS;
    if (source !== null) ceiling = Math.min(ceiling, source);
    const newTo = Math.max(to, above ? ceiling : Math.min(ceiling, lastWord.end_ms + CUT_HANDLE_MS));
    const next = track[at + 1];
    if (above && next?.id === above.c.id && newTo >= above.from - 1 && clipSpeed(next) === speed && !lockedReason(next, opts.lockedTracks ?? new Set())) {
      out.splice(at, 2, { ...clip, end_ms: clip.start_ms + Math.round((above.to - from) / speed), transition_out: next.transition_out, transition_out_ms: next.transition_out_ms });
    } else {
      out[at] = { ...clip, end_ms: clip.start_ms + Math.round((newTo - from) / speed) };
    }
  }
  return { clips: relay(allClips, videoTrackId, out) };
}

/**
 * Caption lines from the transcript as the edit plays now, in finished-video time, using the
 * creator's spelling. No new transcription and no export are needed. Muted shots are left out.
 */
export function transcriptCaptions(videoClips: Clip[], transcripts: SourceTranscript[], trackMuted = false): CaptionSegment[] {
  if (trackMuted) return [];
  const clips = sorted(videoClips);
  const audible = new Set(clips.filter((c) => c.volume > 0).map((c) => c.id));
  const words: CaptionWord[] = transcriptView(clips, transcripts)
    .filter((i): i is Extract<TranscriptItem, { kind: 'word' }> => i.kind === 'word' && audible.has(i.clipId))
    .map((i) => ({
      word: i.word.text,
      start_sec: timelineToOutputMs(clips, i.atMs) / 1000,
      end_sec: timelineToOutputMs(clips, i.endMs) / 1000,
    }));
  return wordsToCaptionSegments(words);
}

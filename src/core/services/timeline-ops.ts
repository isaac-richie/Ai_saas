import type { TimelineClip } from '@/core/types/timeline';
import { MIN_CLIP_MS, alignCutsToBeats, rippleClips, transitionOverlapMs } from '@/core/services/edit-agent';

type Clip = Pick<TimelineClip, 'id' | 'track_id' | 'start_ms' | 'end_ms' | 'trim_start_ms' | 'metadata'>;

/** Full length of the source footage, when known. */
export function sourceDurationMs(clip: Clip): number | null {
  const value = Number((clip.metadata as Record<string, unknown> | null)?.source_duration_ms);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

/** How fast a clip plays its footage: 0.5 is slow motion, 2 is double speed. Missing means 1. */
export function clipSpeed(clip: Pick<TimelineClip, 'metadata'>): number {
  const value = Number((clip.metadata as Record<string, unknown> | null)?.speed);
  return Number.isFinite(value) && value > 0 ? Math.max(MIN_SPEED, Math.min(MAX_SPEED, value)) : 1;
}

/**
 * Changes a clip's speed. The same stretch of footage plays, so the clip gets longer when
 * slowed and shorter when sped up, and the shots after it move to close the gap.
 */
export function setClipSpeed<T extends Clip>(clips: T[], id: string, speed: number): T[] {
  const clip = clips.find((c) => c.id === id);
  if (!clip || !Number.isFinite(speed)) return clips;
  const next = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
  const old = clipSpeed(clip);
  if (next === old) return clips;
  const footageMs = (clip.end_ms - clip.start_ms) * old;
  const duration = Math.round(Math.max(MIN_CLIP_MS, footageMs / next));
  const updated = { ...clip, end_ms: clip.start_ms + duration, metadata: { ...((clip.metadata as object) || {}), speed: next } };
  return rippleTrack(clips.map((c) => (c.id === id ? updated : c)), clip.track_id);
}

function rippleTrack<T extends Clip>(clips: T[], trackId: string): T[] {
  const onTrack = clips.filter((c) => c.track_id === trackId).sort((a, b) => a.start_ms - b.start_ms);
  const laid = new Map(rippleClips(onTrack).map((c) => [c.id, c]));
  return clips.map((c) => laid.get(c.id) ?? c);
}

/**
 * Trims one edge of a clip by `deltaMs` (positive moves the edge right) and closes the gap.
 * The head can only move within the footage, and the clip never drops below the minimum length.
 */
export function trimClip<T extends Clip>(clips: T[], id: string, edge: 'start' | 'end', deltaMs: number): T[] {
  const clip = clips.find((c) => c.id === id);
  if (!clip || !Number.isFinite(deltaMs)) return clips;
  const duration = clip.end_ms - clip.start_ms;
  const source = sourceDurationMs(clip);
  // Timeline time × speed = footage time; trims and limits are worked out in footage time.
  const speed = clipSpeed(clip);
  let next: T;

  if (edge === 'end') {
    const maxDuration = source !== null ? (source - clip.trim_start_ms) / speed : duration;
    const newDuration = Math.round(Math.max(MIN_CLIP_MS, Math.min(Math.max(maxDuration, MIN_CLIP_MS), duration + deltaMs)));
    next = { ...clip, end_ms: clip.start_ms + newDuration };
  } else {
    const tail = clip.trim_start_ms + duration * speed;
    // The in-point can move back to the start of the footage, or forward until the minimum length.
    const newTrim = Math.round(Math.max(0, Math.min(tail - MIN_CLIP_MS * speed, clip.trim_start_ms + deltaMs * speed)));
    next = { ...clip, trim_start_ms: newTrim, end_ms: clip.start_ms + Math.round((tail - newTrim) / speed) };
  }

  return rippleTrack(clips.map((c) => (c.id === id ? next : c)), clip.track_id);
}

/** Moves a clip to a new position among the clips on its track. */
export function reorderClip<T extends Clip>(clips: T[], id: string, toIndex: number): T[] {
  const clip = clips.find((c) => c.id === id);
  if (!clip) return clips;
  const onTrack = clips.filter((c) => c.track_id === clip.track_id).sort((a, b) => a.start_ms - b.start_ms);
  const without = onTrack.filter((c) => c.id !== id);
  const index = Math.max(0, Math.min(without.length, Math.round(toIndex)));
  without.splice(index, 0, clip);
  const laid = new Map(rippleClips(without).map((c) => [c.id, c]));
  return clips.map((c) => laid.get(c.id) ?? c);
}

/** Where a clip dragged to `atMs` should land among the other clips on its track. */
export function dropIndex<T extends Clip>(clips: T[], id: string, atMs: number): number {
  const clip = clips.find((c) => c.id === id);
  if (!clip) return 0;
  const others = clips
    .filter((c) => c.track_id === clip.track_id && c.id !== id)
    .sort((a, b) => a.start_ms - b.start_ms);
  return others.filter((c) => (c.start_ms + c.end_ms) / 2 < atMs).length;
}

export function removeAndRipple<T extends Clip>(clips: T[], id: string): T[] {
  const clip = clips.find((c) => c.id === id);
  if (!clip) return clips;
  return rippleTrack(clips.filter((c) => c.id !== id), clip.track_id);
}

/** Splits a clip in two at a timeline position; both halves keep the same footage and settings. */
export function splitClip<T extends Clip>(clips: T[], id: string, atMs: number, newId: string): T[] {
  const clip = clips.find((c) => c.id === id);
  if (!clip) return clips;
  const offset = Math.round(atMs - clip.start_ms);
  if (offset < MIN_CLIP_MS || clip.end_ms - clip.start_ms - offset < MIN_CLIP_MS) return clips;
  const left = { ...clip, end_ms: clip.start_ms + offset };
  const right = { ...clip, id: newId, start_ms: clip.start_ms + offset, trim_start_ms: clip.trim_start_ms + Math.round(offset * clipSpeed(clip)) };
  return clips.flatMap((c) => (c.id === id ? [left, right] : [c]));
}

type TimedClip = Pick<TimelineClip, 'start_ms' | 'end_ms' | 'transition_out' | 'transition_out_ms'>;

/**
 * Each clip's span on the video track and in the finished video. Transitions overlap two
 * shots, so the finished video is shorter; the cut is placed at the middle of each transition.
 */
function spans(videoClips: TimedClip[]) {
  const sorted = [...videoClips].sort((a, b) => a.start_ms - b.start_ms);
  const out: { t0: number; t1: number; o0: number; o1: number }[] = [];
  let renderStart = 0;
  let previousHalf = 0;
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const next = sorted[i + 1];
    const duration = c.end_ms - c.start_ms;
    const overlap = next ? transitionOverlapMs(c, duration, next.end_ms - next.start_ms) : 0;
    out.push({ t0: c.start_ms, t1: c.end_ms, o0: renderStart + previousHalf, o1: renderStart + duration - overlap / 2 });
    renderStart += duration - overlap;
    previousHalf = overlap / 2;
  }
  return out;
}

function mapBetween(points: { a0: number; a1: number; b0: number; b1: number }[], at: number): number {
  if (points.length === 0) return Math.max(0, at);
  for (const p of points) {
    if (at <= p.a1 || p === points[points.length - 1]) {
      if (at <= p.a0) return p.b0 - (p.a0 - at);
      const span = p.a1 - p.a0;
      if (at >= p.a1) return p.b1 + (at - p.a1);
      return p.b0 + ((at - p.a0) / span) * (p.b1 - p.b0);
    }
  }
  return at;
}

/** Maps a moment on the video track to the same moment in the finished video. */
export function timelineToOutputMs(videoClips: TimedClip[], atMs: number): number {
  return Math.max(0, mapBetween(spans(videoClips).map((s) => ({ a0: s.t0, a1: s.t1, b0: s.o0, b1: s.o1 })), atMs));
}

/** Where a moment of the finished video sits on the video track. */
export function outputToTimelineMs(videoClips: TimedClip[], outputMs: number): number {
  return Math.max(0, mapBetween(spans(videoClips).map((s) => ({ a0: s.o0, a1: s.o1, b0: s.t0, b1: s.t1 })), outputMs));
}

/** Captions and music sit anywhere on their track: moving keeps the length, never before zero. */
export function moveFreeClip<T extends Clip>(clips: T[], id: string, startMs: number): T[] {
  return clips.map((c) => {
    if (c.id !== id) return c;
    const start = Math.max(0, Math.round(Number.isFinite(startMs) ? startMs : c.start_ms));
    return { ...c, start_ms: start, end_ms: start + (c.end_ms - c.start_ms) };
  });
}

/** Resizes a free clip; music cannot run past the end of its song. */
export function trimFreeClip<T extends Clip>(clips: T[], id: string, edge: 'start' | 'end', deltaMs: number): T[] {
  return clips.map((c) => {
    if (c.id !== id || !Number.isFinite(deltaMs)) return c;
    const source = sourceDurationMs(c);
    if (edge === 'end') {
      const max = source !== null ? c.start_ms + source - c.trim_start_ms : Infinity;
      return { ...c, end_ms: Math.round(Math.min(max, Math.max(c.start_ms + MIN_CLIP_MS, c.end_ms + deltaMs))) };
    }
    const lowest = source !== null ? Math.max(0, c.start_ms - c.trim_start_ms) : 0;
    const start = Math.round(Math.min(c.end_ms - MIN_CLIP_MS, Math.max(lowest, c.start_ms + deltaMs)));
    const trim = source !== null ? c.trim_start_ms + (start - c.start_ms) : c.trim_start_ms;
    return { ...c, start_ms: start, trim_start_ms: trim };
  });
}

/** The song's beats in finished-video seconds, limited to where the song actually plays. */
export function songBeatsOutputSec(song: Pick<TimelineClip, 'start_ms' | 'end_ms' | 'trim_start_ms' | 'metadata'> | undefined): number[] {
  const beats = (song?.metadata as { beats?: unknown } | null | undefined)?.beats;
  if (!song || !Array.isArray(beats)) return [];
  return beats
    .filter((b): b is number => typeof b === 'number' && Number.isFinite(b))
    .map((b) => (song.start_ms + b * 1000 - song.trim_start_ms) / 1000)
    .filter((s) => s * 1000 >= song.start_ms && s * 1000 <= song.end_ms);
}

/** Re-times the video track so every cut lands on the song's beat; other tracks are untouched. */
export function syncVideoToSong(clips: TimelineClip[], videoTrackId: string, song: TimelineClip | undefined): TimelineClip[] {
  const beats = songBeatsOutputSec(song);
  if (beats.length < 2) return clips;
  const aligned = new Map(alignCutsToBeats(clips.filter((c) => c.track_id === videoTrackId), beats).map((c) => [c.id, c]));
  return clips.map((c) => aligned.get(c.id) ?? c);
}

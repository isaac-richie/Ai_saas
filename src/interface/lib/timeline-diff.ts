import type { TimelineClip, TimelineTrack } from '@/core/types/timeline';

export const SAVED_CLIP_FIELDS = [
  'start_ms', 'end_ms', 'trim_start_ms', 'trim_end_ms', 'volume', 'opacity',
  'transition_in', 'transition_in_ms', 'transition_out', 'transition_out_ms', 'color_grade_id',
] as const;
const SAVED_TRACK_FIELDS = ['muted', 'locked', 'visible'] as const;

type ClipPatch = Partial<Pick<TimelineClip, (typeof SAVED_CLIP_FIELDS)[number]>>;
type TrackPatch = Partial<Pick<TimelineTrack, (typeof SAVED_TRACK_FIELDS)[number]>>;

export interface TimelineDiff {
  trackInserts: TimelineTrack[];
  clipInserts: TimelineClip[];
  clipUpdates: { id: string; patch: ClipPatch }[];
  clipDeletes: string[];
  trackUpdates: { id: string; patch: TrackPatch }[];
  trackDeletes: string[];
  grade: string | null;
  /** The frame shape and fit, when either changed. */
  format: { resolution: string; frame_fit: string } | null;
}

function changed<T extends object, K extends keyof T>(before: T, after: T, keys: readonly K[]) {
  const patch: Partial<T> = {};
  for (const key of keys) if ((before[key] ?? null) !== (after[key] ?? null)) patch[key] = after[key];
  return patch;
}

type State = { clips: TimelineClip[]; tracks: TimelineTrack[]; grade?: string; resolution?: string; fit?: string };

/** What must be written so the database matches the editor. Clips on a deleted track are removed by cascade. */
export function diffTimeline(saved: State, current: State): TimelineDiff {
  const savedClips = new Map(saved.clips.map((c) => [c.id, c]));
  const currentClipIds = new Set(current.clips.map((c) => c.id));
  const currentTrackIds = new Set(current.tracks.map((t) => t.id));
  const trackDeletes = saved.tracks.filter((t) => !currentTrackIds.has(t.id)).map((t) => t.id);
  const deletedTracks = new Set(trackDeletes);

  const clipUpdates: TimelineDiff['clipUpdates'] = [];
  for (const clip of current.clips) {
    const before = savedClips.get(clip.id);
    if (!before) continue;
    const patch = changed(before, clip, SAVED_CLIP_FIELDS);
    if (Object.keys(patch).length) clipUpdates.push({ id: clip.id, patch });
  }

  const savedTracks = new Map(saved.tracks.map((t) => [t.id, t]));
  const trackUpdates: TimelineDiff['trackUpdates'] = [];
  for (const track of current.tracks) {
    const before = savedTracks.get(track.id);
    if (!before) continue;
    const patch = changed(before, track, SAVED_TRACK_FIELDS);
    if (Object.keys(patch).length) trackUpdates.push({ id: track.id, patch });
  }

  const savedClipIds = new Set(saved.clips.map((c) => c.id));
  return {
    // Clips and tracks that exist only locally come from undoing a delete, or from a split.
    trackInserts: current.tracks.filter((t) => !savedTracks.has(t.id)),
    clipInserts: current.clips.filter((c) => !savedClipIds.has(c.id)),
    clipUpdates,
    clipDeletes: saved.clips
      .filter((c) => !currentClipIds.has(c.id) && !deletedTracks.has(c.track_id))
      .map((c) => c.id),
    trackUpdates,
    trackDeletes,
    grade: current.grade !== undefined && current.grade !== saved.grade ? current.grade : null,
    format:
      current.resolution !== undefined && (current.resolution !== saved.resolution || current.fit !== saved.fit)
        ? { resolution: current.resolution, frame_fit: current.fit ?? 'blur' }
        : null,
  };
}

export function isEmptyDiff(d: TimelineDiff) {
  return d.grade === null && d.format === null && !d.trackInserts.length && !d.clipInserts.length && !d.clipUpdates.length && !d.clipDeletes.length && !d.trackUpdates.length && !d.trackDeletes.length;
}

import { create } from 'zustand';
import type { TimelineProject, TimelineTrack, TimelineClip, TransitionType } from '@/core/types/timeline';
import { reorderClip, removeAndRipple, setClipSpeed, splitClip } from '@/core/services/timeline-ops';
import { emptyHistory, record, undo, redo, type History } from '@/interface/lib/history';
import { DEFAULT_FRAME_FIT } from '@/core/services/video-format';
import { isClipLocked } from '@/core/services/edit-agent';

export interface TimelineSnapshot {
  clips: TimelineClip[];
  tracks: TimelineTrack[];
  grade: string;
  resolution: string;
  fit: string;
}

interface TimelineStore {
  timeline: TimelineProject | null;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playhead_ms: number;
  zoom: number;
  pixels_per_ms: number;
  selected_clip_id: string | null;
  is_playing: boolean;
  history: History<TimelineSnapshot>;
  /** Shots whose storyboard has a newer version, keyed by clip id. Not part of undo. */
  storyboardUpdates: Record<string, { url: string; duration_ms: number }>;
  setStoryboardUpdates: (u: Record<string, { url: string; duration_ms: number }>) => void;

  /** Replaces everything with server data. Pass `recordAs` to make the previous state undoable. */
  load: (data: { timeline: TimelineProject; tracks: TimelineTrack[]; clips: TimelineClip[] }, recordAs?: string) => void;
  setTimeline: (t: TimelineProject) => void;

  updateClip: (id: string, patch: Partial<TimelineClip>, key?: string) => void;
  /** Replaces the clip list; edits sharing a key (one drag) become a single undo step. */
  commitClips: (clips: TimelineClip[], key: string) => void;
  removeClip: (id: string) => void;
  reorder: (id: string, toIndex: number) => void;
  split: (id: string, atMs: number) => void;
  setTransition: (clipId: string, type: TransitionType, duration_ms: number) => void;
  setGrade: (gradeId: string) => void;
  /** Slow motion or fast motion for one shot; the shots after it move to fit. */
  setSpeed: (id: string, speed: number) => void;
  /** Approves and locks a shot (or unlocks it); locked shots can't be changed by hand or by the AI. */
  toggleClipLock: (id: string) => void;
  /** Changes the frame shape and/or how footage fills it. */
  setFormat: (patch: { resolution?: string; fit?: string }) => void;
  addClip: (c: TimelineClip) => void;
  addTrack: (t: TimelineTrack) => void;
  removeTrack: (id: string) => void;
  toggleTrackMute: (id: string) => void;
  toggleTrackLock: (id: string) => void;
  undo: () => void;
  redo: () => void;

  selectClip: (id: string | null) => void;
  setPlayhead: (ms: number) => void;
  setZoom: (z: number) => void;
  togglePlay: () => void;
  setPlaying: (v: boolean) => void;
}

type Get = () => TimelineStore;

function snapshot(s: TimelineStore): TimelineSnapshot {
  return {
    clips: s.clips,
    tracks: s.tracks,
    grade: s.timeline?.color_grade_id || 'natural',
    resolution: s.timeline?.resolution || '1920x1080',
    fit: s.timeline?.frame_fit || DEFAULT_FRAME_FIT,
  };
}

function isLocked(s: TimelineStore, trackId: string) {
  return Boolean(s.tracks.find((t) => t.id === trackId)?.locked);
}

/** Applies a content edit and records the state before it as one undo step. */
function edit(get: Get, set: (p: Partial<TimelineStore>) => void, key: string, patch: Partial<TimelineStore>) {
  const s = get();
  set({ ...patch, history: record(s.history, snapshot(s), key, Date.now()) });
}

function restore(s: TimelineStore, snap: TimelineSnapshot): Partial<TimelineStore> {
  const ids = new Set(snap.clips.map((c) => c.id));
  return {
    clips: snap.clips,
    tracks: snap.tracks,
    timeline: s.timeline ? { ...s.timeline, color_grade_id: snap.grade, resolution: snap.resolution, frame_fit: snap.fit } : s.timeline,
    selected_clip_id: s.selected_clip_id && ids.has(s.selected_clip_id) ? s.selected_clip_id : null,
  };
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  timeline: null,
  tracks: [],
  clips: [],
  playhead_ms: 0,
  zoom: 1,
  pixels_per_ms: 0.1,
  selected_clip_id: null,
  is_playing: false,
  history: emptyHistory(),
  storyboardUpdates: {},
  setStoryboardUpdates: (u) => set({ storyboardUpdates: u }),

  load: ({ timeline, tracks, clips }, recordAs) => {
    const s = get();
    const ids = new Set(clips.map((c) => c.id));
    set({
      timeline,
      tracks,
      clips,
      selected_clip_id: s.selected_clip_id && ids.has(s.selected_clip_id) ? s.selected_clip_id : null,
      history: recordAs && s.timeline ? record(s.history, snapshot(s), recordAs, 0) : recordAs ? s.history : emptyHistory(),
    });
  },
  setTimeline: (t) => set({ timeline: t }),

  updateClip: (id, patch, key) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip || isLocked(s, clip.track_id) || isClipLocked(clip)) return;
    edit(get, set, key ?? `update:${id}:${Object.keys(patch).join(',')}`, {
      clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  },

  commitClips: (clips, key) => {
    if (clips !== get().clips) edit(get, set, key, { clips });
  },

  removeClip: (id) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip || isLocked(s, clip.track_id) || isClipLocked(clip)) return;
    // Only the video row closes gaps; music and text stay where they were placed.
    const isVideo = s.tracks.find((t) => t.id === clip.track_id)?.track_type === 'video';
    edit(get, set, `remove:${id}`, {
      clips: isVideo ? removeAndRipple(s.clips, id) : s.clips.filter((c) => c.id !== id),
      selected_clip_id: s.selected_clip_id === id ? null : s.selected_clip_id,
    });
  },

  reorder: (id, toIndex) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip || isLocked(s, clip.track_id) || isClipLocked(clip)) return;
    edit(get, set, `reorder:${id}:${Date.now()}`, { clips: reorderClip(s.clips, id, toIndex) });
  },

  split: (id, atMs) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip || isLocked(s, clip.track_id) || isClipLocked(clip)) return;
    const next = splitClip(s.clips, id, atMs, crypto.randomUUID());
    if (next !== s.clips) edit(get, set, `split:${id}:${Date.now()}`, { clips: next });
  },

  setTransition: (clipId, type, duration_ms) =>
    get().updateClip(clipId, { transition_out: type, transition_out_ms: duration_ms }, `transition:${clipId}:${Date.now()}`),

  setGrade: (gradeId) => {
    const s = get();
    if (!s.timeline || s.timeline.color_grade_id === gradeId) return;
    edit(get, set, `grade:${Date.now()}`, { timeline: { ...s.timeline, color_grade_id: gradeId } });
  },

  setSpeed: (id, speed) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip || isLocked(s, clip.track_id) || isClipLocked(clip)) return;
    const next = setClipSpeed(s.clips, id, speed);
    if (next !== s.clips) edit(get, set, `speed:${id}:${speed}`, { clips: next });
  },

  toggleClipLock: (id) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip || isLocked(s, clip.track_id)) return;
    const meta = { ...((clip.metadata as Record<string, unknown>) || {}) };
    if (meta.locked === true) delete meta.locked;
    else meta.locked = true;
    edit(get, set, `lock-clip:${id}:${Date.now()}`, { clips: s.clips.map((c) => (c.id === id ? { ...c, metadata: meta } : c)) });
  },

  setFormat: ({ resolution, fit }) => {
    const s = get();
    if (!s.timeline) return;
    const next = {
      ...s.timeline,
      resolution: resolution ?? s.timeline.resolution,
      frame_fit: fit ?? s.timeline.frame_fit ?? DEFAULT_FRAME_FIT,
    };
    if (next.resolution === s.timeline.resolution && next.frame_fit === (s.timeline.frame_fit ?? DEFAULT_FRAME_FIT)) return;
    edit(get, set, `format:${Date.now()}`, { timeline: next });
  },

  addClip: (c) => edit(get, set, `add:${c.id}`, { clips: [...get().clips, c] }),
  addTrack: (t) => edit(get, set, `add-track:${t.id}`, { tracks: [...get().tracks, t] }),

  removeTrack: (id) => {
    const s = get();
    edit(get, set, `remove-track:${id}`, {
      tracks: s.tracks.filter((t) => t.id !== id),
      clips: s.clips.filter((c) => c.track_id !== id),
      selected_clip_id: s.clips.find((c) => c.id === s.selected_clip_id)?.track_id === id ? null : s.selected_clip_id,
    });
  },

  toggleTrackMute: (id) =>
    edit(get, set, `mute:${id}:${Date.now()}`, {
      tracks: get().tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)),
    }),

  toggleTrackLock: (id) =>
    edit(get, set, `lock:${id}:${Date.now()}`, {
      tracks: get().tracks.map((t) => (t.id === id ? { ...t, locked: !t.locked } : t)),
    }),

  undo: () => {
    const s = get();
    const result = undo(s.history, snapshot(s));
    if (result) set({ ...restore(s, result.state), history: result.history, is_playing: false });
  },

  redo: () => {
    const s = get();
    const result = redo(s.history, snapshot(s));
    if (result) set({ ...restore(s, result.state), history: result.history, is_playing: false });
  },

  selectClip: (id) => set({ selected_clip_id: id }),
  setPlayhead: (ms) => set({ playhead_ms: Math.max(0, ms) }),
  setZoom: (z) => set({ zoom: z, pixels_per_ms: 0.1 * z }),
  togglePlay: () => set((s) => ({ is_playing: !s.is_playing })),
  setPlaying: (v) => set({ is_playing: v }),
}));

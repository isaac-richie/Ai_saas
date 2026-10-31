'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import {
  addTimelineTrack,
  getLatestRenderJob,
  getOrCreateTimeline,
  getTimelineClips,
  getTimelineTracks,
  importStoryboardToTimeline,
  removeTimelineClip,
  removeTimelineTrack,
  updateTimelineClip,
  updateTimelineSettings,
  updateTimelineTrack,
  upsertTimelineClips,
  upsertTimelineTracks,
} from '@/core/actions/timeline';
import { createClient } from '@/infrastructure/supabase/client';
import { diffTimeline, isEmptyDiff } from '@/interface/lib/timeline-diff';
import { timelineToOutputMs } from '@/core/services/timeline-ops';
import type { TimelineClip, TimelineProject, TimelineTrack } from '@/core/types/timeline';
import { DEFAULT_FRAME_FIT } from '@/core/services/video-format';
import { EditorWorkspace, type RenderState } from './EditorWorkspace';
import type { AgentReply } from './AgentPanel';

type Snapshot = { clips: TimelineClip[]; tracks: TimelineTrack[]; grade: string; resolution: string; fit: string };
const IDLE: RenderState = { status: 'idle', progress: 0, stage: '', url: null, storageKey: null, error: null };
const MUSIC_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg'];

function snapshotOf(s: { clips: TimelineClip[]; tracks: TimelineTrack[]; timeline: TimelineProject | null }): Snapshot {
  return {
    clips: s.clips,
    tracks: s.tracks,
    grade: s.timeline?.color_grade_id || 'natural',
    resolution: s.timeline?.resolution || '1920x1080',
    fit: s.timeline?.frame_fit || DEFAULT_FRAME_FIT,
  };
}

async function postJson(url: string, body: unknown) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: 'Could not reach VisioWave. Check your connection.' } };
  }
}

export function EditorView({ projectId, title }: { projectId: string; title?: string }) {
  const { load, addTrack, addClip, selectClip } = useTimelineStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [render, setRender] = useState<RenderState>(IDLE);
  const [reframes, setReframes] = useState<{ aspect: string; url: string }[]>([]);
  const [reframing, setReframing] = useState(false);
  const saved = useRef<Snapshot>({ clips: [], tracks: [], grade: 'natural', resolution: '1920x1080', fit: DEFAULT_FRAME_FIT });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pollId = useRef(0);

  const current = (): Snapshot => {
    const s = useTimelineStore.getState();
    return snapshotOf(s);
  };

  const flush = useCallback(() => {
    // Saves run one after another so an older write can never land after a newer one.
    queue.current = queue.current.then(async () => {
      const timeline = useTimelineStore.getState().timeline;
      const now = current();
      const diff = diffTimeline(saved.current, now);
      if (!timeline || isEmptyDiff(diff)) return;
      setSaving(true);
      try {
        const results = [];
        results.push(await upsertTimelineTracks(diff.trackInserts));
        results.push(await upsertTimelineClips(diff.clipInserts));
        results.push(...(await Promise.all([
          ...diff.clipUpdates.map((u) => updateTimelineClip(u.id, u.patch)),
          ...diff.trackUpdates.map((u) => updateTimelineTrack(u.id, u.patch)),
          ...diff.clipDeletes.map((id) => removeTimelineClip(id)),
        ])));
        results.push(...(await Promise.all(diff.trackDeletes.map((id) => removeTimelineTrack(id)))));
        const videoTrack = now.tracks.find((t) => t.track_type === 'video');
        const end = Math.max(0, ...now.clips.filter((c) => c.track_id === videoTrack?.id).map((c) => c.end_ms));
        results.push(await updateTimelineSettings(timeline.id, {
          color_grade_id: now.grade,
          duration_ms: end,
          ...(diff.format ?? {}),
        }));
        if (results.some((r) => 'error' in r && r.error)) throw new Error('save');
        saved.current = now;
        setSaveFailed(false);
      } catch {
        // The next edit retries everything still different from the last good save.
        setSaveFailed(true);
      } finally {
        setSaving(false);
      }
    });
    return queue.current;
  }, []);

  // A failed save (dropped connection) quietly retries until it goes through.
  useEffect(() => {
    if (!saveFailed) return;
    const id = setTimeout(() => void flush(), 5000);
    return () => clearTimeout(id);
  }, [saveFailed, flush]);

  useEffect(() => {
    const unsubscribe = useTimelineStore.subscribe((state, prev) => {
      if (state.clips === prev.clips && state.tracks === prev.tracks && state.timeline === prev.timeline) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), 600);
    });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!isEmptyDiff(diffTimeline(saved.current, current()))) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unsubscribe();
      // A counter, not a DOM node: bumping the latest value is what ends any running poll.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pollId.current++;
      window.removeEventListener('beforeunload', beforeUnload);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void flush();
    };
  }, [flush]);

  /** Loads the timeline from the server. `recordAs` keeps the previous state as an undo step. */
  const loadTimeline = useCallback(async (recordAs?: string) => {
    const res = await getOrCreateTimeline(projectId);
    if (!res.timeline) {
      setError(('error' in res && res.error) || 'Could not open this project.');
      setLoading(false);
      return null;
    }
    const trackRes = await getTimelineTracks(res.timeline.id);
    if (!trackRes.tracks) {
      setError(trackRes.error || 'Could not load the timeline.');
      setLoading(false);
      return null;
    }
    const clipRes = await getTimelineClips(trackRes.tracks.map((t) => t.id));
    if (clipRes.error) setError(clipRes.error);
    const data = { timeline: res.timeline, tracks: trackRes.tracks, clips: clipRes.clips || [] };
    // The baseline is set first so loading is never mistaken for an edit that needs saving.
    saved.current = snapshotOf(data);
    load(data, recordAs);
    setLoading(false);
    return data.timeline;
  }, [projectId, load]);

  const pollRender = useCallback(async (jobId: string) => {
    // Only the newest poll runs; leaving the editor or starting another render ends older ones.
    const id = ++pollId.current;
    for (let attempt = 0; attempt < 400; attempt++) {
      await new Promise((r) => setTimeout(r, attempt < 5 ? 1500 : 3000));
      if (id !== pollId.current) return;
      try {
        const res = await fetch(`/api/timeline/render?job_id=${jobId}`, { cache: 'no-store' });
        const job = await res.json();
        if (!res.ok) {
          setRender({ ...IDLE, status: 'failed', error: job.error || 'Could not check on your video.' });
          return;
        }
        if (id !== pollId.current) return;
        setRender({ status: job.status, progress: job.progress, stage: job.stage, url: job.output_url, storageKey: job.storage_key, error: job.error_message });
        if (job.status === 'completed' || job.status === 'failed') return;
      } catch {
        // A dropped connection should not end the wait; the job keeps running on the server.
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const timeline = await loadTimeline();
      if (!timeline) return;
      const { job } = await getLatestRenderJob(timeline.id);
      if (!job) return;
      setRender({ status: job.status, progress: job.progress, stage: job.stage, url: job.output_url, storageKey: job.storage_key, error: job.error_message });
      if (job.status === 'queued' || job.status === 'rendering') void pollRender(job.id);
    })();
  }, [loadTimeline, pollRender]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(id);
  }, [notice]);

  const timelineId = () => useTimelineStore.getState().timeline?.id;

  const onImport = async () => {
    setImporting(true);
    await flush();
    const res = await importStoryboardToTimeline(projectId);
    setImporting(false);
    if ('error' in res && res.error) {
      setError(res.error);
      return;
    }
    const count = 'clip_count' in res ? res.clip_count : 0;
    setNotice(count ? `Added ${count} shot${count === 1 ? '' : 's'} from your storyboard.` : 'Every storyboard shot is already here.');
    await loadTimeline(count ? `import:${Date.now()}` : undefined);
  };

  const onAgent = async (instruction: string): Promise<AgentReply> => {
    await flush();
    const { ok, data } = await postJson('/api/timeline/agent', { timeline_id: timelineId(), instruction });
    if (!ok) return { ok: false, error: data.error || 'Something went wrong.' };
    if (data.applied > 0) await loadTimeline(`agent:${Date.now()}`);
    return { ok: true, summary: data.summary, applied: data.applied, rejected: data.rejected || [] };
  };

  const onRender = async () => {
    await flush();
    setReframes([]);
    setRender({ ...IDLE, status: 'queued', stage: 'Getting ready' });
    const { ok, data } = await postJson('/api/timeline/render', { timeline_id: timelineId() });
    if (!ok) {
      setRender({ ...IDLE, status: 'failed', error: data.error || 'Could not start your video.' });
      return;
    }
    void pollRender(data.job_id);
  };

  const onReframe = async () => {
    if (!render.storageKey) return;
    setReframing(true);
    const { ok, data } = await postJson('/api/timeline/reframe', { timeline_id: timelineId(), storage_key: render.storageKey, aspects: ['9:16', '1:1'] });
    setReframing(false);
    if (!ok) return setError(data.error || 'Could not make the phone versions.');
    setReframes(data.outputs || []);
    if (!data.tracked) setNotice('Made centred versions. Following the subject was unavailable this time.');
  };

  const onUploadMusic = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!MUSIC_EXTENSIONS.includes(ext)) return 'Choose an MP3, M4A, WAV or OGG file.';
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Please sign in again.';
    const path = `${user.id}/music/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('elements').upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (uploadError) return 'The upload did not finish. Try again.';
    await flush();
    const { ok, data } = await postJson('/api/timeline/music', { timeline_id: timelineId(), storage_path: path, name: file.name.replace(/\.[^.]+$/, '').slice(0, 120) });
    if (!ok) return data.error || 'Could not add that song.';
    await loadTimeline(`music:${Date.now()}`);
    setNotice(data.bpm ? `Found the beat: ${Math.round(data.bpm)} beats per minute.` : 'Song added. We could not find a steady beat in it.');
    return null;
  };

  const onAddText = async () => {
    const s = useTimelineStore.getState();
    if (!s.timeline) return;
    let track = s.tracks.find((t) => t.track_type === 'caption');
    if (!track) {
      const res = await addTimelineTrack(s.timeline.id, 'Text', 'caption');
      if (!res.track) {
        setError(res.error || 'Could not add text.');
        return;
      }
      track = res.track;
      saved.current = { ...saved.current, tracks: [...saved.current.tracks, track] };
      addTrack(track);
    }
    const videoTrack = s.tracks.find((t) => t.track_type === 'video');
    let start = Math.round(timelineToOutputMs(s.clips.filter((c) => c.track_id === videoTrack?.id), s.playhead_ms));
    // Start after any text already on screen so two captions never stack.
    const existing = s.clips.filter((c) => c.track_id === track!.id).sort((a, b) => a.start_ms - b.start_ms);
    for (const c of existing) if (c.start_ms <= start && c.end_ms > start) start = c.end_ms;
    const clip: TimelineClip = {
      id: crypto.randomUUID(),
      track_id: track.id,
      take_id: null,
      asset_url: null,
      clip_type: 'caption',
      start_ms: start,
      end_ms: start + 2500,
      trim_start_ms: 0,
      trim_end_ms: null,
      volume: 1,
      opacity: 1,
      transition_in: null,
      transition_in_ms: 0,
      transition_out: null,
      transition_out_ms: 0,
      color_grade_id: null,
      metadata: { text: 'Your text here', style: 'standard', source: 'manual' },
      order_index: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    addClip(clip);
    selectClip(clip.id);
  };

  const onAutoCaptions = async (): Promise<string | null> => {
    if (!render.storageKey) return 'Make your video first.';
    await flush();
    const { ok, data } = await postJson('/api/timeline/captions', { timeline_id: timelineId(), storage_key: render.storageKey });
    if (!ok) return data.error || 'Could not create captions.';
    await loadTimeline(`captions:${Date.now()}`);
    return null;
  };

  if (loading) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-gold-300/70" />
      </div>
    );
  }

  return (
    <EditorWorkspace
      backHref="/dashboard/fast-video"
      title={title}
      saving={saving}
      saveFailed={saveFailed}
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      render={render}
      reframes={reframes}
      reframing={reframing}
      importing={importing}
      onImport={onImport}
      onRender={onRender}
      onReframe={onReframe}
      onAgent={onAgent}
      onUploadMusic={onUploadMusic}
      onAddText={onAddText}
      onAutoCaptions={onAutoCaptions}
    />
  );
}

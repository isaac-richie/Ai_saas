'use client';

import { useEffect, useState } from 'react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { EditorWorkspace, type RenderState } from '@/interface/components/editor/EditorWorkspace';
import type { TimelineClip, TimelineTrack } from '@/core/types/timeline';
import type { TakeStatus } from '@/interface/components/editor/ClipPanel';
import { applyTake, rippleFrom } from '@/core/services/take-regenerate';

const base = { take_id: null, trim_start_ms: 0, trim_end_ms: null, volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: null, transition_out_ms: 0, color_grade_id: null, order_index: 0, created_at: '', updated_at: '' };
const clip = (c: Partial<TimelineClip> & Pick<TimelineClip, 'id' | 'track_id' | 'start_ms' | 'end_ms'>): TimelineClip =>
  ({ ...base, asset_url: null, clip_type: 'video', metadata: {}, ...c }) as TimelineClip;
const track = (id: string, track_type: TimelineTrack['track_type'], order_index: number): TimelineTrack =>
  ({ id, timeline_id: 'dev', name: id, track_type, order_index, muted: false, locked: false, visible: true, created_at: '' });

const sample = {
  timeline: { id: 'dev', project_id: 'dev', name: 'Main', fps: 24, resolution: '1920x1080', duration_ms: 13000, color_grade_id: 'natural', created_at: '', updated_at: '' },
  tracks: [track('v', 'video', 0), track('a', 'audio', 1), track('t', 'caption', 2)],
  clips: [
    clip({ id: 's1', track_id: 'v', start_ms: 0, end_ms: 4000, asset_url: '/__dev/shot1.mp4', transition_out: 'crossfade', transition_out_ms: 500, metadata: { source_duration_ms: 4000 } }),
    clip({ id: 's2', track_id: 'v', start_ms: 4000, end_ms: 8000, asset_url: '/__dev/shot2.mp4', metadata: { source_duration_ms: 4000 } }),
    clip({ id: 's3', track_id: 'v', start_ms: 8000, end_ms: 13000, asset_url: '/__dev/shot3.mp4', metadata: { source_duration_ms: 5000 } }),
    clip({ id: 'm', track_id: 'a', clip_type: 'audio', start_ms: 0, end_ms: 13000, volume: 0.6, asset_url: '/__dev/song.mp3', metadata: { name: 'Golden Hour Demo', bpm: 120, beats: Array.from({ length: 40 }, (_, i) => i * 0.5), source_duration_ms: 20000 } }),
    clip({ id: 'c1', track_id: 't', clip_type: 'caption', start_ms: 600, end_ms: 3200, metadata: { text: 'Made with VisioWave', style: 'bold_center' } }),
  ],
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DevEditor() {
  const [render, setRender] = useState<RenderState>({ status: 'idle', progress: 0, stage: '', url: null, storageKey: null, error: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [takeStatus, setTakeStatus] = useState<Record<string, TakeStatus>>({});

  useEffect(() => {
    useTimelineStore.getState().load(sample);
  }, []);

  return (
    <EditorWorkspace
      backHref="/dashboard"
      title="Golden Hour — teaser"
      saving={false}
      error={null}
      notice={notice}
      onDismissError={() => {}}
      render={render}
      reframes={[]}
      reframing={false}
      importing={false}
      onImport={() => useTimelineStore.getState().load(sample)}
      onRender={async () => {
        for (const [progress, stage] of [[10, 'Preparing clip 1 of 3'], [45, 'Preparing clip 3 of 3'], [75, 'Mixing music'], [90, 'Adding captions']] as const) {
          setRender({ status: 'rendering', progress, stage, url: null, storageKey: null, error: null });
          await wait(700);
        }
        setRender({ status: 'completed', progress: 100, stage: 'Done', url: '/__dev/shot1.mp4', storageKey: 'dev', error: null });
      }}
      onReframe={() => setNotice('Preview only: phone versions are made on the server.')}
      onAgent={async (instruction) => {
        await wait(900);
        if (/beat/i.test(instruction)) return { ok: true, summary: 'Preview only: in the real editor I would re-time every cut onto the beat.', applied: 0, rejected: [] };
        return { ok: false, error: 'Preview only: the AI editor needs a signed-in project.' };
      }}
      onUploadMusic={async () => { await wait(800); return 'Preview only: uploads need a signed-in project.'; }}
      onAddText={async () => {
        const s = useTimelineStore.getState();
        const id = `c${Date.now()}`;
        s.addClip(clip({ id, track_id: 't', clip_type: 'caption', start_ms: Math.round(s.playhead_ms), end_ms: Math.round(s.playhead_ms) + 2500, metadata: { text: 'Your text here', style: 'standard' } }));
        s.selectClip(id);
      }}
      onAutoCaptions={async () => { await wait(800); return 'Preview only: auto captions need a finished video.'; }}
      takeStatus={takeStatus}
      onAutoEdit={async (style) => {
        // Preview only: a canned cut so the flow can be seen without OpenAI.
        await wait(1500);
        const s = useTimelineStore.getState();
        s.setGrade(style === 'story' ? 'warm-film' : 'teal-orange');
        const shots = s.clips.filter((c) => c.track_id === 'v').sort((a, b) => a.start_ms - b.start_ms);
        s.updateClip(shots[shots.length - 1].id, { transition_out: 'fade_black', transition_out_ms: 800 }, 'auto-ending');
        return { ok: true, summary: `Preview: cut as a ${style}, with a new look and a fade to black at the end.`, applied: 2, rejected: [] };
      }}
      onRegenerate={async (clipId) => {
        // Preview only: pretends to generate by swapping in another sample shot.
        setTakeStatus((t) => ({ ...t, [clipId]: { state: 'working', message: 'Preview: pretending to generate…' } }));
        await wait(2500);
        const s = useTimelineStore.getState();
        const c = s.clips.find((x) => x.id === clipId);
        if (!c) return;
        const others = ['/__dev/shot1.mp4', '/__dev/shot2.mp4', '/__dev/shot3.mp4'].filter((u) => u !== c.asset_url);
        const next = applyTake({ ...c, asset_url: c.asset_url && c.asset_url.startsWith('/') ? `https://preview.local${c.asset_url}` : c.asset_url }, { url: others[0], source_duration_ms: 4000, created_at: new Date().toISOString() }, { keepLength: true });
        const fixed = { ...next, metadata: { ...(next.metadata as object), takes: ((next.metadata as { takes: { url: string }[] }).takes).map((t) => ({ ...t, url: t.url.replace('https://preview.local', '') })) } };
        const shots = rippleFrom(s.clips.filter((x) => x.track_id === c.track_id).map((x) => (x.id === clipId ? (fixed as TimelineClip) : x)));
        s.commitClips([...s.clips.filter((x) => x.track_id !== c.track_id), ...shots], `take:${clipId}:${Math.random()}`);
        setTakeStatus((t) => ({ ...t, [clipId]: { state: 'idle' } }));
        setNotice('Preview: new take placed. The earlier one is under Earlier takes.');
      }}
    />
  );
}

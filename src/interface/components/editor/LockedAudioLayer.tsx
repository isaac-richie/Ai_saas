'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, ChevronDown } from 'lucide-react';
import { getEditorLockedAudio, type EditorLockedAudio } from '@/core/actions/long-form-audio';
import { cueStateAt, cueWindow, planEditAudio, type AudioCue, type EditClip, type ExportAudio } from '@/core/services/long-form-audio';
import { timelineToOutputMs } from '@/core/services/timeline-ops';
import type { TimelineClip } from '@/core/types/timeline';
import { audioSrc } from '@/interface/components/fast-video/LockedAudio';

type Loader = (timelineId: string) => Promise<{ data?: EditorLockedAudio; error?: string }>;

/**
 * The Long Form locked audio for this edit, planned from the editor's live clip positions with the
 * same planner the export uses. Reloads when the film's shots in the edit change or the tab regains
 * focus (locks may have changed in Long Form).
 */
export function useEditorLockedAudio(timelineId: string | undefined, videoClips: EditClip[], load: Loader = getEditorLockedAudio): ExportAudio | null {
  const [data, setData] = useState<EditorLockedAudio | null>(null);
  const filmKey = useMemo(
    () => [...new Set(videoClips.map((c) => (c.metadata ?? {}).film_shot_id).filter((id): id is string => typeof id === 'string'))].sort().join(','),
    [videoClips],
  );
  useEffect(() => {
    if (!timelineId || !filmKey) return;
    let cancelled = false;
    const fetchNow = () => void load(timelineId).then((r) => { if (!cancelled && r.data) setData(r.data); }).catch(() => {});
    fetchNow();
    window.addEventListener('focus', fetchNow);
    return () => { cancelled = true; window.removeEventListener('focus', fetchNow); };
  }, [timelineId, filmKey, load]);
  return useMemo(() => {
    if (!filmKey || !data || !Object.keys(data.audio).length) return null;
    return planEditAudio(videoClips, data.index, data.audio);
  }, [filmKey, data, videoClips]);
}

/** Plays each locked recording in step with the preview, exactly where the export will place it. */
export function LockedAudioLayer({ plan, videoClips, outputMs, playing }: { plan: ExportAudio; videoClips: TimelineClip[]; outputMs: number; playing: boolean }) {
  return (
    <>
      {plan.cues.map((cue) => (
        <CuePlayer key={`${cue.bindingId}-${cue.startMs}`} cue={cue} window={cueWindow(cue, (ms) => timelineToOutputMs(videoClips, ms))} outputMs={outputMs} playing={playing} />
      ))}
    </>
  );
}

function CuePlayer({ cue, window, outputMs, playing }: { cue: AudioCue; window: { start: number; end: number }; outputMs: number; playing: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    const state = cueStateAt(cue, window, outputMs);
    if (!state) {
      if (!audio.paused) audio.pause();
      return;
    }
    if (Math.abs(audio.currentTime - state.fileSec) > 0.3) audio.currentTime = state.fileSec;
    audio.volume = state.volume;
    if (playing && audio.paused) audio.play().catch(() => {});
    if (!playing && !audio.paused) audio.pause();
  }, [cue, window, outputMs, playing]);
  return <audio ref={ref} src={audioSrc(cue.path)} preload="auto" className="hidden" data-testid="locked-cue" data-binding={cue.bindingId} />;
}

/** A small stage badge: how much locked audio this edit carries and whether it can export. */
export function LockedAudioBadge({ plan }: { plan: ExportAudio }) {
  const [open, setOpen] = useState(false);
  const blocked = plan.issues.length > 0;
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 max-w-[min(22rem,calc(100%-1rem))] text-[11px]" data-testid="locked-audio-badge">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur ${blocked ? 'border-amber-300/40 bg-black/60 text-amber-100' : 'border-[#8fd1b9]/30 bg-black/50 text-[#dff1ec]'}`}>
        <AudioLines className="size-3.5" aria-hidden />
        Locked audio · {plan.cues.length}{blocked ? ' · Not ready to export' : ''}
        <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-xl border border-white/10 bg-black/80 p-2.5 text-white/80 backdrop-blur">
          <p>Approved Long Form audio plays here exactly where the export places it.{plan.mutedClipIds.length ? ` ${plan.mutedClipIds.length} shot${plan.mutedClipIds.length === 1 ? "'s" : "s'"} own sound is muted under dialogue.` : ''}</p>
          {blocked ? (
            <ul className="list-disc space-y-0.5 pl-4 text-amber-100/90">{plan.issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>
          ) : <p className="text-[#8fd1b9]">Ready for export.</p>}
          <p className="text-white/45">Change locked audio in the film&apos;s Long Form shot cards.</p>
        </div>
      )}
    </div>
  );
}

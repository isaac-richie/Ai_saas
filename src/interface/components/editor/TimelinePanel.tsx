'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Blend, Film, Lock, Music, Plus, Type, Unlock, Volume2, VolumeX } from 'lucide-react';
import type { TimelineClip, TimelineTrack } from '@/core/types/timeline';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import {
  clipSpeed, dropIndex, moveFreeClip, outputToTimelineMs, reorderClip, timelineToOutputMs, trimClip, trimFreeClip,
} from '@/core/services/timeline-ops';
import { FILMSTRIP_FRAMES, useFilmstrip, useWaveform } from '@/interface/lib/media-thumbs';
import { TRANSITION_LABELS, formatClock, formatTime } from './labels';
import { useIsPro } from '@/interface/hooks/use-editor-mode';
import { isClipLocked } from '@/core/services/edit-agent';

const MIN_PPMS = 0.004;
const MAX_PPMS = 0.8;
const SNAP_PX = 8;
const ROW: Record<string, number> = { video: 60, audio: 44, caption: 36, sfx: 36 };
// Taller rows when the timeline has the room (tablets), so shots are easy to see and touch.
const ROOMY_ROW: Record<string, number> = { video: 76, audio: 52, caption: 42, sfx: 42 };
const TRACK_ICON = { video: Film, audio: Music, caption: Type, sfx: Music } as const;
const TRACK_LABEL: Record<string, string> = { video: 'Shots', audio: 'Music', caption: 'Text', sfx: 'Sound' };
const TICK_STEPS = [500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000];

type Drag =
  | { kind: 'move'; id: string; startX: number; origin: TimelineClip[]; key: string; moved: boolean; touch: boolean }
  | { kind: 'trim'; id: string; edge: 'start' | 'end'; startX: number; origin: TimelineClip[]; key: string }
  | { kind: 'scrub' };

const byStart = (a: TimelineClip, b: TimelineClip) => a.start_ms - b.start_ms;

export function TimelinePanel({ centered = false, roomy = false, fitSignal = 0, onAdd }: {
  centered?: boolean;
  roomy?: boolean;
  fitSignal?: number;
  /** Opens the right tool from the timeline: more shots, a song, or text. */
  onAdd?: (kind: 'shots' | 'music' | 'text') => void;
}) {
  const {
    tracks, clips, playhead_ms, pixels_per_ms: ppm, selected_clip_id, is_playing,
    setZoom, setPlayhead, selectClip, commitClips, toggleTrackMute, toggleTrackLock, setPlaying,
  } = useTimelineStore();
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragCount = useRef(0);
  const programmatic = useRef<number | null>(null);
  const pinch = useRef<{ dist: number; ppm: number } | null>(null);
  const fitted = useRef<number | null>(null);
  const pro = useIsPro();
  const [viewport, setViewport] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const [moveOffset, setMoveOffset] = useState<{ id: string; dx: number; dropAt: number | null } | null>(null);
  const [snapAt, setSnapAt] = useState<number | null>(null);

  const videoTrack = tracks.find((t) => t.track_type === 'video');
  const videoClips = useMemo(() => clips.filter((c) => c.track_id === videoTrack?.id).sort(byStart), [clips, videoTrack?.id]);
  const shotNumber = useMemo(() => new Map(videoClips.map((c, i) => [c.id, i + 1])), [videoClips]);
  const videoEnd = videoClips.length ? videoClips[videoClips.length - 1].end_ms : 0;

  // Music and text are stored in finished-video time; draw them where that moment sits among the shots.
  const place = useCallback(
    (clip: TimelineClip) =>
      clip.track_id === videoTrack?.id
        ? { start: clip.start_ms, end: clip.end_ms }
        : { start: outputToTimelineMs(videoClips, clip.start_ms), end: outputToTimelineMs(videoClips, clip.end_ms) },
    [videoClips, videoTrack?.id],
  );
  const endMs = Math.max(1000, videoEnd, ...clips.map((c) => place(c).end));
  const contentMs = endMs + (centered ? 0 : 1500) + (onAdd ? 60 / Math.max(ppm, 0.004) : 0);
  const pad = centered ? viewport / 2 : 12;
  const rowHeight = useMemo(() => {
    if (!roomy || panelHeight === 0) return roomy ? ROOMY_ROW : ROW;
    // Spare height goes mostly to the shots, whose film strips read better large.
    const used = 28 + 2 + tracks.filter((t) => t.track_type !== 'sfx').reduce((sum, t) => sum + ROOMY_ROW[t.track_type], 0);
    const spare = Math.max(0, panelHeight - used);
    return {
      ...ROOMY_ROW,
      video: Math.round(Math.min(136, ROOMY_ROW.video + spare * 0.7)),
      audio: Math.round(Math.min(68, ROOMY_ROW.audio + spare * 0.3)),
    };
  }, [roomy, panelHeight, tracks]);

  const beatMarks = useMemo(() => {
    const song = clips.find((c) => c.track_id === tracks.find((t) => t.track_type === 'audio')?.id);
    const beats = (song?.metadata as { beats?: unknown } | undefined)?.beats;
    if (!song || !Array.isArray(beats)) return [];
    return beats
      .filter((b): b is number => typeof b === 'number')
      .map((b) => song.start_ms + b * 1000 - song.trim_start_ms)
      .filter((ms) => ms >= song.start_ms && ms <= song.end_ms)
      .map((ms) => outputToTimelineMs(videoClips, ms));
  }, [tracks, clips, videoClips]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setViewport(el.clientWidth);
      setPanelHeight(root.current?.clientHeight ?? 0);
    });
    observer.observe(el);
    if (root.current) observer.observe(root.current);
    setViewport(el.clientWidth);
    setPanelHeight(root.current?.clientHeight ?? 0);
    return () => observer.disconnect();
  }, []);

  // On first load and on request: fit the whole edit on screen (phones keep shots wide enough to touch).
  useEffect(() => {
    if (fitted.current === fitSignal || clips.length === 0 || viewport === 0) return;
    fitted.current = fitSignal;
    const fit = centered ? Math.max(0.035, (viewport * 0.85) / endMs) : (viewport - 2 * pad) / contentMs;
    setZoom(Math.max(MIN_PPMS, Math.min(MAX_PPMS, fit)) / 0.1);
  }, [fitSignal, clips.length, viewport, centered, endMs, contentMs, pad, setZoom]);

  // Phones: the playhead stays in the middle and the edit slides under it.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const x = playhead_ms * ppm;
    if (centered) {
      if (Math.abs(el.scrollLeft - x) > 0.5) {
        programmatic.current = x;
        el.scrollLeft = x;
      }
    } else if (pad + x < el.scrollLeft || pad + x > el.scrollLeft + el.clientWidth - 24) {
      el.scrollLeft = Math.max(0, pad + x - el.clientWidth / 3);
    }
  }, [playhead_ms, ppm, centered, pad]);

  // Native listener: React's wheel handler is passive and can't stop the page from zooming.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const s = useTimelineStore.getState();
      s.setZoom(Math.max(MIN_PPMS, Math.min(MAX_PPMS, s.pixels_per_ms * (e.deltaY < 0 ? 1.12 : 1 / 1.12))) / 0.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const msAt = (clientX: number) => {
    const el = scroller.current!;
    return (clientX - el.getBoundingClientRect().left + el.scrollLeft - pad) / ppm;
  };

  /** Pulls a time onto the playhead, a cut or a beat when it is within a few pixels. */
  const snap = (ms: number, ignoreId?: string) => {
    const targets = [playhead_ms, 0, ...beatMarks];
    for (const c of videoClips) if (c.id !== ignoreId) targets.push(c.start_ms, c.end_ms);
    let best: number | null = null;
    for (const t of targets) if (Math.abs(t - ms) * ppm <= SNAP_PX && (best === null || Math.abs(t - ms) < Math.abs(best - ms))) best = t;
    setSnapAt(best);
    return best ?? ms;
  };

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'scrub') {
      setPlayhead(Math.max(0, Math.min(endMs, msAt(e.clientX))));
      return;
    }
    const deltaMs = (e.clientX - d.startX) / ppm;
    const clip = d.origin.find((c) => c.id === d.id)!;
    const isVideo = clip.track_id === videoTrack?.id;
    const originVideo = d.origin.filter((c) => c.track_id === videoTrack?.id);

    if (d.kind === 'trim') {
      if (isVideo) {
        const edgeAt = d.edge === 'end' ? clip.end_ms : clip.start_ms;
        const target = d.edge === 'end' ? snap(edgeAt + deltaMs, clip.id) : edgeAt + deltaMs;
        commitClips(trimClip(d.origin, d.id, d.edge, target - edgeAt), d.key);
      } else {
        const edgeOut = d.edge === 'end' ? clip.end_ms : clip.start_ms;
        const edgeTl = outputToTimelineMs(originVideo, edgeOut);
        const out = timelineToOutputMs(originVideo, snap(edgeTl + deltaMs));
        commitClips(trimFreeClip(d.origin, d.id, d.edge, out - edgeOut), d.key);
      }
      return;
    }
    if (d.touch) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < 6) return;
    d.moved = true;
    if (isVideo) {
      const at = clip.start_ms + deltaMs + (clip.end_ms - clip.start_ms) / 2;
      const index = dropIndex(d.origin, d.id, at);
      const others = originVideo.filter((c) => c.id !== d.id).sort(byStart);
      const dropAt = index < others.length ? others[index].start_ms : (others[others.length - 1]?.end_ms ?? 0);
      setMoveOffset({ id: d.id, dx: e.clientX - d.startX, dropAt });
    } else {
      const startTl = snap(outputToTimelineMs(originVideo, clip.start_ms) + deltaMs);
      commitClips(moveFreeClip(d.origin, d.id, timelineToOutputMs(originVideo, startTl)), d.key);
    }
  }

  function endDrag(e: React.PointerEvent | null) {
    const d = drag.current;
    drag.current = null;
    setSnapAt(null);
    if (!d || d.kind !== 'move') return;
    const clip = d.origin.find((c) => c.id === d.id)!;
    if (!d.moved) selectClip(d.id);
    else if (e && clip.track_id === videoTrack?.id) {
      const at = clip.start_ms + (e.clientX - d.startX) / ppm + (clip.end_ms - clip.start_ms) / 2;
      commitClips(reorderClip(d.origin, d.id, dropIndex(d.origin, d.id, at)), d.key);
    }
    setMoveOffset(null);
  }

  function startClipDrag(e: React.PointerEvent, clip: TimelineClip, track: TimelineTrack, edge?: 'start' | 'end') {
    e.stopPropagation();
    if (track.locked || isClipLocked(clip)) {
      selectClip(clip.id);
      return;
    }
    const touch = e.pointerType === 'touch';
    // On touch, a press on a shot may be the start of a scroll; only trims capture the finger.
    if (edge || !touch) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPlaying(false);
    const key = `drag:${clip.id}:${++dragCount.current}`;
    drag.current = edge
      ? { kind: 'trim', id: clip.id, edge, startX: e.clientX, origin: clips, key }
      : { kind: 'move', id: clip.id, startX: e.clientX, origin: clips, key, moved: false, touch };
    if (edge) selectClip(clip.id);
  }

  function startScrub(e: React.PointerEvent) {
    if (centered && e.pointerType === 'touch') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPlaying(false);
    drag.current = { kind: 'scrub' };
    setPlayhead(Math.max(0, Math.min(endMs, msAt(e.clientX))));
  }

  function onScroll() {
    const el = scroller.current;
    if (!el || !centered) return;
    if (programmatic.current !== null && Math.abs(el.scrollLeft - programmatic.current) < 1.5) {
      programmatic.current = null;
      return;
    }
    programmatic.current = null;
    if (drag.current) return;
    setPlayhead(Math.max(0, Math.min(endMs, el.scrollLeft / ppm)));
  }

  const step = TICK_STEPS.find((s) => s * ppm >= 72) ?? 120000;
  const minor = step / 5;
  const ticks: number[] = [];
  for (let t = 0; t <= contentMs; t += minor) ticks.push(Math.round(t));
  const contentWidth = contentMs * ppm + pad * 2;
  const visibleTracks = tracks.filter((t) => t.track_type !== 'sfx');
  const x = (ms: number) => pad + ms * ppm;

  return (
    <div ref={root} className={`relative flex min-h-0 select-none overflow-hidden rounded-2xl border border-line bg-[#0c0d0c]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ${roomy ? 'h-full' : ''}`}>
      <div className={`${centered ? 'w-10' : 'w-11 md:w-[9.5rem]'} shrink-0 border-r border-line bg-obsidian-900`}>
        <div className="h-7 border-b border-line" />
        {visibleTracks.map((track) => {
          const Icon = TRACK_ICON[track.track_type];
          return (
            <div key={track.id} style={{ height: rowHeight[track.track_type] }} className="flex items-center gap-1.5 border-b border-line px-2.5">
              <Icon size={14} className={`shrink-0 ${track.muted ? 'text-white/30' : 'text-gold-300/80'}`} aria-hidden />
              <span className={`${centered ? 'hidden' : 'hidden md:block'} flex-1 truncate text-[13px] text-[#d6d0c0]`}>{TRACK_LABEL[track.track_type]}</span>
              <div className={`${centered || !pro ? 'hidden' : 'hidden md:flex'} items-center`}>
                {track.track_type !== 'caption' && (
                  <button
                    onClick={() => toggleTrackMute(track.id)}
                    aria-label={track.muted ? `Turn ${TRACK_LABEL[track.track_type]} sound on` : `Mute ${TRACK_LABEL[track.track_type]}`}
                    aria-pressed={track.muted}
                    title={track.muted ? 'Sound off' : 'Sound on'}
                    className={`grid size-7 place-items-center rounded-md hover:bg-white/5 ${track.muted ? 'text-red-300/80' : 'text-white/45 hover:text-white/80'}`}
                  >
                    {track.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                )}
                <button
                  onClick={() => toggleTrackLock(track.id)}
                  aria-label={track.locked ? `Unlock ${TRACK_LABEL[track.track_type]}` : `Lock ${TRACK_LABEL[track.track_type]}`}
                  aria-pressed={track.locked}
                  title={track.locked ? 'Locked' : 'Lock so nothing moves'}
                  className={`grid size-7 place-items-center rounded-md hover:bg-white/5 ${track.locked ? 'text-gold-300' : 'text-white/45 hover:text-white/80'}`}
                >
                  {track.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative min-w-0 flex-1">
        <div
          ref={scroller}
          className={`relative h-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${centered ? 'touch-pan-x' : ''}`}
          onScroll={onScroll}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e)}
          onPointerCancel={() => endDrag(null)}
          onTouchStart={(e) => {
            if (is_playing) setPlaying(false);
            if (e.touches.length === 2) {
              const [a, b] = [e.touches[0], e.touches[1]];
              pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), ppm };
            }
          }}
          onTouchMove={(e) => {
            if (!pinch.current || e.touches.length !== 2) return;
            const [a, b] = [e.touches[0], e.touches[1]];
            const ratio = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.current.dist;
            setZoom(Math.max(MIN_PPMS, Math.min(MAX_PPMS, pinch.current.ppm * ratio)) / 0.1);
          }}
          onTouchEnd={() => { pinch.current = null; }}
        >
          <div className="relative" style={{ width: contentWidth }}>
            <div
              className="relative h-7 cursor-ew-resize touch-pan-x border-b border-line bg-obsidian-900/80"
              onPointerDown={startScrub}
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={Math.round(endMs / 1000)}
              aria-valuenow={Math.round(playhead_ms / 1000)}
              aria-valuetext={formatTime(playhead_ms)}
            >
              {ticks.map((t) => {
                const major = t % step === 0;
                if (!major && !pro) return null;
                return (
                  <div key={t} className="absolute bottom-0" style={{ left: x(t) }}>
                    <div className={`w-px ${major ? 'h-2.5 bg-white/30' : 'h-1.5 bg-white/12'}`} />
                    {major && <span className="absolute bottom-3 left-1 whitespace-nowrap text-[10px] tabular-nums text-[#9aa3ad]">{formatClock(t, step < 1000)}</span>}
                  </div>
                );
              })}
              {pro &&
                beatMarks.map((ms, i) => (
                  <div key={i} className="absolute bottom-0 h-1 w-1 -translate-x-1/2 rounded-full bg-gold-300/70" style={{ left: x(ms) }} />
                ))}
            </div>

            {visibleTracks.map((track) => (
              <div
                key={track.id}
                style={{ height: rowHeight[track.track_type] }}
                className={`relative border-b border-line ${track.locked ? 'bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgba(255,255,255,0.025)_7px_14px)]' : ''}`}
                onClick={() => selectClip(null)}
              >
                {clips
                  .filter((c) => c.track_id === track.id)
                  .map((clip) => {
                    const { start, end } = place(clip);
                    return (
                      <ClipBlock
                        key={clip.id}
                        clip={clip}
                        track={track}
                        left={x(start)}
                        width={Math.max(6, (end - start) * ppm)}
                        ppm={ppm}
                        number={shotNumber.get(clip.id) ?? 0}
                        selected={selected_clip_id === clip.id}
                        dragDx={moveOffset?.id === clip.id ? moveOffset.dx : null}
                        beats={track.track_type === 'audio' ? beatMarks.filter((b) => b >= start && b <= end).map((b) => (b - start) * ppm) : []}
                        rowHeight={rowHeight[track.track_type]}
                        onDown={(e, edge) => startClipDrag(e, clip, track, edge)}
                        onSelect={() => selectClip(clip.id)}
                      />
                    );
                  })}

                {track.track_type === 'video' &&
                  videoClips.slice(0, -1).map((clip) => {
                    const hasTransition = clip.transition_out && clip.transition_out !== 'cut';
                    return (
                      <button
                        key={`j-${clip.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectClip(clip.id);
                        }}
                        aria-label={`Change the transition after shot ${shotNumber.get(clip.id)} (now ${TRANSITION_LABELS[clip.transition_out || 'cut']})`}
                        title={TRANSITION_LABELS[clip.transition_out || 'cut']}
                        className={`absolute top-0 z-20 grid size-5 -translate-x-1/2 -translate-y-[35%] place-items-center rounded-full border transition-transform hover:scale-110 ${
                          hasTransition
                            ? 'border-gold-200 bg-gold-300 text-[#1a160e] shadow-[0_0_10px_rgba(217,192,138,0.6)]'
                            : 'border-white/25 bg-obsidian-900 text-white/60'
                        } ${(clip.end_ms - clip.start_ms) * ppm < 40 ? 'hidden' : ''}`}
                        style={{ left: x(clip.end_ms) }}
                      >
                        {hasTransition ? <Blend size={11} strokeWidth={2.4} /> : <Plus size={10} strokeWidth={2.6} />}
                      </button>
                    );
                  })}

                {onAdd && !track.locked && track.track_type === 'video' && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onAdd('shots'); }}
                    className="absolute inset-y-[3px] flex w-11 items-center justify-center rounded-lg border border-dashed border-white/20 text-white/50 transition-colors hover:border-gold-300/60 hover:bg-gold-500/10 hover:text-gold-100"
                    style={{ left: x(videoEnd) + 8 }}
                    aria-label="Add more shots from your storyboard"
                    title="Add more shots from your storyboard"
                  >
                    <Plus size={18} />
                  </button>
                )}
                {onAdd && !track.locked && track.track_type !== 'video' && !clips.some((c) => c.track_id === track.id) && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onAdd(track.track_type === 'caption' ? 'text' : 'music'); }}
                    className="absolute inset-y-[3px] flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 text-xs text-white/55 transition-colors hover:border-gold-300/60 hover:bg-gold-500/10 hover:text-gold-100"
                    style={{ left: x(0), width: Math.max(140, Math.min(260, videoEnd * ppm)) }}
                  >
                    <Plus size={14} /> {track.track_type === 'caption' ? 'Add text' : 'Add a song'}
                  </button>
                )}

                {moveOffset && moveOffset.dropAt !== null && track.track_type === 'video' && (
                  <div className="absolute inset-y-0 z-30 w-0.5 bg-gold-200 shadow-[0_0_8px_rgba(243,229,192,0.9)]" style={{ left: x(moveOffset.dropAt) }} />
                )}
              </div>
            ))}

            {snapAt !== null && (
              <div className="pointer-events-none absolute bottom-0 top-7 z-30 w-px bg-[#b6ddd3] shadow-[0_0_6px_#b6ddd3]" style={{ left: x(snapAt) }} />
            )}

            {!centered && <Playhead left={x(playhead_ms)} ms={playhead_ms} />}
          </div>
        </div>
        {centered && <Playhead left="50%" ms={playhead_ms} />}
      </div>
    </div>
  );
}

function Playhead({ left, ms }: { left: number | string; ms: number }) {
  // Near the left edge the time label hangs to the right so it is never cut off.
  const edge = typeof left === 'number' && left < 28;
  return (
    <div className="pointer-events-none absolute bottom-0 top-0 z-40 w-0.5 -translate-x-1/2 bg-gold-200 shadow-[0_0_10px_rgba(227,207,159,0.8)]" style={{ left }}>
      <div className={`absolute top-0 rounded-b-md bg-gold-200 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-[#1a160e] ${edge ? 'left-0 rounded-br-md rounded-bl-none' : 'left-1/2 -translate-x-1/2'}`}>
        {formatClock(ms, true)}
      </div>
    </div>
  );
}

function ClipBlock({ clip, track, left, width, ppm, number, selected, dragDx, beats, rowHeight, onDown, onSelect }: {
  clip: TimelineClip;
  track: TimelineTrack;
  left: number;
  width: number;
  ppm: number;
  number: number;
  selected: boolean;
  dragDx: number | null;
  beats: number[];
  rowHeight: number;
  onDown: (e: React.PointerEvent, edge?: 'start' | 'end') => void;
  onSelect: () => void;
}) {
  const kind = track.track_type;
  const meta = (clip.metadata || {}) as { name?: string; text?: string; shot?: { subject?: string }; review_note?: unknown };
  const hasUpdate = useTimelineStore((s) => Boolean(s.storyboardUpdates[clip.id]));
  const needsReview = kind === 'video' && (typeof meta.review_note === 'string' || hasUpdate);
  // A shot is named by what it shows; the number chip already says which one it is.
  const subject = typeof meta.shot?.subject === 'string' ? meta.shot.subject.trim() : '';
  const label = kind === 'video' ? subject || `Shot ${number}` : kind === 'audio' ? meta.name || 'Music' : meta.text || 'Text';
  const tone =
    kind === 'video'
      ? 'border-white/10 bg-[#1b1a16]'
      : kind === 'audio'
        ? 'border-[#b6ddd3]/30 bg-[#16201e]'
        : 'border-[#c9b6e8]/30 bg-[#211c2b]';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label}, ${((clip.end_ms - clip.start_ms) / 1000).toFixed(1)} seconds long`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => onDown(e)}
      className={`group absolute inset-y-[3px] overflow-hidden rounded-lg border ${tone} ${
        selected ? 'z-10 border-gold-200 shadow-[0_0_0_1px_#e3cf9f,0_0_22px_-4px_rgba(217,192,138,0.75)]' : 'hover:border-white/25'
      } ${dragDx !== null ? 'z-20 opacity-85 shadow-2xl' : ''} ${track.locked || isClipLocked(clip) ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
      style={{ left, width, transform: dragDx !== null ? `translateX(${dragDx}px)` : undefined }}
    >
      {kind === 'video' && <Filmstrip clip={clip} width={width} ppm={ppm} height={rowHeight - 8} />}
      {kind === 'audio' && <WaveformStrip clip={clip} width={width} />}
      {kind === 'audio' &&
        beats.map((bx, i) => <span key={i} className="absolute bottom-1 h-1 w-1 -translate-x-1/2 rounded-full bg-gold-300/80" style={{ left: bx }} />)}

      <div
        className={`pointer-events-none relative h-full ${kind === 'video' ? 'bg-[linear-gradient(180deg,rgba(0,0,0,0.45),transparent_38%,transparent_55%,rgba(0,0,0,0.65))]' : 'flex items-center'}`}
      >
        {kind === 'video' ? (
          <>
            {/* Top-left: which shot, and its speed. Bottom: name and length, clear of the trim handles. */}
            <span className={`absolute top-1.5 flex items-center gap-1 ${selected ? 'left-5' : 'left-3.5'}`}>
              {width > 22 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-[5px] bg-black/55 px-1 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
                  {number}
                </span>
              )}
              {needsReview && (
                <span className="size-2.5 rounded-full bg-amber-300 ring-2 ring-black/50" title="Something to check on this shot" />
              )}
              {isClipLocked(clip) && width > 40 && (
                <span className="grid size-4 place-items-center rounded-[5px] bg-gold-300/90 text-[#1a160e]" title="Approved and locked">
                  <Lock size={10} strokeWidth={2.6} />
                </span>
              )}
              {clipSpeed(clip) !== 1 && width > 56 && (
                <span className="grid h-4 place-items-center rounded-[5px] bg-gold-300/90 px-1 text-[10px] font-semibold tabular-nums text-[#1a160e]">
                  {clipSpeed(clip)}×
                </span>
              )}
            </span>
            {subject && width > 130 && (
              <span className={`absolute bottom-1.5 max-w-[60%] truncate text-[11px] font-medium text-white/95 ${selected ? 'left-5' : 'left-2.5'}`}>{subject}</span>
            )}
            {width > 88 && (
              <span className={`absolute bottom-1.5 text-[10px] tabular-nums text-white/75 ${selected ? 'right-5' : 'right-3'}`}>{formatClock(clip.end_ms - clip.start_ms, true)}</span>
            )}
          </>
        ) : (
          width > 34 && (
            <span
              className={`relative mx-2 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                kind === 'audio' ? 'bg-[#0f1716]/85 text-[#dff1ec] backdrop-blur-sm' : 'text-[#ece4fa]'
              }`}
            >
              {label}
            </span>
          )
        )}
      </div>

      {!track.locked && !isClipLocked(clip) &&
        (['start', 'end'] as const).map((edge) => (
          <span
            key={edge}
            onPointerDown={(e) => onDown(e, edge)}
            aria-hidden
            className={`absolute inset-y-0 z-10 flex cursor-ew-resize touch-none items-center justify-center ${edge === 'start' ? 'left-0' : 'right-0'} ${
              selected ? 'w-4 bg-gold-200' : 'w-2.5 opacity-0 group-hover:bg-white/20 group-hover:opacity-100 pointer-coarse:hidden'
            }`}
          >
            <span className={`h-4 w-0.5 rounded-full ${selected ? 'bg-[#1a160e]/70' : 'bg-white/80'}`} />
          </span>
        ))}
    </div>
  );
}

function Filmstrip({ clip, width, ppm, height }: { clip: TimelineClip; width: number; ppm: number; height: number }) {
  const strip = useFilmstrip(clip.asset_url);
  if (!strip || strip.frames.length === 0) {
    return <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(217,192,138,0.28),rgba(138,108,62,0.16))]" />;
  }
  const tileW = Math.max(24, height) * strip.aspect;
  const count = Math.min(60, Math.ceil(width / tileW));
  return (
    <div className="absolute inset-0 flex">
      {Array.from({ length: count }, (_, k) => {
        const sec = (clip.trim_start_ms + (((k + 0.5) * tileW) / ppm) * clipSpeed(clip)) / 1000;
        const index = Math.max(0, Math.min(FILMSTRIP_FRAMES - 1, Math.floor((sec / strip.durationSec) * FILMSTRIP_FRAMES)));
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={k} src={strip.frames[index]} alt="" draggable={false} className="h-full shrink-0 object-cover opacity-90" style={{ width: tileW }} />;
      })}
    </div>
  );
}

function WaveformStrip({ clip, width }: { clip: TimelineClip; width: number }) {
  const wave = useWaveform(clip.asset_url);
  const canvas = useRef<HTMLCanvasElement>(null);
  const w = Math.min(4096, Math.max(1, Math.round(width)));

  useEffect(() => {
    const el = canvas.current;
    if (!el || !wave) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = el.clientHeight || 36;
    el.width = w * dpr;
    el.height = h * dpr;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(182, 221, 211, 0.55)';
    const startSec = clip.trim_start_ms / 1000;
    const spanSec = (clip.end_ms - clip.start_ms) / 1000;
    for (let px = 0; px < w; px += 3) {
      const i = Math.floor((startSec + (px / w) * spanSec) * wave.perSec);
      const v = wave.peaks[i] ?? 0;
      const bar = Math.max(1, v * (h - 8));
      ctx.fillRect(px, (h - bar) / 2, 2, bar);
    }
  }, [wave, w, clip.trim_start_ms, clip.start_ms, clip.end_ms]);

  return <canvas ref={canvas} className="absolute inset-0 h-full" style={{ width: w }} aria-hidden />;
}

export const ZOOM_LIMITS = { MIN_PPMS, MAX_PPMS };

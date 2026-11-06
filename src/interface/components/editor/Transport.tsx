'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { TimelineClip } from '@/core/types/timeline';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { formatClock, formatTime } from './labels';

/** The big gold play button; a soft ring breathes around it while the video plays. */
export function PlayOrb({ size = 'lg', disabled }: { size?: 'lg' | 'md'; disabled?: boolean }) {
  const playing = useTimelineStore((s) => s.is_playing);
  const toggle = useTimelineStore((s) => s.togglePlay);
  const dim = size === 'lg' ? 'size-[52px]' : 'size-11';
  return (
    <button onClick={toggle} disabled={disabled} aria-label={playing ? 'Pause' : 'Play'} className={`relative grid ${dim} shrink-0 place-items-center rounded-full disabled:opacity-40`}>
      {playing && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border border-gold-200/60"
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 1.45, opacity: 0 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span className={`ed-gold grid ${dim} place-items-center rounded-full`}>
        <motion.span key={playing ? 'pause' : 'play'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}>
          {playing ? <Pause size={size === 'lg' ? 20 : 18} fill="currentColor" /> : <Play size={size === 'lg' ? 20 : 18} fill="currentColor" className="translate-x-px" />}
        </motion.span>
      </span>
    </button>
  );
}

const roundButton =
  'grid size-10 place-items-center rounded-full text-[#cfc9b9] transition-all hover:bg-white/[0.07] hover:text-white active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent';

/** A strip of the whole video, one segment per shot. Tap anywhere to jump there. */
export function ShotMinimap({ shots, endMs }: { shots: TimelineClip[]; endMs: number }) {
  const playhead = useTimelineStore((s) => s.playhead_ms);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const setPlaying = useTimelineStore((s) => s.setPlaying);
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  if (!shots.length || endMs <= 0) return null;
  const seek = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    setPlayhead(Math.max(0, Math.min(endMs, ((clientX - rect.left) / rect.width) * endMs)));
  };
  const pct = Math.min(100, (playhead / endMs) * 100);
  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Position in the video"
      aria-valuemin={0}
      aria-valuemax={Math.round(endMs / 1000)}
      aria-valuenow={Math.round(playhead / 1000)}
      className="group/map relative flex h-5 cursor-pointer touch-none items-center"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; setPlaying(false); seek(e.clientX); }}
      onPointerMove={(e) => dragging.current && seek(e.clientX)}
      onPointerUp={() => { dragging.current = false; }}
    >
      <div className="flex h-1.5 w-full gap-[3px] transition-[height] duration-200 group-hover/map:h-2">
        {shots.map((c) => {
          const share = ((c.end_ms - c.start_ms) / endMs) * 100;
          const fill = Math.max(0, Math.min(1, (playhead - c.start_ms) / Math.max(1, c.end_ms - c.start_ms)));
          const current = playhead >= c.start_ms && playhead < c.end_ms;
          return (
            <span key={c.id} className={`relative h-full overflow-hidden rounded-full ${current ? 'bg-white/20' : 'bg-white/10'}`} style={{ width: `${share}%` }}>
              <span className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#c8a76a,#f3e5c0)]" style={{ width: `${fill * 100}%` }} />
            </span>
          );
        })}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#1a160e] bg-gold-100 opacity-0 shadow-[0_0_10px_rgba(243,229,192,0.9)] transition-opacity group-hover/map:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

/** Under the stage: where you are, the play controls, and the frame settings. */
export function Transport({ shots, endMs, pro, compact = false, right }: {
  shots: TimelineClip[];
  endMs: number;
  pro: boolean;
  compact?: boolean;
  right?: React.ReactNode;
}) {
  const playhead = useTimelineStore((s) => s.playhead_ms);
  const fps = useTimelineStore((s) => s.timeline?.fps);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const index = shots.findIndex((c) => c.start_ms <= playhead && c.end_ms > playhead);
  const current = index >= 0 ? shots[index] : null;
  const subject = (current?.metadata as { shot?: { subject?: string } } | undefined)?.shot?.subject?.trim();

  const jump = (dir: -1 | 1) => {
    if (dir < 0) {
      const prev = [...shots].reverse().find((c) => c.start_ms < playhead - 200);
      setPlayhead(prev ? prev.start_ms : 0);
    } else {
      const next = shots.find((c) => c.start_ms > playhead + 1);
      setPlayhead(next ? next.start_ms : endMs);
    }
  };

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      <ShotMinimap shots={shots} endMs={endMs} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0">
          {compact ? (
            // Phones: the total sits under the time so the play controls keep their room.
            <p className="font-mono text-[13px] leading-tight tabular-nums text-[#f3eee2]">
              {pro ? formatTime(playhead, fps) : formatClock(playhead, true)}
              <span className="block text-[11px] text-[#6f7782]">of {pro ? formatTime(endMs, fps) : formatClock(endMs, true)}</span>
            </p>
          ) : (
            <p className="whitespace-nowrap font-mono text-[15px] tabular-nums tracking-tight text-[#f3eee2]">
              {pro ? formatTime(playhead, fps) : formatClock(playhead, true)}
              <span className="text-[#6f7782]"> / {pro ? formatTime(endMs, fps) : formatClock(endMs, true)}</span>
            </p>
          )}
          {!compact && (
            <p className="mt-0.5 truncate text-xs text-[#8f97a1]">
              {current ? (
                <>
                  <span className="text-gold-200/90">Shot {index + 1}</span>
                  <span className="text-[#6f7782]"> of {shots.length}</span>
                  {subject ? <span> · {subject}</span> : null}
                </>
              ) : shots.length ? 'Between shots' : 'No shots yet'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {pro && !compact && <button onClick={() => setPlayhead(0)} className={roundButton} aria-label="Back to start" title="Back to start"><SkipBack size={16} /></button>}
          <button onClick={() => jump(-1)} disabled={!shots.length} className={roundButton} aria-label="Previous shot" title="Previous shot"><ChevronLeft size={20} /></button>
          <PlayOrb size={compact ? 'md' : 'lg'} disabled={!shots.length} />
          <button onClick={() => jump(1)} disabled={!shots.length} className={roundButton} aria-label="Next shot" title="Next shot"><ChevronRight size={20} /></button>
          {pro && !compact && <button onClick={() => setPlayhead(endMs)} className={roundButton} aria-label="Go to end" title="Go to end"><SkipForward size={16} /></button>}
        </div>
        <div className="flex min-w-0 justify-end">{right}</div>
      </div>
    </div>
  );
}

'use client';

import type * as React from 'react';
import { Check } from 'lucide-react';
import type { TransitionType } from '@/core/types/timeline';

type Option = { id: TransitionType; label: string };

/**
 * Each transition played on your own shots: the end of this shot becomes the start of the next.
 * At rest a tile holds the transition's midpoint, so the choices already look different; it plays
 * on hover and stays playing when chosen.
 */
export function TransitionTiles({ from, to, options, value, onChange, disabled, ending = false }: {
  from: string | null;
  to: string | null;
  options: Option[];
  value: TransitionType;
  onChange: (id: TransitionType) => void;
  disabled?: boolean;
  /** The last shot: the "next" picture is the end of the video. */
  ending?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${ending ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label={ending ? 'How the video ends' : 'Transition'}>
      {options.map(({ id, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(id)}
            data-live={active}
            className={`tr-tile group relative overflow-hidden rounded-xl border text-left transition-all disabled:opacity-40 ${
              active ? 'border-gold-300/80 shadow-[0_0_0_1px_#e3cf9f,0_10px_24px_-14px_rgba(217,192,138,0.8)]' : 'border-white/[0.08] hover:border-white/25'
            }`}
          >
            <span className="relative block aspect-video overflow-hidden bg-black">
              <Layer src={from} fallback="linear-gradient(135deg,#5a4a2e,#1c1712)" />
              <span className={`tr-b tr-${id} absolute inset-0`}>
                {ending ? <span className="absolute inset-0 bg-black" /> : <Layer src={to} fallback="linear-gradient(135deg,#1f3a3a,#0c1414)" />}
              </span>
              {id === 'fade_black' || id === 'fade_white' ? <span className={`tr-veil tr-veil-${id} absolute inset-0 ${id === 'fade_white' ? 'bg-white' : 'bg-black'}`} /> : null}
              {active ? <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-gold-200 text-[#1a160e]"><Check size={12} strokeWidth={3} /></span> : null}
            </span>
            <span className={`block px-2.5 py-1.5 text-[12px] font-medium ${active ? 'text-gold-50' : 'text-[#d6d0c0]'}`}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Layer({ src, fallback }: { src: string | null; fallback: string }) {
  if (!src) return <span className="absolute inset-0" style={{ background: fallback }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />;
}

/** Playback speed, felt: a gold dot crosses the track at that speed. */
export function SpeedChips({ speeds, value, onChange, disabled }: {
  speeds: readonly number[];
  value: number;
  onChange: (speed: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Speed">
      {speeds.map((speed) => {
        const active = value === speed;
        return (
          <button
            key={speed}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${speed}× speed`}
            disabled={disabled}
            onClick={() => onChange(speed)}
            className={`group flex flex-col items-center gap-1.5 rounded-xl border px-1 pb-1.5 pt-2 transition-colors disabled:opacity-40 ${
              active ? 'border-gold-400/60 bg-gold-500/15' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
            }`}
          >
            <span className="relative block h-1 w-full overflow-hidden rounded-full bg-white/10">
              <span
                className="sp-dot absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-gold-200 shadow-[0_0_6px_rgba(243,229,192,0.9)]"
                style={{ animationDuration: `${2 / speed}s` } as React.CSSProperties}
              />
            </span>
            <span className={`text-[12px] tabular-nums ${active ? 'text-gold-50' : 'text-[#d6d0c0]'}`}>{speed}×</span>
          </button>
        );
      })}
    </div>
  );
}

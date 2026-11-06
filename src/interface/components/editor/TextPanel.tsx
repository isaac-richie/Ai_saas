'use client';

import { useRef, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { useFilmstrip } from '@/interface/lib/media-thumbs';
import { CAPTION_STYLES, isCaptionStyle, type CaptionStyle } from '@/core/services/captions';
import { CAPTION_PREVIEW_CLASS, formatClock } from './labels';

const STYLE_IDS = Object.keys(CAPTION_STYLES) as CaptionStyle[];
const SAMPLE: Record<CaptionStyle, string> = {
  standard: 'We made it home.',
  karaoke: 'Every word, on time',
  cinematic_lower_third: 'Lagos, 5:42 a.m.',
  bold_center: 'NOW.',
};

/** Listening, then writing: a small drawing of sound turning into a caption. */
function CaptionsArt() {
  return (
    <svg viewBox="0 0 120 56" className="h-14 w-full" aria-hidden>
      <g stroke="#b6ddd3" strokeWidth="2.2" strokeLinecap="round" className="ed-rhythm">
        {[10, 18, 26, 34, 42].map((x, i) => (
          <line key={x} x1={x} x2={x} y1={28 - [6, 12, 18, 10, 5][i]} y2={28 + [6, 12, 18, 10, 5][i]} style={{ animationDelay: `${i * 0.15}s`, transformOrigin: `${x}px 28px` }} />
        ))}
      </g>
      <path d="M52 28h10m-4-4 4 4-4 4" stroke="#e3cf9f" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="70" y="18" width="46" height="20" rx="6" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.15)" />
      <rect x="76" y="25" width="22" height="2.5" rx="1.25" fill="#fff" />
      <rect x="100" y="25" width="10" height="2.5" rx="1.25" fill="#e3cf9f" />
      <rect x="80" y="30.5" width="26" height="2.5" rx="1.25" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

export function TextPanel({ onAddText, onAutoCaptions, hasRender }: {
  onAddText: () => Promise<void>;
  onAutoCaptions: () => Promise<string | null>;
  hasRender: boolean;
}) {
  const { clips, tracks, playhead_ms, selectClip, commitClips } = useTimelineStore();
  const [busy, setBusy] = useState<'add' | 'auto' | null>(null);
  const restyles = useRef(0);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const captionTrack = tracks.find((t) => t.track_type === 'caption');
  const captions = clips.filter((c) => c.track_id === captionTrack?.id).sort((a, b) => a.start_ms - b.start_ms);
  const styles = new Set(captions.map((c) => (c.metadata as { style?: string })?.style).map((s) => (isCaptionStyle(s) ? s : 'standard')));
  const current = styles.size === 1 ? [...styles][0] : null;

  // The style cards show the shot under the playhead, so the choice is made on your own picture.
  const videoTrack = tracks.find((t) => t.track_type === 'video');
  const shots = clips.filter((c) => c.track_id === videoTrack?.id);
  const shot = shots.find((c) => c.start_ms <= playhead_ms && c.end_ms > playhead_ms) ?? shots[0];
  const strip = useFilmstrip(shot?.asset_url);
  const frame = strip?.frames[Math.floor((strip.frames.length - 1) / 2)];

  const styleAll = (style: CaptionStyle) => {
    if (!captionTrack || captions.length === 0 || captionTrack.locked) return;
    commitClips(
      clips.map((c) => (c.track_id === captionTrack.id ? { ...c, metadata: { ...((c.metadata as object) || {}), style } } : c)),
      `caption-style-all:${style}:${++restyles.current}`,
    );
  };

  return (
    <div className="space-y-6 p-4">
      <button
        onClick={async () => { setBusy('add'); await onAddText(); setBusy(null); }}
        disabled={busy !== null}
        className="ed-gold flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold disabled:opacity-50"
      >
        {busy === 'add' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add text at the playhead
      </button>

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b0b8c4]">Text style</h4>
          <span className="text-[11px] text-[#7d858f]">{captions.length ? 'Tap to restyle all text' : 'Add text to use a style'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {STYLE_IDS.map((style) => {
            const active = current === style && captions.length > 0;
            return (
              <button
                key={style}
                onClick={() => styleAll(style)}
                disabled={captions.length === 0 || captionTrack?.locked}
                aria-pressed={active}
                className={`group relative overflow-hidden rounded-xl border text-left transition-all disabled:cursor-default ${
                  active ? 'border-gold-300/80 shadow-[0_0_0_1px_#e3cf9f,0_10px_30px_-14px_rgba(217,192,138,0.8)]' : 'border-white/[0.08] hover:border-white/25'
                }`}
              >
                <div className="relative aspect-video overflow-hidden bg-[linear-gradient(135deg,#2a2218,#0e0c0a)]" style={{ containerType: 'inline-size' }}>
                  {frame ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={frame} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105" />
                  ) : null}
                  <div className={`pointer-events-none absolute inset-x-[6%] text-center leading-tight ${CAPTION_PREVIEW_CLASS[style]}`}>{SAMPLE[style]}</div>
                  {active ? <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-gold-200 text-[#1a160e]"><Check size={12} strokeWidth={3} /></span> : null}
                </div>
                <span className="block px-2.5 py-2 text-[12.5px] font-medium text-[#e8e2d2]">{CAPTION_STYLES[style].label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#b6ddd3]/15 bg-[linear-gradient(160deg,rgba(182,221,211,0.08),rgba(255,255,255,0.01)_55%)] p-3.5">
        <CaptionsArt />
        <p className="mt-2 text-[14px] font-medium text-white">Auto captions</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#9aa3ad]">
          Listens to your video and writes down what&apos;s said, timed to each word.
          {!hasRender && ' Make your video once first so there’s sound to listen to.'}
        </p>
        <button
          onClick={async () => {
            setBusy('auto');
            setMessage(null);
            const problem = await onAutoCaptions();
            setBusy(null);
            setMessage(problem ? { tone: 'error', text: problem } : { tone: 'ok', text: 'Captions added. Tap one to change it.' });
          }}
          disabled={!hasRender || busy !== null}
          className="mt-3 flex h-9 items-center gap-2 rounded-full border border-[#b6ddd3]/40 px-4 text-[13px] text-[#dff1ec] transition-colors hover:bg-[#b6ddd3]/10 disabled:opacity-40"
        >
          {busy === 'auto' && <Loader2 size={14} className="animate-spin" />} {busy === 'auto' ? 'Listening…' : 'Create auto captions'}
        </button>
      </section>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-sm ${message.tone === 'error' ? 'border border-red-400/30 bg-red-500/10 text-red-100' : 'border border-[#b6ddd3]/30 bg-[#b6ddd3]/10 text-[#dff1ec]'}`}>
          {message.text}
        </p>
      )}

      {captions.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b0b8c4]">On screen · {captions.length}</h4>
          <ul className="space-y-1">
            {captions.slice(0, 50).map((c) => (
              <li key={c.id}>
                <button onClick={() => selectClip(c.id)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]">
                  <span className="shrink-0 rounded-md bg-[#c9b6e8]/12 px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums text-[#d9c9f3]">{formatClock(c.start_ms)}</span>
                  <span className="min-w-0 truncate text-[13px] text-[#e8e2d2]">{String((c.metadata as { text?: string })?.text || 'Text')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

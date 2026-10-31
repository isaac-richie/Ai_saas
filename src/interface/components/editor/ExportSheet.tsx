'use client';

import { useEffect, useRef } from 'react';
import { Check, Clapperboard, Download, Loader2, RotateCcw, Smartphone, Square, X } from 'lucide-react';
import type { RenderState } from './EditorWorkspace';
import { formatClock } from './labels';

export type ExportSummary = { shots: number; lengthMs: number; look: string; music: string | null; texts: number; format: string; wide: boolean };

const STEPS = [
  { at: 0, label: 'Preparing your shots' },
  { at: 62, label: 'Joining shots and transitions' },
  { at: 75, label: 'Mixing music' },
  { at: 85, label: 'Adding text' },
  { at: 93, label: 'Saving your video' },
];

const gold =
  'bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[#1a160e] shadow-[0_10px_30px_-12px_rgba(217,192,138,0.8)]';

/** Make video: what will be made, how it's going, and the finished file. */
export function ExportSheet({ open, onClose, render, summary, reframes, reframing, onRender, onReframe }: {
  open: boolean;
  onClose: () => void;
  render: RenderState;
  summary: ExportSummary;
  reframes: { aspect: string; url: string }[];
  reframing: boolean;
  onRender: () => void;
  onReframe: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const busy = render.status === 'queued' || render.status === 'rendering';

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      aria-label="Make video"
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-white backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:w-[30rem]"
    >
      <div className="max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-line-strong bg-obsidian-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-[sheet-rise_0.28s_cubic-bezier(0.22,1,0.36,1)] sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300/80">Make video</p>
            <h2 className="mt-1 text-xl font-light text-white">
              {render.status === 'completed' ? (
                <>Your video is <span className="lux-serif text-gold-200">ready</span></>
              ) : busy ? (
                <>Making your <span className="lux-serif text-gold-200">video</span></>
              ) : render.status === 'failed' ? (
                'That didn’t work'
              ) : (
                <>Ready to <span className="lux-serif text-gold-200">make it</span>?</>
              )}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-[#b0b8c4] hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {busy && <Progress render={render} />}

        {render.status === 'completed' && render.url && (
          <div className="space-y-4">
            <video src={render.url} controls playsInline className="aspect-video w-full rounded-2xl bg-black" />
            <a href={render.url} target="_blank" rel="noopener noreferrer" download className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold ${gold}`}>
              <Download size={17} /> Download video
            </a>
            {summary.wide && (
            <div className="rounded-2xl border border-line bg-white/[0.02] p-4">
              <p className="text-sm font-medium text-white">For phones</p>
              <p className="mt-0.5 text-sm text-[#b0b8c4]">Vertical for Reels, TikTok and Shorts; square for feeds. We keep the subject in frame.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {reframes.length === 0 ? (
                  <button onClick={onReframe} disabled={reframing} className="flex items-center gap-2 rounded-xl border border-gold-400/40 px-3.5 py-2.5 text-sm text-gold-100 hover:bg-gold-500/10 disabled:opacity-50">
                    {reframing ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />}
                    {reframing ? 'Making phone versions…' : 'Make vertical + square'}
                  </button>
                ) : (
                  reframes.map((f) => (
                    <a key={f.aspect} href={f.url} target="_blank" rel="noopener noreferrer" download className="flex items-center gap-2 rounded-xl border border-gold-400/40 px-3.5 py-2.5 text-sm text-gold-100 hover:bg-gold-500/10">
                      {f.aspect === '9:16' ? <Smartphone size={15} /> : <Square size={15} />}
                      {f.aspect === '9:16' ? 'Vertical' : f.aspect === '1:1' ? 'Square' : f.aspect}
                    </a>
                  ))
                )}
              </div>
            </div>
            )}
            <button onClick={onRender} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm text-[#b0b8c4] hover:bg-white/5 hover:text-white">
              <RotateCcw size={14} /> Made more changes? Make it again
            </button>
          </div>
        )}

        {render.status === 'failed' && (
          <div className="space-y-4">
            <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-100">
              {render.error || 'Something went wrong while making your video.'}
            </p>
            <button onClick={onRender} className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold ${gold}`}>
              <RotateCcw size={16} /> Try again
            </button>
          </div>
        )}

        {render.status === 'idle' && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-2.5">
              {[
                ['Format', summary.format],
                ['Length', formatClock(summary.lengthMs)],
                ['Look', summary.look],
                ['Music', summary.music || 'None'],
                ['Shots', String(summary.shots)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-line bg-white/[0.02] px-3.5 py-3">
                  <dt className="text-xs text-[#9aa3ad]">{k}</dt>
                  <dd className="mt-0.5 truncate text-[15px] text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm leading-relaxed text-[#b0b8c4]">
              We put it together in full quality{summary.texts ? `, with your ${summary.texts} text${summary.texts === 1 ? '' : 's'}` : ''}. It keeps going if you close this.
            </p>
            <button onClick={onRender} disabled={summary.shots === 0} className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold disabled:opacity-40 ${gold}`}>
              <Clapperboard size={17} /> Make video
            </button>
          </div>
        )}

        {busy && (
          <button onClick={onClose} className="mt-5 w-full rounded-xl border border-line py-2.5 text-sm text-[#e8e2d2] hover:bg-white/5">
            Keep editing while it works
          </button>
        )}
      </div>
    </dialog>
  );
}

function Progress({ render }: { render: RenderState }) {
  const pct = Math.max(2, Math.min(100, render.progress));
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative size-32 shrink-0" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
          <circle
            cx="60" cy="60" r={r} fill="none" stroke="url(#export-gold)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700"
          />
          <defs>
            <linearGradient id="export-gold" x1="0" x2="1">
              <stop offset="0" stopColor="#b8975a" />
              <stop offset="1" stopColor="#f3e5c0" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute inset-0 grid place-items-center text-2xl font-light tabular-nums text-white">{pct}%</span>
      </div>
      <ol className="w-full space-y-2" aria-live="polite">
        {STEPS.map((step, i) => {
          const nextAt = STEPS[i + 1]?.at ?? 101;
          const done = pct >= nextAt;
          const active = !done && pct >= step.at;
          return (
            <li key={step.label} className={`flex items-center gap-2.5 text-sm ${done ? 'text-[#b0b8c4]' : active ? 'text-white' : 'text-white/35'}`}>
              <span className={`grid size-5 shrink-0 place-items-center rounded-full ${done ? 'bg-gold-300/20 text-gold-200' : active ? 'text-gold-200' : 'border border-white/15'}`}>
                {done ? <Check size={12} strokeWidth={3} /> : active ? <Loader2 size={13} className="animate-spin" /> : null}
              </span>
              {active && render.stage ? render.stage : step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

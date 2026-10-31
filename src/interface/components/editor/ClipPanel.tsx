'use client';

import { ArrowLeft, ArrowRight, AudioWaveform, Blend, Magnet, Loader2, MousePointerClick, MoveHorizontal, RefreshCw, Scissors, Trash2 } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { TRANSITION_REGISTRY } from '@/core/services/transitions';
import { CAPTION_STYLES, type CaptionStyle } from '@/core/services/captions';
import type { TimelineClip, TransitionType } from '@/core/types/timeline';
import { useRef, useState } from 'react';
import { useFilmstrip } from '@/interface/lib/media-thumbs';
import { applyTake, rippleFrom, type Take } from '@/core/services/take-regenerate';
import { SPEEDS, clipSpeed } from '@/core/services/timeline-ops';
import { CAPTION_PREVIEW_CLASS, TRANSITION_LABELS, formatTime } from './labels';

const TRANSITIONS = Object.keys(TRANSITION_REGISTRY) as TransitionType[];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b0b8c4]">{title}</h4>
      {children}
    </section>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm text-[#d6d0c0]">
        {label}
        <span className="tabular-nums text-[#b0b8c4]">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[#d9c08a]" />
    </label>
  );
}

const pill = (active: boolean) =>
  `rounded-xl border px-3 py-2 text-sm transition-colors ${
    active ? 'border-gold-400/60 bg-gold-500/15 text-gold-50' : 'border-line bg-white/[0.02] text-[#d6d0c0] hover:border-white/20'
  }`;

export type TakeStatus = { state: 'idle' | 'working' | 'failed'; message?: string };

export function ClipPanel({ onSyncToBeat, onRegenerate, takeStatus }: {
  onSyncToBeat: () => void;
  onRegenerate?: (clipId: string, options: { durationSec?: number; note?: string }) => Promise<void>;
  takeStatus?: Record<string, TakeStatus>;
}) {
  const { clips, tracks, selected_clip_id, playhead_ms, updateClip, removeClip, reorder, split, setSpeed } = useTimelineStore();
  const clip = clips.find((c) => c.id === selected_clip_id);
  const track = tracks.find((t) => t.id === clip?.track_id);

  if (!clip || !track) {
    return (
      <div className="space-y-5 p-5">
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-gold-400/25 bg-gold-500/10 text-gold-200">
            <MousePointerClick size={20} />
          </span>
          <p className="mt-3 text-[15px] font-medium text-white">Pick something to change</p>
          <p className="mt-1 text-sm text-[#b0b8c4]">Tap a shot, song or text on the timeline.</p>
        </div>
        <ul className="space-y-2.5">
          {[
            [MoveHorizontal, 'Drag a shot to move it; drag its edges to make it shorter or longer.'],
            [Blend, 'Tap the circle between two shots to change how one becomes the next.'],
            [Magnet, 'Edges snap to the playhead, to cuts and to the gold beat dots.'],
          ].map(([Icon, text], i) => {
            const I = Icon as typeof Blend;
            return (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-3 text-sm leading-relaxed text-[#d6d0c0]">
                <I size={16} className="mt-0.5 shrink-0 text-gold-300" />
                {text as string}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const locked = track.locked;
  const duration = clip.end_ms - clip.start_ms;

  if (track.track_type === 'caption') return <TextClip clip={clip} locked={locked} />;

  if (track.track_type === 'audio') {
    const meta = (clip.metadata || {}) as { name?: string; bpm?: number; fade_in_sec?: number; fade_out_sec?: number };
    return (
      <div className="space-y-6 p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#b6ddd3]/15 text-[#b6ddd3]"><AudioWaveform size={18} /></span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-white">{meta.name || 'Music'}</p>
            <p className="text-sm text-[#b0b8c4]">{meta.bpm ? `${Math.round(meta.bpm)} beats per minute · ` : ''}{formatTime(duration)}</p>
          </div>
        </div>
        <button
          onClick={onSyncToBeat}
          disabled={!meta.bpm}
          className="w-full rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] px-4 py-3 text-sm font-semibold text-[#1a160e] disabled:opacity-40"
        >
          Cut my shots to the beat
        </button>
        <Section title="Sound">
          <Slider label="Volume" value={clip.volume} min={0} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateClip(clip.id, { volume: v })} />
          <Slider label="Fade in" value={meta.fade_in_sec ?? 0.5} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => updateClip(clip.id, { metadata: { ...clip.metadata, fade_in_sec: v } }, `fade-in:${clip.id}`)} />
          <Slider label="Fade out" value={meta.fade_out_sec ?? 1.5} min={0} max={5} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v) => updateClip(clip.id, { metadata: { ...clip.metadata, fade_out_sec: v } }, `fade-out:${clip.id}`)} />
        </Section>
        <button onClick={() => removeClip(clip.id)} disabled={locked} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 py-2.5 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-40">
          <Trash2 size={15} /> Remove music
        </button>
      </div>
    );
  }

  const shots = clips.filter((c) => c.track_id === track.id).sort((a, b) => a.start_ms - b.start_ms);
  const position = shots.findIndex((c) => c.id === clip.id);
  const isLast = position === shots.length - 1;
  const canSplit = playhead_ms > clip.start_ms + 300 && playhead_ms < clip.end_ms - 300;

  return (
    <div className="space-y-6 p-4">
      <ShotHeader clip={clip} position={position} count={shots.length} duration={duration} />

      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => reorder(clip.id, position - 1)} disabled={locked || position === 0} aria-label="Move earlier" className={`${pill(false)} grid place-items-center disabled:opacity-35`}><ArrowLeft size={16} /></button>
        <button onClick={() => reorder(clip.id, position + 1)} disabled={locked || isLast} aria-label="Move later" className={`${pill(false)} grid place-items-center disabled:opacity-35`}><ArrowRight size={16} /></button>
        <button onClick={() => split(clip.id, playhead_ms)} disabled={locked || !canSplit} aria-label="Split at playhead" title="Split at playhead" className={`${pill(false)} grid place-items-center disabled:opacity-35`}><Scissors size={16} /></button>
        <button onClick={() => removeClip(clip.id)} disabled={locked} aria-label="Delete shot" className="grid place-items-center rounded-xl border border-red-400/30 text-red-200 hover:bg-red-500/10 disabled:opacity-35"><Trash2 size={16} /></button>
      </div>

      <Section title={isLast ? 'How the video ends' : 'Into the next shot'}>
        {isLast ? (
          <div className="grid grid-cols-3 gap-2">
            {([['cut', 'Just end'], ['fade_black', 'Fade to black'], ['fade_white', 'Fade to white']] as const).map(([t, label]) => (
              <button
                key={t}
                disabled={locked}
                onClick={() => updateClip(clip.id, { transition_out: t, transition_out_ms: TRANSITION_REGISTRY[t].default_duration_ms }, `transition:${clip.id}:${Date.now()}`)}
                className={pill((clip.transition_out || 'cut') === t || (t === 'fade_black' && !['cut', 'fade_white', null, undefined].includes(clip.transition_out)))}
                aria-pressed={(clip.transition_out || 'cut') === t}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {TRANSITIONS.map((t) => (
              <button
                key={t}
                disabled={locked}
                onClick={() => updateClip(clip.id, { transition_out: t, transition_out_ms: TRANSITION_REGISTRY[t].default_duration_ms }, `transition:${clip.id}:${Date.now()}`)}
                className={pill((clip.transition_out || 'cut') === t)}
                aria-pressed={(clip.transition_out || 'cut') === t}
              >
                {TRANSITION_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Speed">
        <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((speed) => {
            const active = clipSpeed(clip) === speed;
            return (
              <button
                key={speed}
                role="radio"
                aria-checked={active}
                disabled={locked}
                onClick={() => setSpeed(clip.id, speed)}
                className={`rounded-lg border py-2 text-sm tabular-nums transition-colors disabled:opacity-40 ${
                  active ? 'border-gold-400/60 bg-gold-500/15 text-gold-50' : 'border-line bg-white/[0.02] text-[#d6d0c0] hover:border-white/20'
                }`}
              >
                {speed}×
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[#9aa3ad]">
          {clipSpeed(clip) < 1
            ? 'Slow motion: the shot gets longer to fit the same footage.'
            : clipSpeed(clip) > 1
              ? 'Sped up: the shot gets shorter.'
              : 'Below 1× is slow motion; above 1× speeds it up.'}
        </p>
      </Section>

      {onRegenerate && (
        <TakesSection clip={clip} locked={locked} status={takeStatus?.[clip.id]} onRegenerate={onRegenerate} />
      )}

      <Section title="Sound">
        <Slider label="Shot volume" value={clip.volume} min={0} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateClip(clip.id, { volume: v })} />
      </Section>
    </div>
  );
}

/** Make the shot again with the generator, or go back to an earlier take. */
function TakesSection({ clip, locked, status, onRegenerate }: {
  clip: TimelineClip;
  locked: boolean;
  status?: TakeStatus;
  onRegenerate: (clipId: string, options: { durationSec?: number; note?: string }) => Promise<void>;
}) {
  const { clips, tracks, commitClips } = useTimelineStore();
  const meta = (clip.metadata || {}) as { takes?: Take[]; pending_take?: unknown; source_duration_ms?: number; storyboard_item_id?: string };
  const takes = Array.isArray(meta.takes) ? meta.takes : [];
  const currentSec = Math.round((clip.end_ms - clip.start_ms) / 1000);
  const [seconds, setSeconds] = useState(Math.min(15, Math.max(3, currentSec)));
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const takeSwitches = useRef(0);
  const working = status?.state === 'working' || (Boolean(meta.pending_take) && status?.state !== 'failed');

  const chooseTake = (take: Take) => {
    const track = tracks.find((t) => t.id === clip.track_id);
    if (!track || track.locked) return;
    const swapped = applyTake(clip, take, { keepLength: true });
    const rest = clips.filter((c) => c.track_id !== clip.track_id);
    const shots = rippleFrom(clips.filter((c) => c.track_id === clip.track_id).map((c) => (c.id === clip.id ? swapped : c)));
    commitClips([...rest, ...shots], `use-take:${clip.id}:${++takeSwitches.current}`);
  };

  return (
    <Section title="New take">
      {working ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-gold-400/30 bg-gold-500/10 px-3.5 py-3">
          <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-gold-200" />
          <div className="text-sm leading-relaxed">
            <p className="text-gold-50">Making a new take of this shot…</p>
            <p className="text-[#b0b8c4]">{status?.message || 'Usually 1 to 3 minutes. Keep editing; it drops in when ready.'}</p>
          </div>
        </div>
      ) : confirming ? (
        <div className="space-y-3 rounded-xl border border-line bg-white/[0.02] p-3.5">
          <label className="block">
            <span className="flex justify-between text-sm text-[#d6d0c0]">
              Length <span className="tabular-nums text-[#b0b8c4]">{seconds}s</span>
            </span>
            <input type="range" min={3} max={15} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="mt-2 w-full accent-[#d9c08a]" />
          </label>
          <label className="block">
            <span className="text-sm text-[#d6d0c0]">What should change? <span className="text-[#9aa3ad]">(optional)</span></span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 300))}
              placeholder="e.g. slower camera, closer on her face"
              className="mt-1.5 w-full rounded-xl border border-line bg-obsidian-800/80 px-3 py-2.5 text-[15px] text-white placeholder:text-[#8f97a1] focus:border-gold-400/50 focus:outline-none"
            />
          </label>
          <p className="text-xs leading-relaxed text-[#9aa3ad]">Same prompt, references and starting frame as the original, so it still fits the shots around it. Uses one generation from your allowance.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirming(false)} className="flex-1 rounded-xl border border-line py-2.5 text-sm text-[#d6d0c0] hover:bg-white/5">Cancel</button>
            <button
              onClick={() => {
                setConfirming(false);
                void onRegenerate(clip.id, { durationSec: seconds !== currentSec ? seconds : undefined, note: note.trim() || undefined });
                setNote('');
              }}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] py-2.5 text-sm font-semibold text-[#1a160e]"
            >
              <RefreshCw size={15} /> Make new take
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={locked}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gold-400/40 py-2.5 text-sm text-gold-100 hover:bg-gold-500/10 disabled:opacity-40"
        >
          <RefreshCw size={15} /> Make this shot again
        </button>
      )}
      {status?.state === 'failed' && !working && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{status.message}</p>
      )}
      {takes.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-[#9aa3ad]">Earlier takes</p>
          <div className="grid grid-cols-3 gap-2">
            {takes.map((take) => (
              <TakeThumb key={take.url} take={take} disabled={locked || working} onUse={() => chooseTake(take)} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function TakeThumb({ take, disabled, onUse }: { take: Take; disabled: boolean; onUse: () => void }) {
  const strip = useFilmstrip(take.url);
  return (
    <button onClick={onUse} disabled={disabled} title={take.note ? `Change asked: ${take.note}` : 'Use this take'} className="group overflow-hidden rounded-lg border border-line text-left hover:border-gold-300/60 disabled:opacity-40">
      <div className="aspect-video bg-[linear-gradient(135deg,rgba(217,192,138,0.28),rgba(138,108,62,0.16))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {strip?.frames[0] && <img src={strip.frames[Math.floor(strip.frames.length / 3)]} alt="" className="h-full w-full object-cover" />}
      </div>
      <p className="px-1.5 py-1 text-[11px] text-[#d6d0c0] group-hover:text-gold-100">Use · {Math.round(take.source_duration_ms / 1000)}s</p>
    </button>
  );
}

function ShotHeader({ clip, position, count, duration }: { clip: TimelineClip; position: number; count: number; duration: number }) {
  const strip = useFilmstrip(clip.asset_url);
  return (
    <div className="flex items-center gap-3">
      <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-[linear-gradient(135deg,rgba(217,192,138,0.28),rgba(138,108,62,0.16))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {strip?.frames[0] && <img src={strip.frames[Math.floor(strip.frames.length / 3)]} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-white">Shot {position + 1} <span className="text-[#b0b8c4]">of {count}</span></p>
        <p className="text-sm tabular-nums text-[#b0b8c4]">{formatTime(duration)} long</p>
      </div>
    </div>
  );
}

function TextClip({ clip, locked }: { clip: TimelineClip; locked: boolean }) {
  const { updateClip, removeClip } = useTimelineStore();
  const meta = (clip.metadata || {}) as { text?: string; style?: CaptionStyle };
  return (
    <div className="space-y-6 p-4">
      <Section title="Text">
        <textarea
          value={meta.text ?? ''}
          disabled={locked}
          maxLength={300}
          onChange={(e) => updateClip(clip.id, { metadata: { ...clip.metadata, text: e.target.value } }, `text:${clip.id}`)}
          rows={3}
          className="w-full resize-none rounded-xl border border-line bg-obsidian-800/80 px-3 py-2.5 text-[15px] text-white focus:border-gold-400/50 focus:outline-none"
        />
      </Section>
      <Section title="Style">
        <div className="grid grid-cols-2 gap-2.5">
          {(Object.keys(CAPTION_STYLES) as CaptionStyle[]).map((s) => {
            const active = (meta.style ?? 'standard') === s;
            return (
              <button
                key={s}
                disabled={locked}
                onClick={() => updateClip(clip.id, { metadata: { ...clip.metadata, style: s } }, `style:${clip.id}:${Date.now()}`)}
                aria-pressed={active}
                className={`overflow-hidden rounded-xl border text-left transition-colors ${active ? 'border-gold-300/80' : 'border-line hover:border-white/25'}`}
              >
                <div className="@container relative aspect-video bg-[linear-gradient(160deg,#2a2f2b,#0d0f0d)]">
                  <span className={`absolute inset-x-[6%] text-center leading-tight ${CAPTION_PREVIEW_CLASS[s]}`}>Aa</span>
                </div>
                <p className={`px-2.5 py-1.5 text-sm ${active ? 'text-gold-50' : 'text-[#d6d0c0]'}`}>{CAPTION_STYLES[s].label}</p>
              </button>
            );
          })}
        </div>
      </Section>
      <button onClick={() => removeClip(clip.id)} disabled={locked} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 py-2.5 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-40">
        <Trash2 size={15} /> Delete text
      </button>
    </div>
  );
}

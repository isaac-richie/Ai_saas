'use client';

import { ArrowLeft, ArrowRight, AudioWaveform, Loader2, Lock, RefreshCw, Scissors, Trash2, Unlock } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { TRANSITION_REGISTRY } from '@/core/services/transitions';
import { CAPTION_STYLES, type CaptionStyle } from '@/core/services/captions';
import type { TimelineClip, TransitionType } from '@/core/types/timeline';
import { useRef, useState } from 'react';
import { useFilmstrip } from '@/interface/lib/media-thumbs';
import { applyTake, rippleFrom, type Take } from '@/core/services/take-regenerate';
import { SPEEDS, clipSpeed, trimClip } from '@/core/services/timeline-ops';
import { useIsPro } from '@/interface/hooks/use-editor-mode';
import { isClipLocked } from '@/core/services/edit-agent';
import { CAPTION_PREVIEW_CLASS, TRANSITION_LABELS, formatClock, formatTime } from './labels';
import { TransitionTiles, SpeedChips } from './TransitionTiles';
import { MAX_FAST_TRACK_SECONDS, MIN_FAST_TRACK_SECONDS, fastTrackUnitsForDuration } from '@/core/config/kie-video-models';
import { LightingPicker } from '@/interface/components/fast-video/lighting-visuals';
import { findLightingPreset } from '@/core/config/lighting-presets';

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

/** Three small moving diagrams of how the timeline is handled: trim, transition, snap. */
const clipRect = (x: number, w: number, tone: string) => <rect x={x} y="8" width={w} height="22" rx="4" fill={tone} stroke="rgba(255,255,255,0.18)" />;
const GESTURES: { title: string; text: string; art: React.ReactNode }[] = [
  {
    title: 'Trim and move',
    text: 'Drag a shot to move it. Drag its edges to make it shorter or longer.',
    art: (
      <svg viewBox="0 0 220 38" className="h-10 w-full" aria-hidden>
        {clipRect(8, 70, 'rgba(255,255,255,0.06)')}
        <g className="ed-gesture-trim">
          {clipRect(84, 86, 'rgba(227,207,159,0.22)')}
          <rect x="166" y="8" width="5" height="22" rx="2" fill="#e3cf9f" />
        </g>
        <path d="M184 19h22m-5-4 5 4-5 4" stroke="#e3cf9f" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" className="ed-gesture-arrow" />
      </svg>
    ),
  },
  {
    title: 'Change a transition',
    text: 'Tap the circle between two shots to choose how one becomes the next.',
    art: (
      <svg viewBox="0 0 220 38" className="h-10 w-full" aria-hidden>
        <defs>
          <linearGradient id="ed-xfade" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(227,207,159,0.25)" />
            <stop offset="1" stopColor="rgba(182,221,211,0.25)" />
          </linearGradient>
        </defs>
        {clipRect(8, 98, 'rgba(227,207,159,0.18)')}
        {clipRect(112, 98, 'rgba(182,221,211,0.16)')}
        <rect x="86" y="8" width="46" height="22" fill="url(#ed-xfade)" opacity="0.8" />
        <circle cx="109" cy="8" r="7" fill="#e3cf9f" className="ed-gesture-pulse" />
        <path d="M105.5 8h7" stroke="#1a160e" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Edges snap',
    text: 'Edges pull to the playhead, to cuts and to the gold beat marks.',
    art: (
      <svg viewBox="0 0 220 38" className="h-10 w-full" aria-hidden>
        {[30, 70, 110, 150, 190].map((x) => <rect key={x} x={x - 0.8} y="33" width="1.6" height="5" rx="0.8" fill="#e3cf9f" />)}
        <line x1="110" x2="110" y1="2" y2="34" stroke="#b6ddd3" strokeWidth="1.2" strokeDasharray="2 2" />
        <g className="ed-gesture-snap">{clipRect(30, 80, 'rgba(227,207,159,0.2)')}</g>
        {clipRect(112, 78, 'rgba(255,255,255,0.06)')}
      </svg>
    ),
  },
];

export type TakeStatus = { state: 'idle' | 'working' | 'failed'; message?: string };

export function ClipPanel({ onSyncToBeat, onRegenerate, takeStatus }: {
  onSyncToBeat: () => void;
  onRegenerate?: (clipId: string, options: { durationSec?: number; note?: string; lighting?: string }) => Promise<void>;
  takeStatus?: Record<string, TakeStatus>;
}) {
  const { clips, tracks, selected_clip_id, playhead_ms, updateClip, removeClip, reorder, split, setSpeed } = useTimelineStore();
  const pro = useIsPro();
  const clip = clips.find((c) => c.id === selected_clip_id);
  const track = tracks.find((t) => t.id === clip?.track_id);

  if (!clip || !track) {
    return (
      <div className="space-y-4 p-4">
        <div className="px-1">
          <p className="text-[15px] font-medium text-white">Pick something to change</p>
          <p className="mt-0.5 text-[13px] text-[#9aa3ad]">Tap a shot, the song or any text on the timeline.</p>
        </div>
        {GESTURES.map(({ art, title, text }) => (
          <div key={title} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <div className="border-b border-white/[0.05] bg-black/25 px-3 py-2.5">{art}</div>
            <div className="px-3.5 py-2.5">
              <p className="text-[13px] font-medium text-[#ece6d6]">{title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#9aa3ad]">{text}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // A shot is fixed when its row is locked or the creator approved and locked it.
  const locked = track.locked || isClipLocked(clip);
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
      <LockToggle clip={clip} rowLocked={track.locked} />
      <ReviewFlags clip={clip} locked={locked} />
      {pro && <ExactLength clip={clip} locked={locked} />}

      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => reorder(clip.id, position - 1)} disabled={locked || position === 0} aria-label="Move earlier" className={`${pill(false)} grid place-items-center disabled:opacity-35`}><ArrowLeft size={16} /></button>
        <button onClick={() => reorder(clip.id, position + 1)} disabled={locked || isLast} aria-label="Move later" className={`${pill(false)} grid place-items-center disabled:opacity-35`}><ArrowRight size={16} /></button>
        <button onClick={() => split(clip.id, playhead_ms)} disabled={locked || !canSplit} aria-label="Split at playhead" title="Split at playhead" className={`${pill(false)} grid place-items-center disabled:opacity-35`}><Scissors size={16} /></button>
        <button onClick={() => removeClip(clip.id)} disabled={locked} aria-label="Delete shot" className="grid place-items-center rounded-xl border border-red-400/30 text-red-200 hover:bg-red-500/10 disabled:opacity-35"><Trash2 size={16} /></button>
      </div>

      <Section title={isLast ? 'How the video ends' : 'Into the next shot'}>
        <ShotTransitionTiles
          clip={clip}
          next={shots[position + 1] ?? null}
          ending={isLast}
          disabled={locked}
          value={isLast && clip.transition_out && !['cut', 'fade_black', 'fade_white'].includes(clip.transition_out) ? 'fade_black' : clip.transition_out || 'cut'}
          options={isLast ? [{ id: 'cut', label: 'Just end' }, { id: 'fade_black', label: 'Fade to black' }, { id: 'fade_white', label: 'Fade to white' }] : TRANSITIONS.map((t) => ({ id: t, label: TRANSITION_LABELS[t] }))}
          onChange={(t) => updateClip(clip.id, { transition_out: t, transition_out_ms: TRANSITION_REGISTRY[t].default_duration_ms }, `transition:${clip.id}:${t}`)}
        />
      </Section>

      <Section title="Speed">
        <SpeedChips speeds={SPEEDS} value={clipSpeed(clip)} disabled={locked} onChange={(speed) => setSpeed(clip.id, speed)} />
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
/** Transition tiles fed with the last frame of this shot and the first frame of the next. */
function ShotTransitionTiles({ clip, next, ...rest }: { clip: TimelineClip; next: TimelineClip | null } & Omit<React.ComponentProps<typeof TransitionTiles>, 'from' | 'to'>) {
  const fromStrip = useFilmstrip(clip.asset_url);
  const toStrip = useFilmstrip(next?.asset_url ?? null);
  const from = fromStrip?.frames[fromStrip.frames.length - 1] ?? null;
  const to = toStrip?.frames[0] ?? null;
  return <TransitionTiles from={from} to={to} {...rest} />;
}

function TakesSection({ clip, locked, status, onRegenerate }: {
  clip: TimelineClip;
  locked: boolean;
  status?: TakeStatus;
  onRegenerate: (clipId: string, options: { durationSec?: number; note?: string; lighting?: string }) => Promise<void>;
}) {
  const { clips, tracks, commitClips } = useTimelineStore();
  const meta = (clip.metadata || {}) as { takes?: Take[]; pending_take?: unknown; source_duration_ms?: number; storyboard_item_id?: string };
  const takes = Array.isArray(meta.takes) ? meta.takes : [];
  const currentSec = Math.round((clip.end_ms - clip.start_ms) / 1000);
  const [seconds, setSeconds] = useState(Math.min(MAX_FAST_TRACK_SECONDS, Math.max(MIN_FAST_TRACK_SECONDS, currentSec)));
  const [note, setNote] = useState('');
  const [relight, setRelight] = useState('');
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
    <Section title="New take · Relight">
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
            <input type="range" min={MIN_FAST_TRACK_SECONDS} max={MAX_FAST_TRACK_SECONDS} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="mt-2 w-full accent-[#d9c08a]" />
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
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5">
            <LightingPicker label="Relight" noneLabel="Keep the original light" value={relight} onChange={setRelight} compact />
            {relight ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-[#9aa3ad]">
                Shots that open on an image start from that image&apos;s light, so the change is strongest after the first moment.
              </p>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-[#9aa3ad]">
            Same prompt, references and starting frame as the original, so it still fits the shots around it.
            Seedance shots can run up to {MAX_FAST_TRACK_SECONDS}s; Kling shots stop at 15s.
            Uses {fastTrackUnitsForDuration(seconds)} {fastTrackUnitsForDuration(seconds) === 1 ? 'generation' : 'generations'} from your allowance.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirming(false)} className="flex-1 rounded-xl border border-line py-2.5 text-sm text-[#d6d0c0] hover:bg-white/5">Cancel</button>
            <button
              onClick={() => {
                setConfirming(false);
                void onRegenerate(clip.id, { durationSec: seconds !== currentSec ? seconds : undefined, note: note.trim() || undefined, lighting: relight || undefined });
                setNote('');
                setRelight('');
              }}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] py-2.5 text-sm font-semibold text-[#1a160e]"
            >
              <RefreshCw size={15} /> {relight ? `Relight as ${findLightingPreset(relight)?.name}` : 'Make new take'}
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

/** Things to check on this shot: a shorter new take, or a newer version waiting in the storyboard. */
function ReviewFlags({ clip, locked }: { clip: TimelineClip; locked: boolean }) {
  const { clips, updateClip, commitClips, storyboardUpdates, setStoryboardUpdates } = useTimelineStore();
  const note = (clip.metadata as { review_note?: unknown } | null)?.review_note;
  const update = storyboardUpdates[clip.id];
  const forget = () => {
    const rest = { ...storyboardUpdates };
    delete rest[clip.id];
    setStoryboardUpdates(rest);
  };
  if (typeof note !== 'string' && !update) return null;
  return (
    <div className="space-y-2">
      {typeof note === 'string' && (
        <div className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-3.5 py-3 text-sm text-amber-50">
          <p>{note}</p>
          <button
            onClick={() => {
              const meta = { ...((clip.metadata as Record<string, unknown>) || {}) };
              delete meta.review_note;
              updateClip(clip.id, { metadata: meta }, `review-note:${clip.id}`);
            }}
            disabled={locked}
            className="mt-2 rounded-lg border border-amber-200/40 px-2.5 py-1 text-xs hover:bg-amber-400/10 disabled:opacity-40"
          >
            Checked it
          </button>
        </div>
      )}
      {update && (
        <div className="rounded-xl border border-gold-400/40 bg-gold-500/10 px-3.5 py-3 text-sm text-gold-50">
          <p>Your storyboard has a newer version of this shot.</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                const swapped = applyTake(clip, { url: update.url, source_duration_ms: update.duration_ms, created_at: new Date().toISOString() }, { keepLength: true });
                const shots = rippleFrom(clips.filter((c) => c.track_id === clip.track_id).map((c) => (c.id === clip.id ? swapped : c)));
                commitClips([...clips.filter((c) => c.track_id !== clip.track_id), ...shots], `storyboard-update:${clip.id}:${update.url}`);
                forget();
              }}
              disabled={locked}
              className="rounded-lg bg-gold-200 px-3 py-1.5 text-xs font-semibold text-[#1a160e] disabled:opacity-40"
            >
              Use the new version
            </button>
            <button
              onClick={() => {
                updateClip(clip.id, { metadata: { ...((clip.metadata as Record<string, unknown>) || {}), ignored_storyboard_url: update.url } }, `ignore-update:${clip.id}`);
                forget();
              }}
              disabled={locked}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#e8e2d2] hover:bg-white/5 disabled:opacity-40"
            >
              Keep this one
            </button>
          </div>
          {locked && <p className="mt-2 text-xs text-[#b0b8c4]">Unlock the shot to change it.</p>}
        </div>
      )}
    </div>
  );
}

/** Approve and lock a shot so nothing changes it by accident, or unlock it to edit again. */
function LockToggle({ clip, rowLocked }: { clip: TimelineClip; rowLocked: boolean }) {
  const toggleClipLock = useTimelineStore((s) => s.toggleClipLock);
  const on = isClipLocked(clip);
  return (
    <button
      onClick={() => toggleClipLock(clip.id)}
      disabled={rowLocked}
      aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:opacity-40 ${
        on ? 'border-gold-300/70 bg-gold-500/10' : 'border-line bg-white/[0.02] hover:border-white/25'
      }`}
    >
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${on ? 'bg-gold-300 text-[#1a160e]' : 'bg-white/[0.06] text-[#d6d0c0]'}`}>
        {on ? <Lock size={15} /> : <Unlock size={15} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-white">{on ? 'Approved and locked' : 'Approve and lock this shot'}</span>
        <span className="block text-xs text-[#9aa3ad]">{on ? 'Nothing can change it, not even the AI. Tap to unlock.' : 'Keeps it exactly as it is while you or the AI edit the rest.'}</span>
      </span>
    </button>
  );
}

/** Pro: type a shot's length to the tenth of a second; it stops where the footage runs out. */
function ExactLength({ clip, locked }: { clip: TimelineClip; locked: boolean }) {
  const { clips, commitClips } = useTimelineStore();
  const seconds = (clip.end_ms - clip.start_ms) / 1000;
  const [draft, setDraft] = useState<string | null>(null);
  const apply = () => {
    const value = Number(draft);
    setDraft(null);
    if (!Number.isFinite(value) || value <= 0) return;
    commitClips(trimClip(clips, clip.id, 'end', Math.round(value * 1000) - (clip.end_ms - clip.start_ms)), `exact-length:${clip.id}:${value}`);
  };
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-2.5">
      <span className="text-sm text-[#d6d0c0]">Exact length</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          min={0.3}
          step={0.1}
          disabled={locked}
          value={draft ?? seconds.toFixed(1)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-20 rounded-lg border border-line bg-obsidian-800/80 px-2 py-1 text-right font-mono text-sm tabular-nums text-white focus:border-gold-400/50 focus:outline-none"
        />
        <span className="text-sm text-[#9aa3ad]">s</span>
      </span>
    </label>
  );
}

function ShotHeader({ clip, position, count, duration }: { clip: TimelineClip; position: number; count: number; duration: number }) {
  const strip = useFilmstrip(clip.asset_url);
  const subject = String((clip.metadata as { shot?: { subject?: unknown } } | null)?.shot?.subject ?? '').trim();
  return (
    <div className="flex items-center gap-3">
      <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-[linear-gradient(135deg,rgba(217,192,138,0.28),rgba(138,108,62,0.16))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {strip?.frames[0] && <img src={strip.frames[Math.floor(strip.frames.length / 3)]} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-white">{subject || `Shot ${position + 1}`}</p>
        <p className="text-sm tabular-nums text-[#b0b8c4]">
          {subject ? `Shot ${position + 1} of ${count} · ` : `of ${count} · `}{formatClock(duration, true)} long
        </p>
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

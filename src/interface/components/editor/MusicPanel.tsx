'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { useWaveform } from '@/interface/lib/media-thumbs';
import type { TimelineClip } from '@/core/types/timeline';
import { formatTime } from './labels';
import { MusicGlyph } from './glyphs';

export const MUSIC_ACCEPT = '.mp3,.m4a,.aac,.wav,.ogg,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg';
export const MAX_MUSIC_MB = 40;

/** The song itself: its real waveform, with the beats it found marked in gold. */
function SongWave({ song }: { song: TimelineClip }) {
  const wave = useWaveform(song.asset_url);
  const canvas = useRef<HTMLCanvasElement>(null);
  const beats = (song.metadata as { beats?: unknown })?.beats;

  useEffect(() => {
    const el = canvas.current;
    if (!el || !wave) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth || 300;
    const h = el.clientHeight || 64;
    el.width = w * dpr;
    el.height = h * dpr;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const startSec = song.trim_start_ms / 1000;
    const spanSec = Math.max(0.5, (song.end_ms - song.start_ms) / 1000);
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(182,221,211,0.9)');
    gradient.addColorStop(1, 'rgba(182,221,211,0.45)');
    ctx.fillStyle = gradient;
    for (let px = 0; px < w; px += 3) {
      const v = wave.peaks[Math.floor((startSec + (px / w) * spanSec) * wave.perSec)] ?? 0;
      const bar = Math.max(1.5, v * (h - 10));
      ctx.fillRect(px, (h - bar) / 2, 2, bar);
    }
    ctx.fillStyle = '#e3cf9f';
    for (const b of Array.isArray(beats) ? beats : []) {
      if (typeof b !== 'number') continue;
      const x = ((b - startSec) / spanSec) * w;
      if (x >= 0 && x <= w) ctx.fillRect(x - 0.75, h - 4, 1.5, 4);
    }
  }, [wave, beats, song.trim_start_ms, song.start_ms, song.end_ms]);

  return <canvas ref={canvas} className="h-16 w-full" aria-hidden />;
}

/** Cuts landing on the beat: clips whose edges line up with gold beat marks. */
function BeatArt() {
  return (
    <svg viewBox="0 0 120 30" className="h-7 w-full" aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={6 + i * 15} y="25" width="1.6" height="5" rx="0.8" fill="#e3cf9f" />)}
      <rect x="6.8" y="5" width="29" height="15" rx="3" fill="rgba(227,207,159,0.18)" stroke="rgba(227,207,159,0.5)" />
      <rect x="36.8" y="5" width="44" height="15" rx="3" fill="rgba(227,207,159,0.12)" stroke="rgba(227,207,159,0.4)" />
      <rect x="81.8" y="5" width="29" height="15" rx="3" fill="rgba(227,207,159,0.18)" stroke="rgba(227,207,159,0.5)" />
    </svg>
  );
}

export function MusicPanel({ onUpload, onSyncToBeat }: { onUpload: (file: File) => Promise<string | null>; onSyncToBeat: () => void }) {
  const { clips, tracks, selectClip } = useTimelineStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const musicTrack = tracks.find((t) => t.track_type === 'audio');
  const song = clips.find((c) => c.track_id === musicTrack?.id);
  const meta = (song?.metadata || {}) as { name?: string; bpm?: number };

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_MUSIC_MB * 1024 * 1024) {
      setError(`Songs must be under ${MAX_MUSIC_MB} MB.`);
      return;
    }
    setBusy(true);
    const problem = await onUpload(file);
    setBusy(false);
    if (problem) setError(problem);
  }

  const drop = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragging(false); void choose(e.dataTransfer.files?.[0]); },
  };

  return (
    <div className="space-y-5 p-4">
      <input ref={input} type="file" accept={MUSIC_ACCEPT} className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />

      {song ? (
        <>
          <button onClick={() => selectClip(song.id)} className="block w-full overflow-hidden rounded-2xl border border-[#b6ddd3]/20 bg-[linear-gradient(160deg,rgba(182,221,211,0.1),rgba(0,0,0,0.2))] text-left transition-colors hover:border-[#b6ddd3]/40">
            <div className="flex items-center gap-3 px-3.5 pt-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#b6ddd3]/15 text-[#b6ddd3]"><MusicGlyph size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-white">{meta.name || 'Music'}</span>
                <span className="block text-[12.5px] text-[#9aa3ad]">{formatTime(song.end_ms - song.start_ms)} in your video</span>
              </span>
              {meta.bpm ? (
                <span className="text-right">
                  <span className="block font-mono text-[20px] leading-none tabular-nums text-gold-100">{Math.round(meta.bpm)}</span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[#7d858f]">BPM</span>
                </span>
              ) : null}
            </div>
            <div className="px-3.5 pb-3 pt-2"><SongWave song={song} /></div>
          </button>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5">
            <BeatArt />
            <p className="mt-2 text-[13px] text-[#cfc9b9]">Every cut moves to the nearest beat. Undo anytime.</p>
            <button onClick={onSyncToBeat} disabled={!meta.bpm} className="ed-gold mt-3 h-10 w-full rounded-xl text-sm font-semibold disabled:opacity-40">
              Cut my shots to the beat
            </button>
          </div>
        </>
      ) : null}

      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        {...drop}
        className={`group relative block w-full overflow-hidden rounded-2xl border border-dashed px-4 text-center transition-colors disabled:opacity-60 ${
          song ? 'py-4' : 'py-8'
        } ${dragging ? 'border-gold-300 bg-gold-500/10' : 'border-gold-400/35 hover:border-gold-300/60 hover:bg-gold-500/[0.06]'}`}
      >
        {!song && (
          <svg viewBox="0 0 160 48" className="mx-auto mb-3 h-12 w-40" aria-hidden>
            <g className="ed-rhythm" fill="rgba(182,221,211,0.75)">
              {Array.from({ length: 23 }, (_, i) => {
                const h = 8 + Math.abs(Math.sin(i * 1.7)) * 30;
                return <rect key={i} x={4 + i * 6.8} y={24 - h / 2} width="3" height={h} rx="1.5" style={{ animationDelay: `${(i % 6) * 0.12}s`, transformOrigin: `${5.5 + i * 6.8}px 24px` }} />;
              })}
            </g>
            {[2, 7, 12, 17, 22].map((i) => <circle key={i} cx={5.5 + i * 6.8} cy="46" r="1.6" fill="#e3cf9f" />)}
          </svg>
        )}
        <span className="flex items-center justify-center gap-2 text-sm font-medium text-gold-100">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {busy ? 'Finding the beat…' : song ? 'Use a different song' : 'Add a song'}
        </span>
        {!song && <span className="mt-1 block text-[12.5px] text-[#9aa3ad]">Drop a file here. We find its beat so cuts can land on it.</span>}
      </button>
      <p className="text-xs text-[#7d858f]">MP3, M4A, WAV or OGG up to {MAX_MUSIC_MB} MB. Only use music you have the rights to.</p>
      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
    </div>
  );
}

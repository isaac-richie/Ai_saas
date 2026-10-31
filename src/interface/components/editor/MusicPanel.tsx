'use client';

import { useRef, useState } from 'react';
import { AudioWaveform, Loader2, Upload } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { formatTime } from './labels';

export const MUSIC_ACCEPT = '.mp3,.m4a,.aac,.wav,.ogg,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg';
export const MAX_MUSIC_MB = 40;

export function MusicPanel({ onUpload, onSyncToBeat }: { onUpload: (file: File) => Promise<string | null>; onSyncToBeat: () => void }) {
  const { clips, tracks, selectClip } = useTimelineStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className="space-y-5 p-4">
      {song ? (
        <button onClick={() => selectClip(song.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white/[0.02] p-3 text-left hover:border-white/20">
          <span className="grid size-11 place-items-center rounded-xl bg-[#b6ddd3]/15 text-[#b6ddd3]"><AudioWaveform size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-white">{meta.name || 'Music'}</span>
            <span className="block text-sm text-[#b0b8c4]">
              {meta.bpm ? `${Math.round(meta.bpm)} beats per minute · ` : ''}{formatTime(song.end_ms - song.start_ms)}
            </span>
          </span>
        </button>
      ) : (
        <p className="text-sm leading-relaxed text-[#b0b8c4]">Add a song and VisioWave finds its beat, so your cuts can land right on it.</p>
      )}

      {song && (
        <button
          onClick={onSyncToBeat}
          disabled={!meta.bpm}
          className="w-full rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] px-4 py-3 text-sm font-semibold text-[#1a160e] disabled:opacity-40"
        >
          Cut my shots to the beat
        </button>
      )}

      <input ref={input} type="file" accept={MUSIC_ACCEPT} className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gold-400/40 px-4 py-4 text-sm text-gold-100 hover:bg-gold-500/10 disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        {busy ? 'Finding the beat…' : song ? 'Use a different song' : 'Add a song'}
      </button>
      <p className="text-xs text-[#9aa3ad]">MP3, M4A, WAV or OGG up to {MAX_MUSIC_MB} MB. Only use music you have the rights to.</p>
      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
    </div>
  );
}

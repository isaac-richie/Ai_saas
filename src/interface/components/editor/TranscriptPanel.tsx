'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, Loader2, Scissors, Search, X } from '@/interface/components/ui/icons';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import {
  cutWords,
  isFiller,
  restoreWords,
  transcriptView,
  type SourceTranscript,
  type TranscriptItem,
} from '@/core/services/transcript';
import { formatClock } from './labels';

type WordItem = Extract<TranscriptItem, { kind: 'word' }>;
type Shot = { head: Extract<TranscriptItem, { kind: 'shot' }>; items: TranscriptItem[] };
const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

export interface TranscriptPanelProps {
  transcripts: SourceTranscript[];
  /** False when the database update for transcripts hasn't been run. */
  ready: boolean;
  onTranscribe: (redo: boolean) => Promise<string | null>;
  onCorrect: (sourceKey: string, wordId: string, text: string) => Promise<string | null>;
  onCaptions: () => Promise<string | null>;
}

/**
 * Edit the video by editing its words (spec 4). Click a word to jump there; pick words and cut
 * them to take that footage out. Fixing spelling changes the text and captions only.
 */
export function TranscriptPanel({ transcripts, ready, onTranscribe, onCorrect, onCaptions }: TranscriptPanelProps) {
  const { clips, tracks, commitClips, setPlayhead } = useTimelineStore();
  const videoTrack = tracks.find((t) => t.track_type === 'video');
  const shots = useMemo(() => clips.filter((c) => c.track_id === videoTrack?.id), [clips, videoTrack?.id]);
  const items = useMemo(() => transcriptView(shots, transcripts), [shots, transcripts]);
  const words = useMemo(() => items.filter((i): i is WordItem => i.kind === 'word'), [items]);
  const order = useMemo(() => new Map(words.map((w, i) => [w.key, i])), [words]);
  const groups = useMemo(() => {
    const out: Shot[] = [];
    for (const item of items) {
      if (item.kind === 'shot') out.push({ head: item, items: [] });
      else out[out.length - 1]?.items.push(item);
    }
    return out;
  }, [items]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  const [busy, setBusy] = useState<'transcribe' | 'redo' | 'captions' | 'fix' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const cuts = useRef(0);
  const body = useRef<HTMLDivElement>(null);

  // Only the word under the playhead re-renders as the video plays.
  const activeKey = useTimelineStore((s) => {
    const at = s.playhead_ms;
    let lo = 0;
    let hi = words.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (words[m].endMs <= at) lo = m + 1;
      else if (words[m].atMs > at) hi = m - 1;
      else return words[m].key;
    }
    return null;
  });

  const live = selectedKeys(selected, order);
  const missing = groups.filter((g) => g.head.state === 'missing').length;
  const fillers = words.filter((w) => isFiller(w.word.text));
  const unsure = words.filter((w) => w.word.low);
  const q = plain(query);
  const matches = q ? words.filter((w) => plain(w.word.text).includes(q)) : [];
  const matchSet = new Set(matches.map((m) => m.key));
  const language = transcripts.find((t) => t.language)?.language;
  const lockedTracks = new Set(tracks.filter((t) => t.locked).map((t) => t.id));

  const say = (problem: string | null, ok: string) => setMessage(problem ? { tone: 'error', text: problem } : { tone: 'ok', text: ok });

  const pick = (item: WordItem, e: MouseEvent) => {
    setMessage(null);
    if (e.shiftKey && anchor.current && order.has(anchor.current)) {
      const [a, b] = [order.get(anchor.current)!, order.get(item.key)!].sort((x, y) => x - y);
      setSelected(new Set(words.slice(a, b + 1).map((w) => w.key)));
      return;
    }
    anchor.current = item.key;
    if (e.metaKey || e.ctrlKey) {
      setSelected((s) => { const next = new Set(s); if (next.has(item.key)) next.delete(item.key); else next.add(item.key); return next; });
    } else {
      setSelected(new Set([item.key]));
    }
    setPlayhead(item.atMs);
  };

  const selectAll = (list: WordItem[]) => {
    setSelected(new Set(list.map((w) => w.key)));
    anchor.current = list[0]?.key ?? null;
    if (list[0]) {
      setPlayhead(list[0].atMs);
      body.current?.querySelector(`[data-key="${CSS.escape(list[0].key)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  const cut = () => {
    if (!videoTrack || !live.length) return;
    const res = cutWords(clips, videoTrack.id, transcripts, live, { lockedTracks });
    if ('error' in res) return setMessage({ tone: 'error', text: res.error });
    commitClips(res.clips, `transcript-cut:${++cuts.current}`);
    setSelected(new Set());
    setMessage({ tone: 'ok', text: `Cut ${live.length} word${live.length === 1 ? '' : 's'}. Click the struck-through text, or undo, to bring ${live.length === 1 ? 'it' : 'them'} back.` });
  };

  const restore = (item: Extract<TranscriptItem, { kind: 'removed' }>) => {
    if (!videoTrack) return;
    const res = restoreWords(clips, videoTrack.id, transcripts, item.clipId, item.edge, { lockedTracks });
    if ('error' in res) return setMessage({ tone: 'error', text: res.error });
    commitClips(res.clips, `transcript-restore:${++cuts.current}`);
    setMessage({ tone: 'ok', text: 'Brought back.' });
  };

  const saveFix = async () => {
    if (!editing) return;
    const item = words.find((w) => w.key === editing.key);
    if (!item || editing.text.trim() === item.word.text) return setEditing(null);
    setBusy('fix');
    const problem = await onCorrect(item.sourceKey, item.word.id, editing.text);
    setBusy(null);
    if (!problem) setEditing(null);
    say(problem, 'Spelling fixed. Use Update captions to show it on screen.');
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    // Kept inside the panel, so Delete here never removes the selected shot on the timeline.
    if ((e.key === 'Delete' || e.key === 'Backspace') && live.length) { e.preventDefault(); e.stopPropagation(); cut(); }
    else if (e.key === 'Escape' && live.length) { e.stopPropagation(); setSelected(new Set()); }
  };

  const run = async (kind: 'transcribe' | 'redo') => {
    setBusy(kind);
    setMessage(null);
    const problem = await onTranscribe(kind === 'redo');
    setBusy(null);
    if (problem) say(problem, '');
  };

  if (!ready) {
    return <p className="m-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-[13px] text-amber-50">Transcripts need the latest database update (0056) before they can be saved.</p>;
  }

  if (!shots.length) {
    return <p className="p-4 text-[13px] leading-relaxed text-[#9aa3ad]">Add shots to the timeline, then their words show up here.</p>;
  }

  if (!transcripts.length) {
    return (
      <div className="space-y-3 p-4">
        <TranscriptArt />
        <p className="text-[14px] font-medium text-white">Edit by text</p>
        <p className="text-[12.5px] leading-relaxed text-[#9aa3ad]">
          VisioWave listens to each shot&apos;s own sound and writes it down, word by word. Click a word to jump there, select words and cut them to take that moment out of the video. Every cut can be brought back.
        </p>
        <button onClick={() => void run('transcribe')} disabled={busy !== null} className="ed-gold flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold disabled:opacity-50">
          {busy === 'transcribe' && <Loader2 size={16} className="animate-spin" />} {busy === 'transcribe' ? 'Listening to your shots…' : 'Transcribe the edit'}
        </button>
        {message && <Note message={message} />}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" onKeyDown={onKey}>
      <div className="space-y-2.5 border-b border-white/[0.06] p-3">
        <label className="flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 focus-within:border-gold-300/40">
          <Search size={14} className="shrink-0 text-[#7d858f]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a word" aria-label="Find a word in the transcript" className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-[#6f7781] focus:outline-none" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search" className="text-[#7d858f] hover:text-white"><X size={13} /></button>}
        </label>
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {q && <Chip onClick={() => selectAll(matches)} disabled={!matches.length}>{matches.length ? `Select ${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'No matches'}</Chip>}
          {!q && fillers.length > 0 && <Chip onClick={() => selectAll(fillers)} title="Suggested only. Check each one before cutting; some pauses carry meaning.">Select {fillers.length} filler{fillers.length === 1 ? '' : 's'} (um, uh)</Chip>}
          {!q && unsure.length > 0 && <Chip onClick={() => selectAll(unsure)} title="Words from lines the speech engine was unsure about, underlined with dots">Review {unsure.length} unsure</Chip>}
          {missing > 0 && <Chip onClick={() => void run('transcribe')} disabled={busy !== null}>{busy === 'transcribe' ? <Loader2 size={12} className="animate-spin" /> : null} Transcribe {missing} new shot{missing === 1 ? '' : 's'}</Chip>}
        </div>
      </div>

      <div ref={body} className="ed-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map(({ head, items: list }) => (
          <section key={head.clipId} aria-label={`Shot ${head.index + 1}`}>
            <button onClick={() => setPlayhead(head.atMs)} className="mb-1 flex items-center gap-2 text-[10.5px] uppercase tracking-[0.12em] text-[#7d858f] hover:text-[#cfc9b9]">
              <span>Shot {head.index + 1}</span>
              <span className="font-mono normal-case tracking-normal tabular-nums">{formatClock(head.atMs)}</span>
              {head.state === 'missing' && <span className="normal-case tracking-normal text-amber-200/80">not transcribed yet</span>}
              {head.state === 'silent' && <span className="normal-case tracking-normal">no speech</span>}
            </button>
            {list.length > 0 && (
              <p className="text-[14.5px] leading-[1.9] text-[#e8e2d2]">
                {list.map((item) => {
                  if (item.kind === 'removed') {
                    return (
                      <button key={item.key} onClick={() => restore(item)} title="Cut from the video. Click to bring it back." className="mx-0.5 rounded px-0.5 text-[#6f7781] line-through decoration-[#6f7781]/70 transition-colors hover:bg-white/[0.05] hover:text-[#b0b8c4]">
                        {item.words.length > 14 ? `${item.words.slice(0, 6).map((w) => w.text).join(' ')} … ${item.words.length - 6} more` : item.words.map((w) => w.text).join(' ')}
                      </button>
                    );
                  }
                  if (item.kind !== 'word') return null;
                  if (editing?.key === item.key) {
                    return (
                      <span key={item.key} className="inline-flex items-center gap-1 align-middle">
                        <input
                          autoFocus
                          onFocus={(e) => e.currentTarget.select()}
                          value={editing.text}
                          onChange={(e) => setEditing({ key: item.key, text: e.target.value })}
                          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void saveFix(); if (e.key === 'Escape') setEditing(null); }}
                          aria-label={`Correct the spelling of ${item.word.text}`}
                          maxLength={60}
                          className="h-7 w-28 rounded-md border border-gold-300/50 bg-black/40 px-1.5 text-[14px] text-white focus:outline-none"
                        />
                        <button onClick={() => void saveFix()} disabled={busy === 'fix'} aria-label="Save spelling" className="grid size-7 place-items-center rounded-md bg-gold-200 text-[#1a160e]">
                          {busy === 'fix' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
                        </button>
                      </span>
                    );
                  }
                  const on = selected.has(item.key);
                  return (
                    <span key={item.key}>
                      <button
                        data-key={item.key}
                        onClick={(e) => pick(item, e)}
                        onDoubleClick={() => setEditing({ key: item.key, text: item.word.text })}
                        title={item.word.fixed ? `Heard as “${item.word.heard}”` : item.word.low ? 'The speech engine was unsure here' : undefined}
                        className={`rounded px-[1px] transition-colors ${
                          on ? 'bg-gold-300/30 text-white' : activeKey === item.key ? 'bg-white/[0.12] text-white' : matchSet.has(item.key) ? 'bg-[#b6ddd3]/20' : 'hover:bg-white/[0.07]'
                        } ${item.word.low ? 'underline decoration-amber-200/60 decoration-dotted underline-offset-4' : ''} ${item.word.fixed ? 'text-gold-100' : ''}`}
                      >
                        {item.word.text}
                      </button>{' '}
                    </span>
                  );
                })}
              </p>
            )}
          </section>
        ))}

        <section className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[13px] text-white">Captions from this transcript</p>
          <p className="text-[12px] leading-relaxed text-[#9aa3ad]">Rebuilds the automatic captions from these words, with your cuts and spelling. Titles you typed stay.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={async () => { setBusy('captions'); const p = await onCaptions(); setBusy(null); say(p, 'Captions updated from the transcript.'); }} disabled={busy !== null}
              className="flex h-8 items-center gap-1.5 rounded-full border border-[#b6ddd3]/40 px-3 text-[12px] text-[#dff1ec] transition-colors hover:bg-[#b6ddd3]/10 disabled:opacity-40">
              {busy === 'captions' && <Loader2 size={13} className="animate-spin" />} Update captions
            </button>
            <button onClick={() => void run('redo')} disabled={busy !== null} className="flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[12px] text-[#9aa3ad] hover:text-white disabled:opacity-40">
              {busy === 'redo' && <Loader2 size={13} className="animate-spin" />} Transcribe again
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-[#6f7781]">
            {language ? `${language[0].toUpperCase()}${language.slice(1)} · ` : ''}Word timings are estimates, so check cuts by playing them. Speaker names aren&apos;t detected. Transcribing again replaces your spelling fixes.
          </p>
        </section>
      </div>

      {message && <div className="px-3 pb-2"><Note message={message} /></div>}
      {live.length > 0 ? (
        <div className="flex items-center gap-2 border-t border-white/[0.06] bg-black/30 p-2.5">
          <span className="min-w-0 flex-1 truncate pl-1 text-[12.5px] text-[#cfc9b9]">{live.length} word{live.length === 1 ? '' : 's'} selected</span>
          {live.length === 1 && (
            <button onClick={() => { const w = words.find((x) => x.key === live[0]); if (w) setEditing({ key: w.key, text: w.word.text }); }} className="h-8 rounded-full border border-white/15 px-3 text-[12px] text-[#e8e2d2] hover:bg-white/[0.06]">Fix spelling</button>
          )}
          <button onClick={cut} className="ed-gold flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold"><Scissors size={13} /> Cut</button>
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="grid size-8 place-items-center rounded-full text-[#9aa3ad] hover:bg-white/[0.06] hover:text-white"><X size={14} /></button>
        </div>
      ) : (
        <p className="border-t border-white/[0.06] px-3 py-2 text-[11px] text-[#6f7781]">Click a word to jump there · Shift-click to select a stretch · Double-click to fix spelling</p>
      )}
    </div>
  );
}

/** Selected words still in the edit, in playing order. */
function selectedKeys(selected: Set<string>, order: Map<string, number>): string[] {
  return [...selected].filter((k) => order.has(k)).sort((a, b) => order.get(a)! - order.get(b)!);
}

function Chip({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[#cfc9b9] transition-colors hover:border-gold-300/40 hover:text-gold-50 disabled:opacity-40">
      {children}
    </button>
  );
}

function Note({ message }: { message: { tone: 'error' | 'ok'; text: string } }) {
  if (!message.text) return null;
  return (
    <p role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-[12.5px] ${message.tone === 'error' ? 'border border-red-400/30 bg-red-500/10 text-red-100' : 'border border-[#b6ddd3]/30 bg-[#b6ddd3]/10 text-[#dff1ec]'}`}>
      {message.text}
    </p>
  );
}

/** Words on a strip of film, one picked out with scissors-marks. */
function TranscriptArt() {
  return (
    <svg viewBox="0 0 120 56" className="h-14 w-full" aria-hidden>
      <rect x="6" y="14" width="108" height="28" rx="6" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" />
      {[16, 30, 52, 66, 88].map((x, i) => (
        <rect key={x} x={x} y="25" width={[10, 18, 10, 18, 16][i]} height="6" rx="3" fill={i === 2 ? '#e3cf9f' : 'rgba(255,255,255,0.45)'} />
      ))}
      <path d="M50 18v20M64 18v20" stroke="#e3cf9f" strokeWidth="1.4" strokeDasharray="2 2.5" />
    </svg>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Loader2, MessageSquare, RotateCcw, Send } from 'lucide-react';
import { noteTime, type GuestShare, type ReviewNote, type ShareStatus } from '@/core/services/video-review';

const NAME_KEY = 'visiowave.review-name';

const STATUS: Record<ShareStatus, { label: string; tone: string }> = {
  in_review: { label: 'Waiting for review', tone: 'border-white/15 text-[#d6d0c0]' },
  approved: { label: 'Approved', tone: 'border-[#8fd1b9]/50 bg-[#8fd1b9]/10 text-[#c8efe2]' },
  changes_requested: { label: 'Changes asked for', tone: 'border-amber-300/50 bg-amber-400/10 text-amber-100' },
};

const gold =
  'bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[#1a160e] shadow-[0_10px_30px_-12px_rgba(217,192,138,0.8)]';

/** The page a client or teammate opens from a review link: watch, pin notes to moments, approve. */
export function ReviewClient({ token, initial }: { token: string; initial: GuestShare }) {
  const [share, setShare] = useState(initial);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(initial.duration_ms / 1000);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [changes, setChanges] = useState('');
  const [pin, setPin] = useState(true);
  const [pinnedAt, setPinnedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<'note' | 'approved' | 'changes_requested' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const trap = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NAME_KEY);
      if (saved) setName(saved);
    } catch {
      // Storage can be blocked; people just type their name again.
    }
  }, []);

  // New notes from others appear without a reload.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/review/${token}`, { cache: 'no-store' });
        if (res.ok) setShare(await res.json());
      } catch {
        // Offline for a moment; the next check catches up.
      }
    }, 15000);
    return () => clearInterval(id);
  }, [token]);

  const notes = useMemo(
    () =>
      [...share.notes].sort((a, b) => (a.at_ms ?? Number.MAX_SAFE_INTEGER) - (b.at_ms ?? Number.MAX_SAFE_INTEGER) || a.created_at.localeCompare(b.created_at)),
    [share.notes],
  );
  const pinned = notes.filter((n) => n.at_ms !== null);
  const seek = (ms: number | null) => {
    if (ms === null || !video.current) return;
    video.current.currentTime = ms / 1000;
    void video.current.play().catch(() => {});
  };

  async function send(kind: 'note' | 'approved' | 'changes_requested') {
    setError(null);
    const who = name.trim();
    if (!who) return setError('Add your name so the team knows who said it.');
    if (kind === 'note' && !body.trim()) return setError('Write a note first.');
    setBusy(kind);
    try {
      window.localStorage.setItem(NAME_KEY, who);
    } catch {
      // Not remembered this time.
    }
    const at = kind === 'note' && pin ? Math.round((pinnedAt ?? now) * 1000) : null;
    const text = kind === 'note' ? body : kind === 'changes_requested' ? changes : '';
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: who, body: text, kind, at_ms: at, website: trap.current?.value || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Your note could not be saved. Try again.');
      setShare((s) => ({ ...s, status: data.status ?? s.status, notes: data.note ? [...s.notes, data.note as ReviewNote] : s.notes }));
      if (kind === 'note') {
        setBody('');
        setPinnedAt(null);
      }
      if (kind === 'changes_requested') setChanges('');
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your note could not be saved. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const status = STATUS[share.status];

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(217,192,138,0.08),transparent_55%)]">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 md:px-8 md:pt-8">
        <header className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300/80">
            Visiowave <span className="lux-serif normal-case tracking-normal text-gold-200/90">Studios</span>
          </span>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          {/* Phones: the title takes its own line under the brand and status. */}
          <h1 className="order-last min-w-0 basis-full truncate text-xl font-light text-white sm:order-none sm:flex-1 sm:basis-auto md:text-2xl">{share.title}</h1>
          <span className={`ml-auto rounded-full border px-3 py-1 text-xs font-medium sm:ml-0 ${status.tone}`} aria-live="polite">{status.label}</span>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-line bg-black shadow-[0_40px_80px_-40px_rgba(0,0,0,1)]">
              <video
                ref={video}
                src={share.video_url}
                controls
                playsInline
                preload="metadata"
                // Any shape: widescreen fills the width, vertical keeps to a comfortable height.
                className="mx-auto max-h-[72vh] w-full bg-black object-contain"
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
              />
            </div>
            {pinned.length > 0 && duration > 0 && (
              <div className="relative h-6" aria-label="Notes along the video">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                {pinned.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => seek(n.at_ms)}
                    title={`${n.author_name} at ${noteTime(n.at_ms)}: ${n.body}`}
                    aria-label={`Go to ${n.author_name}'s note at ${noteTime(n.at_ms)}`}
                    className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-obsidian-950 transition-transform hover:scale-125 ${n.resolved ? 'bg-white/30' : 'bg-gold-300'}`}
                    style={{ left: `${Math.min(100, ((n.at_ms ?? 0) / 1000 / duration) * 100)}%` }}
                  />
                ))}
              </div>
            )}

            {share.allow_comments && (
              <div className="rounded-2xl border border-line bg-[#0c0d0c]/85 p-4">
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 60))}
                    placeholder="Your name"
                    aria-label="Your name"
                    autoComplete="name"
                    className="rounded-xl border border-line bg-obsidian-800/80 px-3 py-2.5 text-[15px] text-white placeholder:text-[#8f97a1] focus:border-gold-400/50 focus:outline-none sm:w-44"
                  />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value.slice(0, 1000))}
                    onFocus={() => {
                      // The note is about the moment on screen when they start typing.
                      video.current?.pause();
                      if (pinnedAt === null) setPinnedAt(video.current?.currentTime ?? now);
                    }}
                    rows={2}
                    placeholder="What should change? Notes are pinned to the moment you're watching."
                    aria-label="Your note"
                    className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-line bg-obsidian-800/80 px-3 py-2.5 text-[15px] text-white placeholder:text-[#8f97a1] focus:border-gold-400/50 focus:outline-none"
                  />
                </div>
                {/* Hidden from people; only bots fill it. */}
                <input ref={trap} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-[#b0b8c4]">
                    <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="accent-[#d9c08a]" />
                    <Clock size={14} /> At {noteTime(Math.round((pinnedAt ?? now) * 1000))}
                  </label>
                  <button
                    onClick={() => void send('note')}
                    disabled={busy !== null}
                    className={`ml-auto flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50 ${gold}`}
                  >
                    {busy === 'note' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Add note
                  </button>
                </div>
                {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            {share.allow_comments && (
              <div className="rounded-2xl border border-line bg-[#0c0d0c]/85 p-4">
                <p className="text-sm font-medium text-white">Your decision</p>
                <p className="mt-0.5 text-sm text-[#b0b8c4]">Tell the team if this is ready to go out.</p>
                {asking ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={changes}
                      onChange={(e) => setChanges(e.target.value.slice(0, 1000))}
                      rows={3}
                      autoFocus
                      placeholder="What needs to change? (optional)"
                      aria-label="What needs to change"
                      className="w-full resize-none rounded-xl border border-line bg-obsidian-800/80 px-3 py-2.5 text-[15px] text-white placeholder:text-[#8f97a1] focus:border-gold-400/50 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setAsking(false)} className="flex-1 rounded-xl border border-line py-2.5 text-sm text-[#d6d0c0] hover:bg-white/5">Cancel</button>
                      <button
                        onClick={() => void send('changes_requested')}
                        disabled={busy !== null}
                        className="flex flex-[2] items-center justify-center gap-2 rounded-xl border border-amber-300/50 bg-amber-400/10 py-2.5 text-sm font-medium text-amber-50 disabled:opacity-50"
                      >
                        {busy === 'changes_requested' && <Loader2 size={15} className="animate-spin" />} Send to the team
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => void send('approved')}
                      disabled={busy !== null}
                      className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${gold}`}
                    >
                      {busy === 'approved' ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />} Approve
                    </button>
                    <button
                      onClick={() => setAsking(true)}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line text-sm text-[#e8e2d2] hover:bg-white/5"
                    >
                      <RotateCcw size={15} /> Ask for changes
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-line bg-[#0c0d0c]/85">
              <p className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium text-white">
                <MessageSquare size={15} className="text-gold-300" /> Notes <span className="text-[#9aa3ad]">{notes.length}</span>
              </p>
              {notes.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[#9aa3ad]">No notes yet. Pause anywhere and add the first one.</p>
              ) : (
                <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
                  {notes.map((n) => (
                    <li key={n.id} className={`px-4 py-3 ${n.resolved ? 'opacity-55' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold-500/15 text-xs font-semibold text-gold-100">
                          {n.author_name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{n.author_name}</span>
                        {n.at_ms !== null && (
                          <button onClick={() => seek(n.at_ms)} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs tabular-nums text-gold-200 hover:bg-gold-500/15">
                            {noteTime(n.at_ms)}
                          </button>
                        )}
                      </div>
                      {n.kind !== 'note' && (
                        <p className={`mt-1.5 text-xs font-semibold ${n.kind === 'approved' ? 'text-[#a7e3cf]' : 'text-amber-200'}`}>
                          {n.kind === 'approved' ? 'Approved the video' : 'Asked for changes'}
                        </p>
                      )}
                      {n.body && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#e8e2d2]">{n.body}</p>}
                      {n.resolved && <p className="mt-1 text-xs text-[#9aa3ad]">Done</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="px-1 text-xs leading-relaxed text-[#8f97a1]">Anyone with this link can watch and leave notes. Made with VisioWave.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

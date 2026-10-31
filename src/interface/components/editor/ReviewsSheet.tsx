'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Link2Off, MessageSquare, X } from 'lucide-react';
import { noteTime, type ShareStatus } from '@/core/services/video-review';
import type { OwnerShare } from '@/core/actions/video-review';

const STATUS: Record<ShareStatus, { label: string; tone: string }> = {
  in_review: { label: 'Waiting for review', tone: 'border-white/15 text-[#d6d0c0]' },
  approved: { label: 'Approved', tone: 'border-[#8fd1b9]/50 bg-[#8fd1b9]/10 text-[#c8efe2]' },
  changes_requested: { label: 'Changes asked for', tone: 'border-amber-300/50 bg-amber-400/10 text-amber-100' },
};

export function reviewUrl(token: string) {
  return typeof window === 'undefined' ? `/v/${token}` : `${window.location.origin}/v/${token}`;
}

/** A review link with a copy button, as shown after sharing and in the notes panel. */
export function ShareLinkRow({ share }: { share: OwnerShare }) {
  const [copied, setCopied] = useState(false);
  const url = reviewUrl(share.token);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-obsidian-800/70 p-1.5 pl-3">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#d6d0c0]">{url.replace(/^https?:\/\//, '')}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the review page" className="grid size-8 place-items-center rounded-lg text-[#b0b8c4] hover:bg-white/5 hover:text-white">
        <ExternalLink size={14} />
      </a>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            window.prompt('Copy this link', url);
          }
        }}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-gold-200 px-3 text-xs font-semibold text-[#1a160e]"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

/** Every review link for this video, with its notes: jump to a note's moment, mark it done, or turn the link off. */
export function ReviewsSheet({ open, onClose, shares, onJump, onResolve, onTurnOff }: {
  open: boolean;
  onClose: () => void;
  shares: OwnerShare[];
  onJump: (atMs: number) => void;
  onResolve: (noteId: string, resolved: boolean) => void;
  onTurnOff: (shareId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label="Review notes"
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-white backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:w-[32rem]"
    >
      <div className="max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-line-strong bg-obsidian-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-[sheet-rise_0.28s_cubic-bezier(0.22,1,0.36,1)] sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300/80">Feedback</p>
            <h2 className="mt-1 text-xl font-light text-white">Review <span className="lux-serif text-gold-200">notes</span></h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-[#b0b8c4] hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {shares.length === 0 && (
          <p className="rounded-2xl border border-line bg-white/[0.02] px-4 py-6 text-center text-sm text-[#b0b8c4]">
            Make your video, then tap Share for review to send a link.
          </p>
        )}

        <div className="space-y-5">
          {shares.map((share) => {
            const status = STATUS[share.status];
            return (
              <section key={share.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
                  <span className="text-xs text-[#9aa3ad]">Shared {new Date(share.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  {confirmOff === share.id ? (
                    <span className="ml-auto flex items-center gap-1.5 text-xs">
                      <button onClick={() => setConfirmOff(null)} className="rounded-lg px-2 py-1 text-[#b0b8c4] hover:bg-white/5">Keep</button>
                      <button onClick={() => { onTurnOff(share.id); setConfirmOff(null); }} className="rounded-lg border border-red-400/40 px-2 py-1 text-red-100 hover:bg-red-500/10">Turn off</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmOff(share.id)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#9aa3ad] hover:bg-white/5 hover:text-white" title="Anyone with the link loses access">
                      <Link2Off size={13} /> Turn off link
                    </button>
                  )}
                </div>
                <ShareLinkRow share={share} />
                {share.notes.length === 0 ? (
                  <p className="flex items-center gap-2 px-1 text-sm text-[#9aa3ad]"><MessageSquare size={14} /> No notes yet.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-2xl border border-line">
                    {share.notes.map((n) => (
                      <li key={n.id} className={`flex gap-3 px-3.5 py-3 ${n.resolved ? 'opacity-55' : ''}`}>
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold-500/15 text-xs font-semibold text-gold-100">
                          {n.author_name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-white">{n.author_name}</span>
                            {n.at_ms !== null && (
                              <button onClick={() => { onJump(n.at_ms!); onClose(); }} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs tabular-nums text-gold-200 hover:bg-gold-500/15" title="Show this moment in the editor">
                                {noteTime(n.at_ms)}
                              </button>
                            )}
                          </div>
                          {n.kind !== 'note' && (
                            <p className={`mt-1 text-xs font-semibold ${n.kind === 'approved' ? 'text-[#a7e3cf]' : 'text-amber-200'}`}>
                              {n.kind === 'approved' ? 'Approved the video' : 'Asked for changes'}
                            </p>
                          )}
                          {n.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#e8e2d2]">{n.body}</p>}
                        </div>
                        {n.kind === 'note' && (
                          <button
                            onClick={() => onResolve(n.id, !n.resolved)}
                            aria-pressed={n.resolved}
                            title={n.resolved ? 'Mark as not done' : 'Mark as done'}
                            className={`grid size-8 shrink-0 place-items-center rounded-lg border ${n.resolved ? 'border-[#8fd1b9]/50 text-[#a7e3cf]' : 'border-line text-[#9aa3ad] hover:text-white'}`}
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}

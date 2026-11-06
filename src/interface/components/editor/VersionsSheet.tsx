'use client';

import { useEffect, useRef, useState } from 'react';
import { History, Loader2, RotateCcw, X } from 'lucide-react';
import type { RevisionSummary } from '@/core/actions/timeline-revisions';

/** Saved versions of the cut (one before every AI edit); any of them can be put back. */
export function VersionsSheet({ open, onClose, onList, onRestore }: {
  open: boolean;
  onClose: () => void;
  onList: () => Promise<RevisionSummary[]>;
  onRestore: (id: string) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<RevisionSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      void onList().then(setVersions);
    }
    if (!open && el.open) el.close();
  }, [open, onList]);

  return (
    <dialog
      ref={dialog}
      onClose={() => {
        setConfirm(null);
        setVersions(null);
        onClose();
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label="Versions"
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-white backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:w-[28rem]"
    >
      <div className="ed-glass ed-glass-lit max-h-[80dvh] overflow-y-auto rounded-t-3xl !bg-obsidian-900/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-[sheet-rise_0.28s_cubic-bezier(0.22,1,0.36,1)] sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300/80">History</p>
            <h2 className="mt-1 text-xl font-light text-white">Saved <span className="lux-serif text-gold-200">versions</span></h2>
            <p className="mt-1 text-sm text-[#b0b8c4]">A version is saved before every AI edit. Putting one back saves your current cut first.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-[#b0b8c4] hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {versions === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[#9aa3ad]"><Loader2 size={15} className="animate-spin" /> Loading…</p>
        ) : versions.length === 0 ? (
          <p className="rounded-2xl border border-line bg-white/[0.02] px-4 py-6 text-center text-sm text-[#9aa3ad]">
            <History size={16} className="mx-auto mb-2 text-gold-300" />
            No saved versions yet. One is saved each time the AI edits your video.
          </p>
        ) : (
          <ol className="relative space-y-1 pl-6 before:absolute before:bottom-3 before:left-[9px] before:top-3 before:w-px before:bg-[linear-gradient(180deg,rgba(227,207,159,0.6),rgba(227,207,159,0.08))]">
            {versions.map((v, i) => (
              <li key={v.id} className={`relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${confirm === v.id ? 'bg-gold-500/[0.08]' : 'hover:bg-white/[0.03]'}`}>
                <span aria-hidden className={`absolute -left-[19px] top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-4 ring-obsidian-900 ${i === 0 ? 'bg-gold-200 shadow-[0_0_8px_rgba(243,229,192,0.8)]' : 'bg-white/30'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{v.label}</p>
                  <p className="text-xs text-[#9aa3ad]" title={new Date(v.created_at).toLocaleString()}>
                    {timeAgo(v.created_at)}
                  </p>
                </div>
                {confirm === v.id ? (
                  <button
                    onClick={async () => {
                      setBusy(v.id);
                      const ok = await onRestore(v.id);
                      setBusy(null);
                      if (ok) onClose();
                    }}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 rounded-lg bg-gold-200 px-3 py-1.5 text-xs font-semibold text-[#1a160e] disabled:opacity-50"
                  >
                    {busy === v.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Put it back
                  </button>
                ) : (
                  <button onClick={() => setConfirm(v.id)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-[#e8e2d2] hover:bg-white/5">
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}

/** "Just now", "12 min ago", "3 h ago", then a date. */
function timeAgo(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return then.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

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
      <div className="max-h-[80dvh] overflow-y-auto rounded-t-3xl border border-line-strong bg-obsidian-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-[sheet-rise_0.28s_cubic-bezier(0.22,1,0.36,1)] sm:rounded-3xl sm:p-6">
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
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{v.label}</p>
                  <p className="text-xs text-[#9aa3ad]">
                    {new Date(v.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
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
          </ul>
        )}
      </div>
    </dialog>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Upload, X } from 'lucide-react';
import { listClipLibrary, type LibraryClip } from '@/core/actions/editor-hub';
import { TopLayer } from '@/interface/components/system/TopLayer';

/**
 * One place to add footage: videos from this device, or finished clips from any other film or
 * storyboard. Clips are added in the order they were ticked.
 */
export function AddClipsDialog({ projectId, busy, onClose, onUploadFromDevice, onAddClips }: {
  projectId: string;
  busy: boolean;
  onClose: () => void;
  onUploadFromDevice: () => void;
  onAddClips: (urls: string[]) => Promise<boolean>;
}) {
  const [clips, setClips] = useState<LibraryClip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [source, setSource] = useState<'all' | 'other' | 'this'>('other');

  useEffect(() => {
    let live = true;
    listClipLibrary().then((res) => {
      if (!live) return;
      if (res.data) setClips(res.data);
      else setError(res.error || 'Could not load your clips.');
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(() => (clips || []).filter((c) => source === 'all' || (source === 'this' ? c.projectId === projectId : c.projectId !== projectId)), [clips, source, projectId]);
  const toggle = (url: string) => setPicked((p) => (p.includes(url) ? p.filter((u) => u !== url) : [...p, url]));

  return (
    <TopLayer>
      <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add clips"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-line bg-[#0f110f] md:rounded-3xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-medium text-white">Add clips</h2>
              <p className="text-[13px] text-[#9aa3ad]">From your device, or from anything else you&apos;ve made.</p>
            </div>
            <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-[#b0b8c4] hover:bg-white/5 hover:text-white" aria-label="Close"><X size={18} /></button>
          </header>

          <div className="space-y-4 overflow-y-auto p-5">
            <button
              onClick={onUploadFromDevice}
              disabled={busy}
              className="flex w-full items-center gap-3 rounded-2xl border border-gold-400/40 bg-gold-500/5 p-4 text-left hover:bg-gold-500/10 disabled:opacity-50"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[#1a160e]">
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              </span>
              <span>
                <span className="block text-[15px] text-white">From my phone or computer</span>
                <span className="block text-[13px] text-[#b0b8c4]">MP4, MOV or WebM, up to 50 MB each</span>
              </span>
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#9aa3ad]">From my work</p>
              <div role="radiogroup" aria-label="Which clips" className="flex gap-1 rounded-xl border border-line p-1 text-xs">
                {([['other', 'Other projects'], ['this', 'This project'], ['all', 'All']] as const).map(([id, label]) => (
                  <button key={id} role="radio" aria-checked={source === id} onClick={() => setSource(id)} className={`rounded-lg px-2.5 py-1.5 ${source === id ? 'bg-white/10 text-white' : 'text-[#9aa3ad] hover:text-white'}`}>{label}</button>
                ))}
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-amber-200">{error}</p>
            ) : !clips ? (
              <div className="grid place-items-center py-10 text-[#9aa3ad]"><Loader2 className="animate-spin" /></div>
            ) : shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#9aa3ad]">No finished clips here yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {shown.map((clip) => {
                  const order = picked.indexOf(clip.url);
                  return (
                    <li key={clip.url} className="min-w-0">
                      <button
                        onClick={() => toggle(clip.url)}
                        aria-pressed={order >= 0}
                        className={`block w-full overflow-hidden rounded-2xl border text-left transition-colors ${order >= 0 ? 'border-gold-300/80' : 'border-line hover:border-white/25'}`}
                      >
                        <span className="relative block aspect-video bg-black/50">
                          <video src={`${clip.url}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" />
                          {order >= 0 && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-gold-200 text-xs font-semibold text-[#1a160e]">{order + 1}</span>}
                          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] tabular-nums text-white">{Math.round(clip.durationMs / 1000)}s</span>
                        </span>
                        <span className="block px-2.5 py-2">
                          <span className="block truncate text-[13px] text-white">{clip.title}</span>
                          <span className="block truncate text-[11px] text-[#9aa3ad]">{clip.source}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
            <span className="text-sm text-[#9aa3ad]">{picked.length ? `${picked.length} selected` : 'Tap clips to choose them'}</span>
            <button
              onClick={async () => { if (await onAddClips(picked)) onClose(); }}
              disabled={!picked.length || busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] px-4 py-2.5 text-sm font-semibold text-[#1a160e] disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Add {picked.length || ''} to the end
            </button>
          </footer>
        </div>
      </div>
    </TopLayer>
  );
}

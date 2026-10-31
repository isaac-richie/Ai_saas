'use client';

import { useState } from 'react';
import { Captions, Loader2, Plus } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';

export function TextPanel({ onAddText, onAutoCaptions, hasRender }: {
  onAddText: () => Promise<void>;
  onAutoCaptions: () => Promise<string | null>;
  hasRender: boolean;
}) {
  const { clips, tracks, selectClip } = useTimelineStore();
  const [busy, setBusy] = useState<'add' | 'auto' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const captionTrack = tracks.find((t) => t.track_type === 'caption');
  const captions = clips.filter((c) => c.track_id === captionTrack?.id).sort((a, b) => a.start_ms - b.start_ms);

  return (
    <div className="space-y-5 p-4">
      <button
        onClick={async () => { setBusy('add'); await onAddText(); setBusy(null); }}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] px-4 py-3 text-sm font-semibold text-[#1a160e] disabled:opacity-50"
      >
        {busy === 'add' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add text at the playhead
      </button>

      <div className="rounded-2xl border border-line bg-white/[0.02] p-3.5">
        <div className="flex items-start gap-3">
          <Captions size={18} className="mt-0.5 shrink-0 text-gold-300" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <p className="text-sm leading-relaxed text-[#d6d0c0]">
              Auto captions write down what&apos;s said in your video.{' '}
              {!hasRender && <span className="text-[#b0b8c4]">Make your video once first so there&apos;s sound to listen to.</span>}
            </p>
            <button
              onClick={async () => {
                setBusy('auto');
                setMessage(null);
                const problem = await onAutoCaptions();
                setBusy(null);
                setMessage(problem ? { tone: 'error', text: problem } : { tone: 'ok', text: 'Captions added. Tap one to change it.' });
              }}
              disabled={!hasRender || busy !== null}
              className="flex items-center gap-2 rounded-xl border border-gold-400/40 px-3.5 py-2 text-sm text-gold-100 hover:bg-gold-500/10 disabled:opacity-40"
            >
              {busy === 'auto' && <Loader2 size={14} className="animate-spin" />} {busy === 'auto' ? 'Listening…' : 'Create auto captions'}
            </button>
          </div>
        </div>
      </div>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-sm ${message.tone === 'error' ? 'border border-red-400/30 bg-red-500/10 text-red-100' : 'border border-[#b6ddd3]/30 bg-[#b6ddd3]/10 text-[#dff1ec]'}`}>
          {message.text}
        </p>
      )}

      {captions.length > 0 && (
        <ul className="space-y-1.5">
          {captions.slice(0, 50).map((c) => (
            <li key={c.id}>
              <button onClick={() => selectClip(c.id)} className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-[#e8e2d2] hover:bg-white/5">
                {String((c.metadata as { text?: string })?.text || 'Text')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

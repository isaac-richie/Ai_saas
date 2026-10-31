'use client';

import { useState } from 'react';
import { ArrowUp, Clapperboard, Eye, Loader2, Music2, Sparkles, Sun, Timer, Undo2 } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';

export type AgentReply = { ok: true; summary: string; applied: number; rejected: string[] } | { ok: false; error: string };
/** `undoAt` is the undo-history length right after the AI's edit; Undo is offered while nothing has happened since. */
type Message = { role: 'user' | 'agent'; text: string; tone?: 'error' | 'warning'; undoAt?: number };

const SUGGESTIONS = [
  { text: 'Make it feel like a movie trailer', icon: Clapperboard },
  { text: 'Cut it to the beat of the music', icon: Music2 },
  { text: 'Give it a warm golden-hour look', icon: Sun },
  { text: 'Tighten it up for a 15-second short', icon: Timer },
  { text: 'Open on the widest shot and end on a close-up', icon: Eye },
];

export function AgentPanel({ onSend }: { onSend: (instruction: string) => Promise<AgentReply> }) {
  const historyLength = useTimelineStore((s) => s.history.past.length);
  const undo = useTimelineStore((s) => s.undo);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const instruction = text.trim();
    if (!instruction || busy) return;
    setDraft('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: instruction }]);
    const reply = await onSend(instruction);
    setBusy(false);
    if (!reply.ok) {
      setMessages((m) => [...m, { role: 'agent', text: reply.error, tone: 'error' }]);
      return;
    }
    const undoAt = reply.applied > 0 ? useTimelineStore.getState().history.past.length : undefined;
    const next: Message[] = [{ role: 'agent', text: reply.summary || 'Done.', undoAt }];
    if (reply.rejected.length) next.push({ role: 'agent', text: `I skipped: ${reply.rejected.join('; ')}`, tone: 'warning' });
    setMessages((m) => [...m, ...next]);
  }

  return (
    <div className="flex h-full min-h-[18rem] flex-col">
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-gold-400/20 bg-[linear-gradient(160deg,rgba(217,192,138,0.12),transparent_70%)] p-4">
              <span className="grid size-9 place-items-center rounded-full bg-gold-500/20 text-gold-200">
                <Sparkles size={16} />
              </span>
              <p className="mt-3 text-[15px] font-medium text-white">Your AI editor</p>
              <p className="mt-1 text-sm leading-relaxed text-[#d6d0c0]">
                I can see your shots. Say how the video should feel, or point at a shot by what&apos;s in it. I&apos;ll trim, reorder, colour and time them, and you can undo anything.
              </p>
            </div>
            <p className="px-1 pt-1 text-xs font-medium uppercase tracking-[0.14em] text-[#9aa3ad]">Try</p>
            <div className="grid gap-2">
              {SUGGESTIONS.map(({ text, icon: Icon }) => (
                <button
                  key={text}
                  onClick={() => send(text)}
                  disabled={busy}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-3 text-left text-sm text-[#e8e2d2] transition-colors hover:border-gold-400/40 hover:bg-gold-500/10 disabled:opacity-50"
                >
                  <Icon size={16} className="shrink-0 text-gold-300" />
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'ml-auto rounded-br-md bg-gold-500/20 text-gold-50'
                : m.tone === 'error'
                  ? 'rounded-bl-md border border-red-400/30 bg-red-500/10 text-red-100'
                  : m.tone === 'warning'
                    ? 'rounded-bl-md border border-amber-400/30 bg-amber-500/10 text-amber-50'
                    : 'rounded-bl-md bg-white/[0.06] text-[#ece7da]'
            }`}
          >
            {m.text}
            {m.undoAt !== undefined && m.undoAt === historyLength && (
              <button onClick={undo} className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-[#e8e2d2] hover:bg-white/5">
                <Undo2 size={13} /> Undo this edit
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-2.5 text-sm text-[#b0b8c4]">
            <Loader2 size={14} className="animate-spin" /> Editing your video…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-obsidian-800/80 p-1.5 focus-within:border-gold-400/50">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            placeholder="Describe your edit…"
            aria-label="Describe your edit"
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-white placeholder:text-[#8f97a1] focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[#1a160e] transition-opacity disabled:opacity-35"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}

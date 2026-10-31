'use client';

import { useState } from 'react';
import { ArrowUp, Check, Eye, History, Loader2, Music2, RefreshCw, Sparkles, Sun, Timer, Undo2, Wand2 } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { AUTO_EDIT_STYLES, type AutoEditStyle } from '@/core/services/auto-edit';

export type NewShotNeed = { clip_id: string | null; position: number | null; what: string };
export type AgentReply =
  | { ok: true; summary: string; applied: number; rejected: string[]; changes?: string[]; revisionId?: string | null; newShots?: NewShotNeed[] }
  | { ok: false; error: string };
/**
 * `undoAt` is the undo-history length right after the AI's edit: Keep / Undo are offered while
 * nothing has happened since. After that, the saved version (`revisionId`) can still be restored.
 */
type Message = {
  role: 'user' | 'agent';
  text: string;
  tone?: 'error' | 'warning';
  undoAt?: number;
  changes?: string[];
  revisionId?: string | null;
  reviewed?: 'kept' | 'undone' | 'restored';
  newShots?: NewShotNeed[];
  started?: string[];
};

const SUGGESTIONS = [
  { text: 'Cut it to the beat of the music', icon: Music2 },
  { text: 'Give it a warm golden-hour look', icon: Sun },
  { text: 'Tighten it up for a 15-second short', icon: Timer },
  { text: 'Open on the widest shot and end on a close-up', icon: Eye },
];

export function AgentPanel({ onSend, onAutoEdit, onNewTake, onRestoreVersion, hasShots = true }: {
  onSend: (instruction: string) => Promise<AgentReply>;
  onAutoEdit?: (style: AutoEditStyle, options: { title: boolean }) => Promise<AgentReply>;
  /** Starts a new take of a shot; only after the creator taps, since it costs a generation. */
  onNewTake?: (clipId: string, note: string) => void;
  onRestoreVersion?: (revisionId: string) => Promise<boolean>;
  hasShots?: boolean;
}) {
  const historyLength = useTimelineStore((s) => s.history.past.length);
  const undo = useTimelineStore((s) => s.undo);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const [style, setStyle] = useState<AutoEditStyle>('trailer');
  // No on-screen text unless the creator asks for it.
  const [withTitle, setWithTitle] = useState(false);

  const review = (index: number, outcome: NonNullable<Message['reviewed']>) =>
    setMessages((all) => all.map((m, k) => (k === index ? { ...m, reviewed: outcome } : m)));

  async function send(text: string, auto?: AutoEditStyle) {
    const instruction = text.trim();
    if (!instruction || busy) return;
    setDraft('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: instruction }]);
    const reply = auto && onAutoEdit ? await onAutoEdit(auto, { title: withTitle }) : await onSend(instruction);
    setBusy(false);
    if (!reply.ok) {
      setMessages((m) => [...m, { role: 'agent', text: reply.error, tone: 'error' }]);
      return;
    }
    const undoAt = reply.applied > 0 ? useTimelineStore.getState().history.past.length : undefined;
    const next: Message[] = [{
      role: 'agent',
      text: reply.summary || 'Done.',
      undoAt,
      changes: reply.applied > 0 ? reply.changes : undefined,
      revisionId: reply.revisionId,
      newShots: reply.newShots?.length ? reply.newShots : undefined,
    }];
    if (reply.rejected.length) next.push({ role: 'agent', text: `I skipped: ${reply.rejected.join('; ')}`, tone: 'warning' });
    setMessages((m) => [...m, ...next]);
  }

  return (
    <div className="flex h-full min-h-[18rem] flex-col">
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 px-1">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-500/20 text-gold-200">
                <Sparkles size={15} />
              </span>
              <p className="text-sm leading-relaxed text-[#d6d0c0]">
                <span className="font-medium text-white">Your AI editor can see your shots.</span> Let it cut the whole video, or ask for any change. You can undo anything.
              </p>
            </div>
            {onAutoEdit && (
              <div className="space-y-3 rounded-2xl border border-line bg-white/[0.02] p-4">
                <div>
                  <p className="text-[15px] font-medium text-white">Edit it for me</p>
                  <p className="mt-0.5 text-sm text-[#b0b8c4]">
                    {hasShots ? 'A complete first cut in one tap. Tweak anything after.' : 'Brings in your storyboard shots and cuts them in one tap.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Style">
                  {AUTO_EDIT_STYLES.map((s) => (
                    <button
                      key={s.id}
                      role="radio"
                      aria-checked={style === s.id}
                      onClick={() => setStyle(s.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        style === s.id ? 'border-gold-300/80 bg-gold-500/10' : 'border-line hover:border-white/25'
                      }`}
                    >
                      <span className="block text-sm text-white">{s.label}</span>
                      <span className="block text-xs leading-snug text-[#9aa3ad]">{s.hint}</span>
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-[#b0b8c4]">
                  <input type="checkbox" checked={withTitle} onChange={(e) => setWithTitle(e.target.checked)} className="accent-[#d9c08a]" />
                  Add the project name as an opening title
                </label>
                <button
                  onClick={() => send(`Edit it for me: ${AUTO_EDIT_STYLES.find((s) => s.id === style)!.label}`, style)}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] py-3 text-sm font-semibold text-[#1a160e] disabled:opacity-50"
                >
                  <Wand2 size={16} /> Edit it for me
                </button>
              </div>
            )}
            <p className="px-1 pt-1 text-xs font-medium uppercase tracking-[0.14em] text-[#9aa3ad]">Or ask for something</p>
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
            {m.changes && m.changes.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[13px] text-[#d6d0c0]">
                {m.changes.map((c, j) => (
                  <li key={j} className="flex gap-2"><span className="text-gold-300">·</span>{c}</li>
                ))}
                <li className="pt-1 text-xs text-[#9aa3ad]">Uses your existing footage. No new generation.</li>
              </ul>
            )}
            {m.undoAt !== undefined && !m.reviewed && m.undoAt === historyLength && (
              <div className="mt-2.5 flex gap-2">
                <button onClick={() => review(i, 'kept')} className="flex items-center gap-1.5 rounded-lg bg-gold-200 px-3 py-1.5 text-xs font-semibold text-[#1a160e]">
                  <Check size={13} /> Keep
                </button>
                <button
                  onClick={() => {
                    undo();
                    review(i, 'undone');
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#e8e2d2] hover:bg-white/5"
                >
                  <Undo2 size={13} /> Undo
                </button>
              </div>
            )}
            {m.undoAt !== undefined && !m.reviewed && m.undoAt !== historyLength && m.revisionId && onRestoreVersion && (
              <button
                onClick={async () => {
                  if (await onRestoreVersion(m.revisionId!)) review(i, 'restored');
                }}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-[#e8e2d2] hover:bg-white/5"
              >
                <History size={13} /> Go back to before this edit
              </button>
            )}
            {m.reviewed && (
              <p className="mt-2 text-xs text-[#9aa3ad]">
                {m.reviewed === 'kept' ? 'Kept.' : m.reviewed === 'undone' ? 'Undone.' : 'Restored the version from before this edit.'}
              </p>
            )}
            {m.newShots?.map((n, j) => (
              <div key={j} className="mt-2.5 rounded-xl border border-gold-400/30 bg-gold-500/10 p-3">
                <p className="text-[13px] text-gold-50">
                  {n.clip_id ? `This needs a new take of shot ${n.position}: ` : 'This needs a brand-new shot: '}
                  <span className="text-white">{n.what}</span>
                </p>
                {n.clip_id && onNewTake ? (
                  m.started?.includes(n.clip_id) ? (
                    <p className="mt-1.5 text-xs text-[#b0b8c4]">Making it now. It drops in when ready; the old take is kept.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-[#b0b8c4]">Uses one generation from your allowance. Nothing starts until you tap.</p>
                      <button
                        onClick={() => {
                          onNewTake(n.clip_id!, n.what);
                          setMessages((all) => all.map((x, k) => (k === i ? { ...x, started: [...(x.started || []), n.clip_id!] } : x)));
                        }}
                        className="mt-2 flex items-center gap-1.5 rounded-lg bg-gold-200 px-3 py-1.5 text-xs font-semibold text-[#1a160e]"
                      >
                        <RefreshCw size={13} /> Make new take
                      </button>
                    </>
                  )
                ) : (
                  <p className="mt-1 text-xs text-[#b0b8c4]">Add it to your storyboard and generate it, then bring it in with the + at the end of your shots.</p>
                )}
              </div>
            ))}
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

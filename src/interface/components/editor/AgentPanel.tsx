'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Check, Eye, History, Music2, RefreshCw, Sun, Timer, Undo2, Wand2 } from 'lucide-react';
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
  { text: 'Cut it to the beat of the music', short: 'Cut to the beat', icon: Music2 },
  { text: 'Give it a warm golden-hour look', short: 'Golden-hour look', icon: Sun },
  { text: 'Tighten it up for a 15-second short', short: '15-second short', icon: Timer },
  { text: 'Open on the widest shot and end on a close-up', short: 'Wide open, close end', icon: Eye },
];

// What the editor is doing while it works; the request runs these steps on the server.
const THINKING = ['Looking at your shots', 'Planning the cut', 'Applying the edit'];

// A tiny picture of each style's cutting rhythm: bar widths are shot lengths.
const RHYTHM: Record<AutoEditStyle, number[]> = {
  trailer: [5, 4, 3, 2.4, 1.8, 1.4, 1, 1, 6],
  story: [6, 6, 5, 6, 6],
  social: [2, 1.5, 1.5, 1.5, 1.5, 1.5, 2],
  music: [2.5, 2.5, 2.5, 2.5, 2.5, 2.5],
};

const enter = { initial: { opacity: 0, y: 10, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: 'spring', stiffness: 420, damping: 34 } } as const;

function Rhythm({ style, active }: { style: AutoEditStyle; active: boolean }) {
  const bars = RHYTHM[style];
  return (
    <span className={`flex h-5 items-end gap-[3px] ${active ? 'ed-rhythm' : ''}`} aria-hidden>
      {bars.map((w, i) => (
        <span
          key={i}
          className={`block rounded-[2px] transition-colors duration-300 ${active ? 'bg-gold-200' : 'bg-white/20'}`}
          style={{ width: w * 3.2, height: style === 'music' ? (i % 2 ? '60%' : '100%') : `${45 + ((i * 37) % 55)}%`, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

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
  const [step, setStep] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const [style, setStyle] = useState<AutoEditStyle>('trailer');
  // No on-screen text unless the creator asks for it.
  const [withTitle, setWithTitle] = useState(false);

  // While the AI works, walk through what it is doing.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setStep((s) => Math.min(THINKING.length - 1, s + 1)), 2600);
    return () => clearInterval(timer);
  }, [busy]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scroller.current;
    if (el && messages.length) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);

  // The box grows with what is typed, up to a few lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [draft]);

  const review = (index: number, outcome: NonNullable<Message['reviewed']>) =>
    setMessages((all) => all.map((m, k) => (k === index ? { ...m, reviewed: outcome } : m)));

  async function send(text: string, auto?: AutoEditStyle) {
    const instruction = text.trim();
    if (!instruction || busy) return;
    setDraft('');
    setStep(0);
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

  const empty = messages.length === 0;

  return (
    <div className="flex h-full min-h-[18rem] flex-1 flex-col">
      <div ref={scroller} className="ed-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {empty && (
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="space-y-4">
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="flex items-center gap-3.5 px-1 pt-1">
              <span className="relative grid size-11 shrink-0 place-items-center">
                <span className="absolute inset-0 rounded-full bg-gold-300/20 blur-xl" aria-hidden />
                <span className="ed-orb block size-9" aria-hidden />
              </span>
              <p className="text-[13.5px] leading-relaxed text-[#cfc9b9]">
                <span className="font-medium text-white">I can see every shot.</span> Let me cut the whole video, or ask for any change. Nothing is final; undo anything.
              </p>
            </motion.div>

            {onAutoEdit && (
              <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="relative overflow-hidden rounded-[20px] border border-gold-300/15 bg-[linear-gradient(160deg,rgba(227,207,159,0.09),rgba(255,255,255,0.015)_45%)] p-4">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <p className="text-[15px] font-medium text-white">Edit it for me</p>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-gold-300/80">One tap</span>
                </div>
                <p className="-mt-2 mb-3 text-[12.5px] text-[#9aa3ad]">
                  {hasShots ? 'A complete first cut. Tweak anything after.' : 'Brings in your storyboard shots and cuts them.'}
                </p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Style">
                  {AUTO_EDIT_STYLES.map((s) => {
                    const active = style === s.id;
                    return (
                      <button
                        key={s.id}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setStyle(s.id)}
                        className={`relative rounded-2xl border px-3 pb-2.5 pt-3 text-left transition-all duration-300 ${active ? 'border-transparent' : 'border-white/[0.07] bg-black/20 hover:border-white/20 hover:bg-white/[0.03]'}`}
                      >
                        {active && (
                          <motion.span
                            layoutId="style-active"
                            className="absolute inset-0 rounded-2xl border border-gold-300/70 bg-[linear-gradient(160deg,rgba(227,207,159,0.18),rgba(227,207,159,0.04))] shadow-[0_12px_30px_-16px_rgba(217,192,138,0.9)]"
                            transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                          />
                        )}
                        <span className="relative block">
                          <Rhythm style={s.id} active={active} />
                          <span className={`mt-2 block text-[13.5px] font-medium ${active ? 'text-gold-50' : 'text-white'}`}>{s.label}</span>
                          <span className="block text-[11.5px] leading-snug text-[#8f97a1]">{s.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl px-1 py-1 text-[12.5px] text-[#b0b8c4]">
                  Open with the project name as a title
                  <span className="relative inline-flex">
                    <input type="checkbox" checked={withTitle} onChange={(e) => setWithTitle(e.target.checked)} className="peer sr-only" />
                    <span className="h-5 w-9 rounded-full bg-white/10 transition-colors peer-checked:bg-gold-300/80 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-200/60" />
                    <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                  </span>
                </label>
                <button
                  onClick={() => send(`Edit it for me: ${AUTO_EDIT_STYLES.find((s) => s.id === style)!.label}`, style)}
                  disabled={busy}
                  className="ed-gold mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold disabled:opacity-50"
                >
                  <Wand2 size={16} /> Edit it for me
                </button>
              </motion.div>
            )}

            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
              <p className="px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#7d858f]">Or ask for something</p>
              <div className="grid gap-1.5">
                {SUGGESTIONS.map(({ text, icon: Icon }) => (
                  <button
                    key={text}
                    onClick={() => send(text)}
                    disabled={busy}
                    className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left text-[13px] text-[#e8e2d2] transition-all hover:border-gold-400/35 hover:bg-gold-500/[0.07] disabled:opacity-50"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-gold-300 transition-colors group-hover:bg-gold-400/15"><Icon size={14} /></span>
                    <span className="flex-1">{text}</span>
                    <ArrowUp size={14} className="rotate-45 text-white/0 transition-all group-hover:text-gold-200" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {messages.map((m, i) => (
          <motion.div key={i} {...enter} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'agent' && <span className="ed-orb mt-1 block size-6 shrink-0 [animation-duration:10s]" aria-hidden />}
            <div
              className={`max-w-[86%] rounded-[18px] px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-md bg-[linear-gradient(135deg,rgba(243,229,192,0.22),rgba(200,167,106,0.14))] text-gold-50 ring-1 ring-inset ring-gold-300/20'
                  : m.tone === 'error'
                    ? 'rounded-tl-md border border-red-400/30 bg-red-500/10 text-red-100'
                    : m.tone === 'warning'
                      ? 'rounded-tl-md border border-amber-400/30 bg-amber-500/10 text-amber-50'
                      : 'rounded-tl-md border border-white/[0.07] bg-white/[0.04] text-[#ece7da]'
              }`}
            >
              {m.text}
              {m.changes && m.changes.length > 0 && (
                <ul className="mt-2.5 space-y-1.5 border-t border-white/[0.08] pt-2.5 text-[12.5px] text-[#d6d0c0]">
                  {m.changes.map((c, j) => (
                    <motion.li key={j} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * j }} className="flex gap-2">
                      <Check size={13} className="mt-[3px] shrink-0 text-gold-300" />{c}
                    </motion.li>
                  ))}
                  <li className="pt-1 text-[11px] text-[#7d858f]">Uses your existing footage. No new generation.</li>
                </ul>
              )}
              {m.undoAt !== undefined && !m.reviewed && m.undoAt === historyLength && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => review(i, 'kept')} className="ed-gold flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold">
                    <Check size={13} /> Keep
                  </button>
                  <button
                    onClick={() => {
                      undo();
                      review(i, 'undone');
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-xs text-[#e8e2d2] transition-colors hover:bg-white/5"
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
                  className="mt-2.5 flex h-8 items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs text-[#e8e2d2] hover:bg-white/5"
                >
                  <History size={13} /> Go back to before this edit
                </button>
              )}
              {m.reviewed && (
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[#8f97a1]">
                  <span className={`size-1.5 rounded-full ${m.reviewed === 'kept' ? 'bg-[#8fd1b9]' : 'bg-white/40'}`} />
                  {m.reviewed === 'kept' ? 'Kept.' : m.reviewed === 'undone' ? 'Undone.' : 'Restored the version from before this edit.'}
                </p>
              )}
              {m.newShots?.map((n, j) => (
                <div key={j} className="mt-3 rounded-2xl border border-gold-400/25 bg-gold-500/[0.08] p-3">
                  <p className="text-[12.5px] text-gold-50">
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
                          className="ed-gold mt-2 flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold"
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
          </motion.div>
        ))}

        <AnimatePresence>
          {busy && (
            <motion.div key="thinking" {...enter} exit={{ opacity: 0, y: -4 }} className="flex items-start gap-2.5">
              <span className="ed-orb mt-1 block size-6 shrink-0" data-busy="true" aria-hidden />
              <div className="rounded-[18px] rounded-tl-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5">
                <AnimatePresence mode="wait">
                  <motion.p key={step} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="ed-shimmer-text text-[13.5px] font-medium">
                    {THINKING[step]}…
                  </motion.p>
                </AnimatePresence>
                <div className="mt-2 flex gap-1" aria-hidden>
                  {THINKING.map((_, k) => (
                    <span key={k} className={`h-1 w-6 rounded-full transition-colors duration-500 ${k <= step ? 'bg-gold-300/80' : 'bg-white/10'}`} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        {!empty && (
          <div className="ed-scroll -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {SUGGESTIONS.map(({ text, short, icon: Icon }) => (
              <button
                key={text}
                onClick={() => send(text)}
                disabled={busy}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-[#cfc9b9] transition-colors hover:border-gold-300/40 hover:text-gold-50 disabled:opacity-40"
              >
                <Icon size={12} className="text-gold-300" /> {short}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="ed-focus-ring flex items-end gap-2 rounded-[20px] border border-white/[0.09] bg-black/30 p-1.5"
        >
          <textarea
            ref={input}
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
            className="max-h-36 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] text-white placeholder:text-[#6f7782] focus:outline-none"
          />
          <motion.button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send"
            whileTap={{ scale: 0.9 }}
            className="ed-gold grid size-10 shrink-0 place-items-center rounded-2xl disabled:opacity-30"
          >
            <ArrowUp size={18} strokeWidth={2.4} />
          </motion.button>
        </form>
        <p className="mt-1.5 px-2 text-[10.5px] text-[#6f7782]">Enter to send · AI edits only use footage you have</p>
      </div>
    </div>
  );
}

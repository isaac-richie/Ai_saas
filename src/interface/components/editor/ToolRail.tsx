'use client';

import { motion } from 'framer-motion';
import { Keyboard, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { AdjustGlyph, FormatGlyph, LookGlyph, MusicGlyph, TextGlyph, type Glyph } from './glyphs';

export type Tab = 'ai' | 'clip' | 'look' | 'format' | 'music' | 'text';

export const TABS: { id: Tab; label: string; title: string; blurb: string; icon: Glyph | typeof Sparkles }[] = [
  { id: 'ai', label: 'AI', title: 'AI Director', blurb: 'Cuts, grades and times your video', icon: Sparkles },
  { id: 'clip', label: 'Adjust', title: 'Adjust', blurb: 'Fine-tune what you selected', icon: AdjustGlyph },
  { id: 'look', label: 'Look', title: 'Look', blurb: 'One color story for the whole video', icon: LookGlyph },
  { id: 'format', label: 'Format', title: 'Format', blurb: 'Frame shape and how footage fills it', icon: FormatGlyph },
  { id: 'music', label: 'Music', title: 'Music', blurb: 'Soundtrack and beat sync', icon: MusicGlyph },
  { id: 'text', label: 'Text', title: 'Text', blurb: 'Titles and captions', icon: TextGlyph },
];

/** Desktop: a slim vertical rail of tools. The active tool wears a gliding gold pill. */
export function ToolRail({ tab, open, onPick, onToggle, onShortcuts }: {
  tab: Tab;
  open: boolean;
  onPick: (tab: Tab) => void;
  onToggle: () => void;
  onShortcuts?: () => void;
}) {
  return (
    <nav aria-label="Editing tools" className="ed-glass flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-[22px] py-2.5">
      <div role="tablist" aria-orientation="vertical" className="flex w-full flex-col items-center gap-1 px-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = open && tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => onPick(id)}
              title={TABS.find((t) => t.id === id)!.title}
              className={`group relative flex w-full flex-col items-center gap-1 rounded-2xl py-2.5 text-[10.5px] font-medium tracking-wide transition-colors ${
                active ? 'text-gold-50' : 'text-[#9aa3ad] hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="rail-active"
                  className="absolute inset-0 rounded-2xl border border-gold-300/30 bg-[linear-gradient(180deg,rgba(227,207,159,0.16),rgba(227,207,159,0.04))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_-14px_rgba(217,192,138,0.8)]"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
              )}
              {active && (
                <motion.span
                  layoutId="rail-accent"
                  className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gold-200 shadow-[0_0_10px_rgba(243,229,192,0.9)]"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
              )}
              <span className="relative grid size-8 place-items-center">
                {id === 'ai' ? (
                  <span className={`ed-orb block size-[22px] transition-transform duration-300 group-hover:scale-110 ${active ? '' : 'opacity-80'}`} aria-hidden />
                ) : (
                  <Icon size={22} strokeWidth={1.6} className="transition-transform duration-300 group-hover:scale-110" />
                )}
              </span>
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
        {onShortcuts && (
          <button onClick={onShortcuts} className="grid size-10 place-items-center rounded-xl text-[#8f97a1] transition-colors hover:bg-white/[0.05] hover:text-white" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard size={17} />
          </button>
        )}
        <button
          onClick={onToggle}
          className="grid size-10 place-items-center rounded-xl text-[#8f97a1] transition-colors hover:bg-white/[0.05] hover:text-white"
          aria-label={open ? 'Hide the tools panel' : 'Show the tools panel'}
          title={open ? 'Hide panel' : 'Show panel'}
        >
          {open ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
      </div>
    </nav>
  );
}

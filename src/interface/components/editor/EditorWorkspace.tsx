'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, ChevronLeft, Clapperboard, ImagePlus, Keyboard, Loader2, Maximize, Music2, Palette, Pause,
  Play, Proportions, Redo2, Scissors, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Trash2, Type, Undo2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { useMediaQuery } from '@/interface/hooks/use-media-query';
import { syncVideoToSong } from '@/core/services/timeline-ops';
import { getGradeById } from '@/core/services/color-grading';
import { MIN_CLIP_MS } from '@/core/services/edit-agent';
import { PreviewPlayer } from './PreviewPlayer';
import { TimelinePanel, ZOOM_LIMITS } from './TimelinePanel';
import { AgentPanel, type AgentReply } from './AgentPanel';
import { ClipPanel, type TakeStatus } from './ClipPanel';
import { ColorGradePicker } from './ColorGradePicker';
import { MusicPanel } from './MusicPanel';
import { TextPanel } from './TextPanel';
import { ExportSheet } from './ExportSheet';
import { FormatPanel } from './FormatPanel';
import { formatFor } from '@/core/services/video-format';
import { formatClock } from './labels';

export type RenderState = {
  status: 'idle' | 'queued' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage: string;
  url: string | null;
  storageKey: string | null;
  error: string | null;
};

export interface EditorWorkspaceProps {
  backHref: string;
  /** The project's name, shown in the top bar. */
  title?: string;
  saving: boolean;
  saveFailed?: boolean;
  error: string | null;
  notice: string | null;
  onDismissError: () => void;
  render: RenderState;
  reframes: { aspect: string; url: string }[];
  reframing: boolean;
  importing: boolean;
  onImport: () => void;
  onRender: () => void;
  onReframe: () => void;
  onAgent: (instruction: string) => Promise<AgentReply>;
  onUploadMusic: (file: File) => Promise<string | null>;
  onAddText: () => Promise<void>;
  onAutoCaptions: () => Promise<string | null>;
  /** Makes a new take of a shot with the generator; absent where generation isn't available. */
  onRegenerate?: (clipId: string, options: { durationSec?: number; note?: string }) => Promise<void>;
  takeStatus?: Record<string, TakeStatus>;
}

type Tab = 'ai' | 'clip' | 'look' | 'format' | 'music' | 'text';
const TABS: { id: Tab; label: string; title: string; icon: typeof Sparkles }[] = [
  { id: 'ai', label: 'AI', title: 'AI editor', icon: Sparkles },
  { id: 'clip', label: 'Adjust', title: 'Adjust', icon: SlidersHorizontal },
  { id: 'look', label: 'Look', title: 'Look', icon: Palette },
  { id: 'format', label: 'Format', title: 'Video format', icon: Proportions },
  { id: 'music', label: 'Music', title: 'Music', icon: Music2 },
  { id: 'text', label: 'Text', title: 'Text', icon: Type },
];

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['← →', 'Step one frame (hold Shift for a second)'],
  ['S', 'Split the selected shot at the playhead'],
  ['Delete', 'Remove what’s selected'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['Esc', 'Deselect'],
  ['⌘ + scroll', 'Zoom the timeline'],
];

const iconButton =
  'grid size-10 place-items-center rounded-xl text-[#d6d0c0] transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent';
const goldButton =
  'bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[#1a160e] shadow-[0_10px_30px_-12px_rgba(217,192,138,0.8)]';

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const store = useTimelineStore();
  const { clips, tracks, timeline, history, is_playing, playhead_ms, selected_clip_id, pixels_per_ms } = store;
  const desktop = useMediaQuery('(min-width: 1024px)', true);
  const phone = !useMediaQuery('(min-width: 768px)', true);
  const [tab, setTab] = useState<Tab>('ai');
  const [sheet, setSheet] = useState<Tab | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);

  const busy = props.render.status === 'queued' || props.render.status === 'rendering';
  const videoTrack = tracks.find((t) => t.track_type === 'video');
  const shots = clips.filter((c) => c.track_id === videoTrack?.id).sort((a, b) => a.start_ms - b.start_ms);
  const endMs = shots.length ? shots[shots.length - 1].end_ms : 0;
  const selected = clips.find((c) => c.id === selected_clip_id);
  const selectedTrack = tracks.find((t) => t.id === selected?.track_id);
  const song = clips.find((c) => tracks.find((t) => t.id === c.track_id)?.track_type === 'audio');
  const canSplit = Boolean(
    selected && selectedTrack?.track_type === 'video' && !selectedTrack.locked &&
      playhead_ms > selected.start_ms + MIN_CLIP_MS && playhead_ms < selected.end_ms - MIN_CLIP_MS,
  );

  // Desktop: selecting something on the timeline opens its settings in the side panel.
  useEffect(
    () =>
      useTimelineStore.subscribe((state, prev) => {
        if (state.selected_clip_id && state.selected_clip_id !== prev.selected_clip_id) setTab('clip');
      }),
    [],
  );

  const syncToBeat = () => {
    if (!videoTrack) return;
    store.commitClips(syncVideoToSong(clips, videoTrack.id, song), `beat-sync:${Date.now()}`);
  };

  const makeVideo = () => {
    setExportOpen(true);
    if (!busy) props.onRender();
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const s = useTimelineStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (e.key === ' ') {
        e.preventDefault();
        s.togglePlay();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected_clip_id) {
        e.preventDefault();
        s.removeClip(s.selected_clip_id);
      } else if (e.key.toLowerCase() === 's' && !mod && s.selected_clip_id) {
        s.split(s.selected_clip_id, s.playhead_ms);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1000 : 1000 / (s.timeline?.fps || 24);
        s.setPlayhead(s.playhead_ms + (e.key === 'ArrowLeft' ? -step : step));
      } else if (e.key === '?') {
        setShortcutsOpen((v) => !v);
      } else if (e.key === 'Escape') {
        s.selectClip(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const zoomTo = (ppm: number) => store.setZoom(Math.max(ZOOM_LIMITS.MIN_PPMS, Math.min(ZOOM_LIMITS.MAX_PPMS, ppm)) / 0.1);
  const zoomRange = Math.log(ZOOM_LIMITS.MAX_PPMS / ZOOM_LIMITS.MIN_PPMS);
  const zoomValue = Math.round((Math.log(pixels_per_ms / ZOOM_LIMITS.MIN_PPMS) / zoomRange) * 100);

  const jumpShot = (dir: -1 | 1) => {
    if (dir < 0) {
      const prev = [...shots].reverse().find((c) => c.start_ms < playhead_ms - 200);
      store.setPlayhead(prev ? prev.start_ms : 0);
    } else {
      const next = shots.find((c) => c.start_ms > playhead_ms + 1);
      store.setPlayhead(next ? next.start_ms : endMs);
    }
  };

  // The timeline's empty rows and its "+" tile lead straight to the right tool.
  const addFrom = (kind: 'shots' | 'music' | 'text') => {
    if (kind === 'shots') props.onImport();
    else if (kind === 'text') void props.onAddText();
    else if (desktop) setTab('music');
    else setSheet('music');
  };

  const panel = (id: Tab) => {
    if (id === 'ai') return <AgentPanel onSend={props.onAgent} />;
    if (id === 'clip') return <ClipPanel onSyncToBeat={syncToBeat} onRegenerate={props.onRegenerate} takeStatus={props.takeStatus} />;
    if (id === 'look') return <ColorGradePicker selectedId={timeline?.color_grade_id || 'natural'} onSelect={store.setGrade} />;
    if (id === 'format') return <FormatPanel />;
    if (id === 'music') return <MusicPanel onUpload={props.onUploadMusic} onSyncToBeat={syncToBeat} />;
    return <TextPanel onAddText={props.onAddText} onAutoCaptions={props.onAutoCaptions} hasRender={Boolean(props.render.storageKey)} />;
  };

  const emptyHint = (
    <div className="space-y-3">
      <p>Bring in the shots from your storyboard to start editing.</p>
      <button onClick={props.onImport} disabled={props.importing} className="inline-flex items-center gap-2 rounded-xl border border-gold-400/50 px-4 py-2.5 text-sm text-gold-100 hover:bg-gold-500/10 disabled:opacity-50">
        {props.importing ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} Add my storyboard shots
      </button>
    </div>
  );

  const playButton = (size: 'lg' | 'md') => (
    <button
      onClick={store.togglePlay}
      disabled={shots.length === 0}
      className={`grid place-items-center rounded-full bg-gold-200 text-[#1a160e] shadow-[0_8px_24px_-10px_rgba(227,207,159,0.9)] transition-transform active:scale-95 disabled:opacity-40 ${size === 'lg' ? 'size-12' : 'size-11'}`}
      aria-label={is_playing ? 'Pause' : 'Play'}
    >
      {is_playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="translate-x-px" />}
    </button>
  );

  const timecode = (
    <span className="whitespace-nowrap font-mono text-[13px] tabular-nums text-[#e8e2d2]">
      {formatClock(playhead_ms, true)}
      <span className="text-[#8f97a1]"> / {formatClock(endMs, true)}</span>
    </span>
  );

  const summary = {
    shots: shots.length,
    lengthMs: endMs,
    look: getGradeById(timeline?.color_grade_id || 'natural')?.name || 'Natural',
    music: song ? String((song.metadata as { name?: string })?.name || 'Music') : null,
    texts: clips.filter((c) => tracks.find((t) => t.id === c.track_id)?.track_type === 'caption').length,
    format: `${formatFor(timeline?.resolution).label} ${formatFor(timeline?.resolution).ratio}`,
    wide: formatFor(timeline?.resolution).id === 'widescreen',
  };

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(ellipse_at_top,rgba(217,192,138,0.06),transparent_55%)]">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 md:h-16 md:px-4">
        <Link href={props.backHref} className={iconButton} aria-label="Back to storyboard">
          <ArrowLeft size={19} />
        </Link>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-base font-light tracking-tight text-white md:text-lg">
            {props.title ? props.title : <>Edit <span className="lux-serif text-gold-200">video</span></>}
          </h1>
          <SaveStatus saving={props.saving} failed={Boolean(props.saveFailed)} />
        </div>
        <button onClick={store.undo} disabled={history.past.length === 0} className={iconButton} aria-label="Undo" title="Undo (⌘Z)">
          <Undo2 size={18} />
        </button>
        <button onClick={store.redo} disabled={history.future.length === 0} className={iconButton} aria-label="Redo" title="Redo (⇧⌘Z)">
          <Redo2 size={18} />
        </button>
        {desktop && (
          <button onClick={() => setShortcutsOpen(true)} className={iconButton} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard size={18} />
          </button>
        )}
        {props.render.status !== 'idle' && (
          <RenderPill render={props.render} onClick={() => setExportOpen(true)} />
        )}
        {!phone && (
          <button onClick={makeVideo} disabled={shots.length === 0} className={`ml-1.5 flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-opacity disabled:opacity-45 ${goldButton}`}>
            <Clapperboard size={16} /> Make video
          </button>
        )}
      </header>

      <Toasts error={props.error} notice={props.notice} onDismissError={props.onDismissError} />

      {desktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] grid-rows-[minmax(0,1fr)_auto] gap-3 p-3">
          <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-black/30">
            <div className="min-h-0 flex-1 p-4 pb-2">
              <PreviewPlayer emptyHint={emptyHint} />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-3">
              <div>{timecode}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => store.setPlayhead(0)} className={iconButton} aria-label="Back to start" title="Back to start"><SkipBack size={17} /></button>
                <button onClick={() => jumpShot(-1)} className={iconButton} aria-label="Previous shot" title="Previous shot"><ChevronLeft size={19} /></button>
                {playButton('lg')}
                <button onClick={() => jumpShot(1)} className={iconButton} aria-label="Next shot" title="Next shot"><ChevronLeft size={19} className="rotate-180" /></button>
                <button onClick={() => store.setPlayhead(endMs)} className={iconButton} aria-label="Go to end" title="Go to end"><SkipForward size={17} /></button>
              </div>
              <div className="text-right">
                <button onClick={() => setTab('format')} className="rounded-lg px-2 py-1 text-xs text-[#b0b8c4] hover:bg-white/5 hover:text-white" title="Change the video format">
                  {formatFor(timeline?.resolution).label} {formatFor(timeline?.resolution).ratio} · {timeline?.fps || 24} fps
                </button>
              </div>
            </div>
          </section>

          <aside className="lux-glass row-span-2 flex min-h-0 flex-col overflow-hidden rounded-2xl">
            <div role="tablist" aria-label="Editing tools" className="grid grid-cols-6 gap-1 border-b border-line p-1.5">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition-colors ${
                    tab === id ? 'bg-gold-500/15 text-gold-100' : 'text-[#b0b8c4] hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  {label}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">{panel(tab)}</div>
          </aside>

          <section className="min-w-0 space-y-2">
            <div className="flex items-center gap-1">
              <ToolbarButton icon={Scissors} label="Split" title="Split at the playhead (S)" disabled={!canSplit} onClick={() => selected && store.split(selected.id, playhead_ms)} />
              <ToolbarButton icon={Trash2} label="Delete" title="Delete (⌫)" disabled={!selected || selectedTrack?.locked} onClick={() => selected && store.removeClip(selected.id)} />
              <span className="mx-1 h-5 w-px bg-line" />
              <ToolbarButton icon={Type} label="Add text" onClick={() => { void props.onAddText(); }} disabled={shots.length === 0} />
              <ToolbarButton icon={Music2} label={song ? 'Music' : 'Add music'} onClick={() => setTab('music')} />
              <div className="ml-auto flex items-center gap-1.5">
                <button onClick={() => zoomTo(pixels_per_ms / 1.4)} className="grid size-8 place-items-center rounded-lg text-[#b0b8c4] hover:bg-white/5 hover:text-white" aria-label="Zoom out"><ZoomOut size={16} /></button>
                <input
                  type="range" min={0} max={100} value={zoomValue} aria-label="Timeline zoom"
                  onChange={(e) => zoomTo(ZOOM_LIMITS.MIN_PPMS * Math.exp((Number(e.target.value) / 100) * zoomRange))}
                  className="w-28 accent-[#d9c08a]"
                />
                <button onClick={() => zoomTo(pixels_per_ms * 1.4)} className="grid size-8 place-items-center rounded-lg text-[#b0b8c4] hover:bg-white/5 hover:text-white" aria-label="Zoom in"><ZoomIn size={16} /></button>
                <button onClick={() => setFitSignal((n) => n + 1)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-[#b0b8c4] hover:bg-white/5 hover:text-white" title="Fit the whole video">
                  <Maximize size={13} /> Fit
                </button>
              </div>
            </div>
            <TimelinePanel fitSignal={fitSignal} onAdd={addFrom} />
          </section>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-[180px] flex-1 px-3 pt-3">
            <PreviewPlayer emptyHint={emptyHint} />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex-1">{timecode}</div>
            {playButton('md')}
            <div className="flex flex-1 justify-end">
              <button onClick={() => setFitSignal((n) => n + 1)} className={iconButton} aria-label="Fit the whole video"><Maximize size={17} /></button>
            </div>
          </div>
          <div className="px-2 pb-2">
            <TimelinePanel centered={phone} fitSignal={fitSignal} onAdd={addFrom} />
          </div>

          {selected && selectedTrack ? (
            <ContextBar
              kind={selectedTrack.track_type}
              locked={selectedTrack.locked}
              canSplit={canSplit}
              position={shots.findIndex((c) => c.id === selected.id)}
              shotCount={shots.length}
              onDone={() => store.selectClip(null)}
              onSplit={() => store.split(selected.id, playhead_ms)}
              onDelete={() => store.removeClip(selected.id)}
              onMove={(dir) => store.reorder(selected.id, shots.findIndex((c) => c.id === selected.id) + dir)}
              onSettings={() => setSheet('clip')}
            />
          ) : (
            <nav aria-label="Editing tools" className="flex shrink-0 items-center gap-1 border-t border-line bg-obsidian-950/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur">
              {TABS.filter((t) => t.id !== 'clip').map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setSheet(id)} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-xs text-[#d6d0c0] active:bg-white/5">
                  <Icon size={20} strokeWidth={1.7} className={id === 'ai' ? 'text-gold-200' : ''} />
                  {label}
                </button>
              ))}
              {phone && (
                <button onClick={makeVideo} disabled={shots.length === 0} className={`ml-1 flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-sm font-semibold disabled:opacity-45 ${goldButton}`}>
                  <Clapperboard size={16} /> Make
                </button>
              )}
            </nav>
          )}

          {sheet && (
            <ToolSheet title={TABS.find((t) => t.id === sheet)!.title} onClose={() => setSheet(null)} tall={sheet === 'ai'}>
              {panel(sheet)}
            </ToolSheet>
          )}
        </div>
      )}

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        render={props.render}
        summary={summary}
        reframes={props.reframes}
        reframing={props.reframing}
        onRender={props.onRender}
        onReframe={props.onReframe}
      />
      {shortcutsOpen && <ShortcutsCard onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function SaveStatus({ saving, failed }: { saving: boolean; failed: boolean }) {
  const [label, dot] = failed
    ? ['Not saved yet · retrying', 'bg-amber-300']
    : saving
      ? ['Saving…', 'bg-gold-300 animate-pulse']
      : ['All changes saved', 'bg-[#8fd1b9]'];
  return (
    <p className="flex items-center gap-1.5 text-xs text-[#b0b8c4]" aria-live="polite">
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden /> {label}
    </p>
  );
}

function RenderPill({ render, onClick }: { render: RenderState; onClick: () => void }) {
  const busy = render.status === 'queued' || render.status === 'rendering';
  const tone =
    render.status === 'failed'
      ? 'border-red-400/40 text-red-100'
      : render.status === 'completed'
        ? 'border-gold-300/50 text-gold-100'
        : 'border-line-strong text-[#e8e2d2]';
  return (
    <button onClick={onClick} className={`ml-1 flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] hover:bg-white/5 ${tone}`}>
      {busy ? (
        <>
          <Loader2 size={14} className="animate-spin text-gold-300" />
          <span className="tabular-nums">{render.progress}%</span>
        </>
      ) : render.status === 'completed' ? (
        <>
          <span className="lux-live-dot size-2 rounded-full bg-gold-300" aria-hidden /> Ready
        </>
      ) : (
        'Didn’t finish'
      )}
    </button>
  );
}

function Toasts({ error, notice, onDismissError }: { error: string | null; notice: string | null; onDismissError: () => void }) {
  if (!error && !notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4 md:top-20">
      {error && (
        <div role="alert" className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-red-400/30 bg-[#2a1414]/95 px-4 py-3 text-sm text-red-100 shadow-2xl backdrop-blur animate-[sheet-rise_0.25s_ease]">
          <span className="flex-1">{error}</span>
          <button onClick={onDismissError} aria-label="Dismiss" className="text-red-200/70 hover:text-white"><X size={16} /></button>
        </div>
      )}
      {notice && (
        <div role="status" className="w-full max-w-md rounded-2xl border border-[#b6ddd3]/30 bg-[#122220]/95 px-4 py-3 text-sm text-[#dff1ec] shadow-2xl backdrop-blur animate-[sheet-rise_0.25s_ease]">
          {notice}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, title, disabled, onClick }: {
  icon: typeof Scissors; label: string; title?: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title ?? label} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-[#d6d0c0] transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-35 disabled:hover:bg-transparent">
      <Icon size={15} /> {label}
    </button>
  );
}

/** Phones: when something is selected, the tool dock becomes that item's actions. */
function ContextBar({ kind, locked, canSplit, position, shotCount, onDone, onSplit, onDelete, onMove, onSettings }: {
  kind: string; locked: boolean; canSplit: boolean; position: number; shotCount: number;
  onDone: () => void; onSplit: () => void; onDelete: () => void; onMove: (dir: -1 | 1) => void; onSettings: () => void;
}) {
  const item = (Icon: typeof Scissors, label: string, onClick: () => void, disabled = false, danger = false) => (
    <button key={label} onClick={onClick} disabled={disabled || locked} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-xs active:bg-white/5 disabled:opacity-30 ${danger ? 'text-red-200' : 'text-[#e8e2d2]'}`}>
      <Icon size={20} strokeWidth={1.7} /> {label}
    </button>
  );
  return (
    <nav aria-label="Selected item" className="flex shrink-0 items-center gap-1 border-t border-gold-400/25 bg-obsidian-900/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur">
      <button onClick={onDone} aria-label="Done" className="grid h-12 w-10 shrink-0 place-items-center rounded-xl text-gold-200 active:bg-white/5">
        <ChevronLeft size={22} />
      </button>
      {kind === 'video' && (
        <>
          {item(Scissors, 'Split', onSplit, !canSplit)}
          {item(ArrowLeft, 'Earlier', () => onMove(-1), position <= 0)}
          {item(ArrowRight, 'Later', () => onMove(1), position >= shotCount - 1)}
          {item(SlidersHorizontal, 'Adjust', onSettings)}
        </>
      )}
      {kind !== 'video' && item(kind === 'caption' ? Type : SlidersHorizontal, kind === 'caption' ? 'Edit text' : 'Adjust', onSettings)}
      {item(Trash2, 'Delete', onDelete, false, true)}
    </nav>
  );
}

function ToolSheet({ title, onClose, tall, children }: { title: string; onClose: () => void; tall: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 z-30 bg-black/40" />
      <div
        role="dialog"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl border-t border-line-strong bg-obsidian-900 shadow-[0_-30px_60px_-20px_rgba(0,0,0,0.9)] animate-[sheet-rise_0.28s_cubic-bezier(0.22,1,0.36,1)] ${
          tall ? 'h-[72%]' : 'max-h-[62%]'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2.5">
          <span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-white/15" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center justify-between px-4 pb-1">
          <h2 className="text-base font-medium text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-[#b0b8c4] hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </>
  );
}

function ShortcutsCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="w-full max-w-sm rounded-3xl border border-line-strong bg-obsidian-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-light text-white">Keyboard <span className="lux-serif text-gold-200">shortcuts</span></h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-[#b0b8c4] hover:bg-white/5"><X size={16} /></button>
        </div>
        <dl className="space-y-2.5">
          {SHORTCUTS.map(([key, what]) => (
            <div key={key} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-[#d6d0c0]">{what}</dt>
              <dd className="lux-kbd shrink-0">{key}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-[#9aa3ad]">Drag shots to reorder; drag their edges to trim. Edges snap to the playhead, cuts and beats.</p>
      </div>
    </div>
  );
}

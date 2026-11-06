'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, ChevronLeft, Clapperboard, History, ImagePlus, Loader2, Maximize, MessageSquare, Music2, PanelLeftClose,
  Plus, Redo2, Scissors, SlidersHorizontal, Trash2, Type, Undo2, Upload, Wand2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { useMediaQuery } from '@/interface/hooks/use-media-query';
import { useStoredValue } from '@/interface/hooks/use-stored-value';
import { outputToTimelineMs, syncVideoToSong } from '@/core/services/timeline-ops';
import type { OwnerShare } from '@/core/actions/video-review';
import { ReviewsSheet } from './ReviewsSheet';
import { VersionsSheet } from './VersionsSheet';
import type { RevisionSummary } from '@/core/actions/timeline-revisions';
import { getGradeById } from '@/core/services/color-grading';
import { MIN_CLIP_MS, isClipLocked } from '@/core/services/edit-agent';
import { PreviewPlayer } from './PreviewPlayer';
import { TimelinePanel, ZOOM_LIMITS } from './TimelinePanel';
import { AgentPanel, type AgentReply } from './AgentPanel';
import { AddClipsDialog } from './AddClipsDialog';
import { ClipPanel, type TakeStatus } from './ClipPanel';
import { ColorGradePicker } from './ColorGradePicker';
import { MusicPanel } from './MusicPanel';
import { TextPanel } from './TextPanel';
import { ExportSheet } from './ExportSheet';
import { FormatPanel } from './FormatPanel';
import { ToolRail, TABS, type Tab } from './ToolRail';
import { Transport } from './Transport';
import { formatFor } from '@/core/services/video-format';
import { parseResolution } from '@/core/services/timeline-render';
import type { AutoEditStyle } from '@/core/services/auto-edit';
import { formatClock } from './labels';
import { EditorModeContext, useEditorModeState, type EditorMode } from '@/interface/hooks/use-editor-mode';

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
  onUploadVideos: (files: File[]) => Promise<string | null>;
  /** Adds finished clips from the creator's other work; absent in the dev sandbox. */
  onAddLibraryClips?: (urls: string[]) => Promise<boolean>;
  projectId?: string;
  onAddText: () => Promise<void>;
  onAutoCaptions: () => Promise<string | null>;
  /** Makes a new take of a shot with the generator; absent where generation isn't available. */
  onRegenerate?: (clipId: string, options: { durationSec?: number; note?: string }) => Promise<void>;
  takeStatus?: Record<string, TakeStatus>;
  /** One-tap first cut in a style. */
  onAutoEdit?: (style: AutoEditStyle, options: { title: boolean }) => Promise<AgentReply>;
  /** Review links for this video and what reviewers said. */
  reviews?: OwnerShare[];
  onShareForReview?: () => Promise<string | null>;
  onResolveNote?: (noteId: string, resolved: boolean) => void;
  onTurnOffLink?: (shareId: string) => void;
  /** Saved versions (one before every AI edit). */
  onListVersions?: () => Promise<RevisionSummary[]>;
  onRestoreVersion?: (revisionId: string) => Promise<boolean>;
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['← →', 'Step one frame (hold Shift for a second)'],
  ['S', 'Split the selected shot at the playhead'],
  ['Delete', 'Remove what’s selected'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['Esc', 'Deselect'],
  ['⌘ + scroll', 'Zoom the timeline'],
  ['\\', 'Show or hide the tools panel'],
];

const iconButton =
  'grid size-9 place-items-center rounded-full text-[#cfc9b9] transition-all hover:bg-white/[0.07] hover:text-white active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent';
// Phones and tablets: tools float in a glass dock above the safe area.
const dockClass = 'ed-glass ed-glass-lit mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] mt-2 flex shrink-0 items-center gap-1 rounded-[22px] p-1.5';
const chip =
  'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-[#cfc9b9] transition-colors hover:border-gold-300/40 hover:text-gold-50';

const TIMELINE_HEIGHT_KEY = 'visiowave.editor.timeline-height';
const PANEL_OPEN_KEY = 'visiowave.editor.panel-open';
const TIMELINE_MIN = 176;
const TIMELINE_DEFAULT = 268;
const spring = { type: 'spring', stiffness: 380, damping: 38 } as const;

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

const parseHeight = (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= TIMELINE_MIN ? n : null;
};
const parseBool = (raw: string) => (raw === 'true' ? true : raw === 'false' ? false : null);

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const timelineStore = useTimelineStore();
  const { clips, tracks, timeline, history, playhead_ms, selected_clip_id, pixels_per_ms } = timelineStore;
  const desktop = useMediaQuery('(min-width: 1024px)', true);
  const phone = !useMediaQuery('(min-width: 768px)', true);
  const [tab, setTab] = useState<Tab>('ai');
  // The creator's layout (panel open, timeline height) is remembered in this browser.
  const [panelOpen, setPanelOpen] = useStoredValue(PANEL_OPEN_KEY, true, parseBool);
  const [sheet, setSheet] = useState<Tab | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [addingClips, setAddingClips] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [mode, setMode] = useEditorModeState();
  const pro = mode === 'pro';
  const workArea = useRef<HTMLDivElement>(null);
  const [storedHeight, setStoredHeight] = useStoredValue(TIMELINE_HEIGHT_KEY, TIMELINE_DEFAULT, parseHeight);
  // While dragging the divider the height lives here; it is saved when the drag ends.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const timelineHeight = dragHeight ?? storedHeight;
  const [resizing, setResizing] = useState(false);

  const busy = props.render.status === 'queued' || props.render.status === 'rendering';
  const openNotes = (props.reviews ?? []).reduce((n, r) => n + r.notes.filter((x) => x.kind === 'note' && !x.resolved).length, 0);
  const [frameW, frameH] = parseResolution(timeline?.resolution);
  const videoTrack = tracks.find((t) => t.track_type === 'video');
  const shots = clips.filter((c) => c.track_id === videoTrack?.id).sort((a, b) => a.start_ms - b.start_ms);
  const endMs = shots.length ? shots[shots.length - 1].end_ms : 0;
  const selected = clips.find((c) => c.id === selected_clip_id);
  const selectedTrack = tracks.find((t) => t.id === selected?.track_id);
  const song = clips.find((c) => tracks.find((t) => t.id === c.track_id)?.track_type === 'audio');
  // A shot can't be changed when its row is locked or it was approved and locked itself.
  const selectedLocked = Boolean(selectedTrack?.locked || isClipLocked(selected));
  const canSplit = Boolean(
    selected && selectedTrack?.track_type === 'video' && !selectedLocked &&
      playhead_ms > selected.start_ms + MIN_CLIP_MS && playhead_ms < selected.end_ms - MIN_CLIP_MS,
  );
  const format = formatFor(timeline?.resolution);
  const gradeName = getGradeById(timeline?.color_grade_id || 'natural')?.name || 'Natural';

  const openTool = useCallback((id: Tab) => {
    setTab(id);
    setPanelOpen(true);
  }, [setPanelOpen]);
  const togglePanel = useCallback(() => setPanelOpen(!panelOpen), [panelOpen, setPanelOpen]);

  // Desktop: selecting something on the timeline opens its settings in the side panel.
  useEffect(
    () =>
      useTimelineStore.subscribe((state, prev) => {
        if (state.selected_clip_id && state.selected_clip_id !== prev.selected_clip_id) {
          setTab('clip');
          setPanelOpen(true);
        }
      }),
    [setPanelOpen],
  );

  const syncToBeat = () => {
    if (!videoTrack) return;
    timelineStore.commitClips(syncVideoToSong(clips, videoTrack.id, song), `beat-sync:${Date.now()}`);
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
      } else if (e.key === '\\') {
        togglePanel();
      } else if (e.key === 'Escape') {
        s.selectClip(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePanel]);

  // Drag the bar between the stage and the timeline to give either more room.
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setResizing(true);
    const startY = e.clientY;
    const startH = timelineHeight;
    setDragHeight(startH);
    const max = Math.max(TIMELINE_MIN, (workArea.current?.clientHeight ?? 800) * 0.62);
    let latest = startH;
    const move = (ev: PointerEvent) => {
      latest = Math.round(Math.max(TIMELINE_MIN, Math.min(max, startH + (startY - ev.clientY))));
      setDragHeight(latest);
    };
    const up = () => {
      setResizing(false);
      setStoredHeight(latest);
      setDragHeight(null);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const zoomTo = (ppm: number) => timelineStore.setZoom(Math.max(ZOOM_LIMITS.MIN_PPMS, Math.min(ZOOM_LIMITS.MAX_PPMS, ppm)) / 0.1);
  const zoomRange = Math.log(ZOOM_LIMITS.MAX_PPMS / ZOOM_LIMITS.MIN_PPMS);
  const zoomValue = Math.round((Math.log(pixels_per_ms / ZOOM_LIMITS.MIN_PPMS) / zoomRange) * 100);

  // The timeline's empty rows and its "+" tile lead straight to the right tool.
  const addFrom = (kind: 'shots' | 'music' | 'text') => {
    if (kind === 'shots') { if (props.onAddLibraryClips) setAddingClips(true); else props.onImport(); }
    else if (kind === 'text') void props.onAddText();
    else if (desktop) openTool('music');
    else setSheet('music');
  };

  const panel = (id: Tab) => {
    if (id === 'ai')
      return (
        <AgentPanel
          onSend={props.onAgent}
          onAutoEdit={props.onAutoEdit}
          onNewTake={props.onRegenerate ? (clipId, note) => void props.onRegenerate!(clipId, { note }) : undefined}
          onRestoreVersion={props.onRestoreVersion}
          hasShots={shots.length > 0}
        />
      );
    if (id === 'clip') return <ClipPanel onSyncToBeat={syncToBeat} onRegenerate={props.onRegenerate} takeStatus={props.takeStatus} />;
    if (id === 'look') return <ColorGradePicker selectedId={timeline?.color_grade_id || 'natural'} onSelect={timelineStore.setGrade} row={!desktop} />;
    if (id === 'format') return <FormatPanel />;
    if (id === 'music') return <MusicPanel onUpload={props.onUploadMusic} onSyncToBeat={syncToBeat} />;
    return <TextPanel onAddText={props.onAddText} onAutoCaptions={props.onAutoCaptions} hasRender={Boolean(props.render.storageKey)} />;
  };

  const pickVideos = () => videoInput.current?.click();
  const onVideosChosen = async (files: FileList | null) => {
    if (!files?.length) return;
    const problem = await props.onUploadVideos([...files]);
    if (problem) toast.error("Couldn't add those videos", { description: problem });
  };

  const emptyHint = (
    <div className="space-y-4">
      <div>
        <p className="text-[17px] font-light tracking-tight text-white">Start your edit</p>
        <p className="mt-1 text-[13px] text-[#9aa3ad]">Bring in your generated shots, or videos from your phone or computer.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={props.onImport} disabled={props.importing} className="ed-gold inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50">
          {props.importing ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} Add my generated shots
        </button>
        <button onClick={pickVideos} disabled={props.importing} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-[13px] text-white transition-colors hover:border-white/30 disabled:opacity-50">
          <Upload size={15} /> From my device
        </button>
      </div>
      {props.onAutoEdit && (
        <button onClick={() => (desktop ? openTool('ai') : setSheet('ai'))} className="mx-auto flex items-center gap-2 text-[13px] text-[#b0b8c4] transition-colors hover:text-gold-100">
          <Wand2 size={14} /> Or let AI cut it for you
        </button>
      )}
    </div>
  );

  const summary = {
    shots: shots.length,
    lengthMs: endMs,
    look: gradeName,
    music: song ? String((song.metadata as { name?: string })?.name || 'Music') : null,
    texts: clips.filter((c) => tracks.find((t) => t.id === c.track_id)?.track_type === 'caption').length,
    format: `${format.label} ${format.ratio}`,
    wide: format.id === 'widescreen',
  };

  const activeTab = TABS.find((t) => t.id === tab)!;

  const header = (
    <header className="relative z-20 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 md:h-16 md:px-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="flex min-w-0 items-center gap-2">
        <Link href={props.backHref} className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[#d6d0c0] transition-all hover:border-white/20 hover:text-white active:scale-90" aria-label="Back">
          <ArrowLeft size={17} />
        </Link>
        <span aria-hidden className="ed-gold hidden size-9 shrink-0 place-items-center rounded-xl md:grid">
          <Scissors size={16} strokeWidth={2.2} />
        </span>
        <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" multiple className="hidden" onChange={(e) => { void onVideosChosen(e.target.files); e.target.value = ''; }} />
        <div className="min-w-0 px-0.5">
          <h1 className="truncate text-[15px] font-medium tracking-tight text-white md:text-base">
            {props.title ? props.title : <>Edit <span className="lux-serif text-gold-200">video</span></>}
          </h1>
          <SaveStatus saving={props.saving} failed={Boolean(props.saveFailed)} short={phone} />
        </div>
      </div>

      {desktop && (
        <div className="ed-glass flex items-center gap-1 rounded-full p-1 pl-3.5">
          <span className="flex items-center gap-2 pr-2 text-xs text-[#9aa3ad]">
            <span className="text-[#e8e2d2]">{format.label}</span>
            <span className="text-[#6f7782]">{format.ratio}</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span className="tabular-nums text-[#e8e2d2]">{formatClock(endMs)}</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span>{shots.length} shot{shots.length === 1 ? '' : 's'}</span>
          </span>
          <ModeSwitch mode={mode} onChange={setMode} compact={false} />
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5">
        {!desktop && <ModeSwitch mode={mode} onChange={setMode} compact />}
        <div className="flex items-center rounded-full border border-white/[0.07] bg-white/[0.025] p-0.5">
          <button onClick={timelineStore.undo} disabled={history.past.length === 0} className={iconButton} aria-label="Undo" title="Undo (⌘Z)">
            <Undo2 size={16} />
          </button>
          <button onClick={timelineStore.redo} disabled={history.future.length === 0} className={iconButton} aria-label="Redo" title="Redo (⇧⌘Z)">
            <Redo2 size={16} />
          </button>
          {props.onListVersions && (
            <button onClick={() => setVersionsOpen(true)} className={iconButton} aria-label="Saved versions" title="Saved versions">
              <History size={16} />
            </button>
          )}
        </div>
        <button
          onClick={() => (props.onAddLibraryClips ? setAddingClips(true) : pickVideos())}
          disabled={props.importing}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-2.5 text-[13px] text-[#ece6d6] transition-colors hover:border-gold-300/45 hover:text-gold-50 disabled:opacity-50 sm:px-3.5"
          aria-label="Add clips"
          title="Add clips from your device or your other work"
        >
          {props.importing ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          <span className="hidden sm:inline">Add clips</span>
        </button>
        {(props.reviews?.length ?? 0) > 0 && (
          <button
            onClick={() => setReviewsOpen(true)}
            className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors hover:bg-white/5 ${openNotes > 0 ? 'border-gold-300/50 text-gold-100' : 'border-white/[0.1] text-[#d6d0c0]'}`}
            title="Review notes"
          >
            <MessageSquare size={14} /> {openNotes > 0 ? `${openNotes}${phone ? '' : ` note${openNotes === 1 ? '' : 's'}`}` : phone ? '' : 'Notes'}
          </button>
        )}
        <AnimatePresence>{props.render.status !== 'idle' && <RenderPill render={props.render} onClick={() => setExportOpen(true)} />}</AnimatePresence>
        {!phone && (
          <button onClick={makeVideo} disabled={shots.length === 0} className="ed-gold flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold disabled:opacity-45">
            <Clapperboard size={15} /> Make video
          </button>
        )}
        {addingClips && props.onAddLibraryClips && props.projectId && (
          <AddClipsDialog
            projectId={props.projectId}
            busy={props.importing}
            onClose={() => setAddingClips(false)}
            onUploadFromDevice={() => { setAddingClips(false); pickVideos(); }}
            onAddClips={props.onAddLibraryClips}
          />
        )}
      </div>
    </header>
  );

  return (
    <EditorModeContext.Provider value={mode}>
      <MotionConfig reducedMotion="user">
        <div className={`ed-backdrop relative isolate flex h-full flex-col overflow-clip ${resizing ? 'cursor-row-resize select-none' : ''}`}>
          {/* Decorative light, in its own clipped layer so it can never make the editor scroll. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="ed-aurora -left-40 -top-40 size-[520px] bg-gold-400/[0.07]" />
            <span className="ed-aurora -right-32 top-1/3 size-[420px] bg-[#b6ddd3]/[0.05] [animation-delay:-8s]" />
          </div>

          {header}
          <Toasts error={props.error} notice={props.notice} onDismissError={props.onDismissError} />

          {desktop ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 flex min-h-0 flex-1 gap-3 px-3 pb-3"
            >
              <ToolRail
                tab={tab}
                open={panelOpen}
                onPick={(id) => (panelOpen && tab === id ? togglePanel() : openTool(id))}
                onToggle={togglePanel}
                onShortcuts={pro ? () => setShortcutsOpen(true) : undefined}
              />

              <AnimatePresence initial={false} onExitComplete={() => setFitSignal((n) => n + 1)}>
                {panelOpen && (
                  <motion.aside
                    key="panel"
                    onAnimationComplete={() => setFitSignal((n) => n + 1)}
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 372, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={spring}
                    className="shrink-0 overflow-hidden"
                    aria-label={activeTab.title}
                  >
                    <div className="ed-glass ed-glass-lit flex h-full w-[372px] flex-col overflow-hidden rounded-[22px]">
                      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 pb-3.5 pt-4">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                            <h2 className="text-[17px] font-medium tracking-tight text-white">
                              {tab === 'ai' ? <>AI <span className="lux-serif text-gold-200">Director</span></> : activeTab.title}
                            </h2>
                            <p className="mt-0.5 text-xs text-[#8f97a1]">{activeTab.blurb}</p>
                          </motion.div>
                        </AnimatePresence>
                        <button onClick={togglePanel} className="grid size-8 shrink-0 place-items-center rounded-full text-[#8f97a1] transition-colors hover:bg-white/[0.06] hover:text-white" aria-label="Hide panel" title="Hide panel (\)">
                          <PanelLeftClose size={16} />
                        </button>
                      </div>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={tab}
                          role="tabpanel"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className={`ed-scroll min-h-0 flex-1 ${tab === 'ai' ? 'flex flex-col' : 'overflow-y-auto'}`}
                        >
                          {panel(tab)}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </motion.aside>
                )}
              </AnimatePresence>

              <div ref={workArea} className="flex min-w-0 flex-1 flex-col">
                <section className="ed-glass ed-glass-lit flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px]">
                  <div className="relative min-h-0 flex-1 px-6 pb-3 pt-5">
                    <PreviewPlayer emptyHint={emptyHint} />
                  </div>
                  <div className="border-t border-white/[0.05] bg-black/20 px-5 pb-3.5 pt-2.5">
                    <Transport
                      shots={shots}
                      endMs={endMs}
                      pro={pro}
                      right={
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => openTool('look')} className={chip} title="Change the look">
                            <span className="size-2 rounded-full bg-[conic-gradient(#e3cf9f,#b6ddd3,#c9b6e8,#e3cf9f)]" /> {gradeName}
                          </button>
                          <button onClick={() => openTool('format')} className={chip} title="Change the video format">
                            {format.ratio} · {timeline?.fps || 24} fps
                          </button>
                        </div>
                      }
                    />
                  </div>
                </section>

                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize the timeline"
                  onPointerDown={startResize}
                  onDoubleClick={() => setStoredHeight(TIMELINE_DEFAULT)}
                  className="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
                  title="Drag to resize · double-click to reset"
                >
                  <span className={`h-1 rounded-full transition-all duration-200 ${resizing ? 'w-16 bg-gold-200 shadow-[0_0_10px_rgba(243,229,192,0.8)]' : 'w-10 bg-white/15 group-hover:w-14 group-hover:bg-white/35'}`} />
                </div>

                <section className="ed-glass flex shrink-0 flex-col overflow-hidden rounded-[22px]" style={{ height: timelineHeight }}>
                  <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.05] px-2.5 py-1.5">
                    <ToolbarButton icon={Scissors} label="Split" title="Split at the playhead (S)" disabled={!canSplit} onClick={() => selected && timelineStore.split(selected.id, playhead_ms)} />
                    <ToolbarButton icon={Trash2} label="Delete" title="Delete (⌫)" disabled={!selected || selectedLocked} onClick={() => selected && timelineStore.removeClip(selected.id)} />
                    <span className="mx-1.5 h-5 w-px bg-white/[0.08]" />
                    <ToolbarButton icon={Type} label="Add text" onClick={() => { void props.onAddText(); }} disabled={shots.length === 0} />
                    <ToolbarButton icon={Music2} label={song ? 'Music' : 'Add music'} onClick={() => openTool('music')} />
                    <ToolbarButton icon={Wand2} label="AI edit" onClick={() => openTool('ai')} accent />
                    <div className="ml-auto flex items-center gap-1">
                      {pro && (
                        <div className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/20 px-1">
                          <button onClick={() => zoomTo(pixels_per_ms / 1.4)} className="grid size-7 place-items-center rounded-full text-[#9aa3ad] hover:text-white" aria-label="Zoom out"><ZoomOut size={14} /></button>
                          <input
                            type="range" min={0} max={100} value={zoomValue} aria-label="Timeline zoom"
                            onChange={(e) => zoomTo(ZOOM_LIMITS.MIN_PPMS * Math.exp((Number(e.target.value) / 100) * zoomRange))}
                            className="w-24 accent-[#d9c08a]"
                          />
                          <button onClick={() => zoomTo(pixels_per_ms * 1.4)} className="grid size-7 place-items-center rounded-full text-[#9aa3ad] hover:text-white" aria-label="Zoom in"><ZoomIn size={14} /></button>
                        </div>
                      )}
                      <button onClick={() => setFitSignal((n) => n + 1)} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-[#9aa3ad] transition-colors hover:bg-white/[0.05] hover:text-white" title="Fit the whole video">
                        <Maximize size={13} /> Fit
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">
                    <TimelinePanel roomy fitSignal={fitSignal} onAdd={addFrom} />
                  </div>
                </section>
              </div>
            </motion.div>
          ) : (
            <div className="relative z-10 flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3 pt-1">
                {/* The stage is only as tall as the picture (at most about half the screen); the timeline gets the rest. */}
                <section className="ed-glass ed-glass-lit shrink-0 rounded-[22px] p-2 sm:p-3">
                  <div style={{ height: `min(44dvh, calc((100vw - ${phone ? 44 : 50}px) * ${frameH / frameW}))` }}>
                    <PreviewPlayer emptyHint={emptyHint} />
                  </div>
                  <div className="mt-2 px-1.5 pb-0.5">
                    <Transport
                      shots={shots}
                      endMs={endMs}
                      pro={pro}
                      compact
                      right={<button onClick={() => setFitSignal((n) => n + 1)} className={iconButton} aria-label="Fit the whole video on the timeline" title="Fit"><Maximize size={16} /></button>}
                    />
                  </div>
                </section>
                <div className="ed-glass min-h-[170px] flex-1 overflow-hidden rounded-[22px]">
                  <TimelinePanel centered={phone} roomy fitSignal={fitSignal} onAdd={addFrom} />
                </div>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {selected && selectedTrack ? (
                  <ContextBar
                    key="context"
                    kind={selectedTrack.track_type}
                    locked={selectedLocked}
                    canSplit={canSplit}
                    position={shots.findIndex((c) => c.id === selected.id)}
                    shotCount={shots.length}
                    onDone={() => timelineStore.selectClip(null)}
                    onSplit={() => timelineStore.split(selected.id, playhead_ms)}
                    onDelete={() => timelineStore.removeClip(selected.id)}
                    onMove={(dir) => timelineStore.reorder(selected.id, shots.findIndex((c) => c.id === selected.id) + dir)}
                    onSettings={() => setSheet('clip')}
                  />
                ) : (
                  <motion.nav key="dock" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={spring} aria-label="Editing tools" className={dockClass}>
                    {TABS.filter((t) => t.id !== 'clip').map(({ id, label, icon: Icon }) => (
                      <button key={id} onClick={() => setSheet(id)} className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-medium text-[#c9c3b4] active:scale-95">
                        <span className={`grid size-9 place-items-center rounded-xl transition-colors group-hover:bg-white/[0.06] ${id === 'ai' ? 'bg-gold-500/15' : 'text-[#e8e2d2]'}`}>
                          {id === 'ai' ? <span className="ed-orb block size-5" aria-hidden /> : <Icon size={19} strokeWidth={1.7} />}
                        </span>
                        {label}
                      </button>
                    ))}
                    {phone && (
                      <button onClick={makeVideo} disabled={shots.length === 0} className="ed-gold ml-1 flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-sm font-semibold disabled:opacity-45">
                        <Clapperboard size={16} /> Make
                      </button>
                    )}
                  </motion.nav>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {sheet && (
                  <ToolSheet
                    key="sheet"
                    title={TABS.find((t) => t.id === sheet)!.title}
                    onClose={() => setSheet(null)}
                    tall={sheet === 'ai'}
                    // Changes you judge by eye keep the preview bright and visible.
                    seeThrough={sheet === 'look' || sheet === 'format'}
                  >
                    {panel(sheet)}
                  </ToolSheet>
                )}
              </AnimatePresence>
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
            review={props.reviews?.find((r) => r.storage_key === props.render.storageKey) ?? null}
            onShareForReview={props.onShareForReview}
            onOpenReviews={() => {
              setExportOpen(false);
              setReviewsOpen(true);
            }}
          />
          {props.onListVersions && props.onRestoreVersion && (
            <VersionsSheet open={versionsOpen} onClose={() => setVersionsOpen(false)} onList={props.onListVersions} onRestore={props.onRestoreVersion} />
          )}
          <ReviewsSheet
            open={reviewsOpen}
            onClose={() => setReviewsOpen(false)}
            shares={props.reviews ?? []}
            onJump={(atMs) => {
              // Notes are pinned to the finished video; find that moment among the shots.
              timelineStore.setPlaying(false);
              timelineStore.setPlayhead(outputToTimelineMs(shots, atMs));
            }}
            onResolve={(id, resolved) => props.onResolveNote?.(id, resolved)}
            onTurnOff={(id) => props.onTurnOffLink?.(id)}
          />
          <AnimatePresence>{shortcutsOpen && <ShortcutsCard onClose={() => setShortcutsOpen(false)} />}</AnimatePresence>
        </div>
      </MotionConfig>
    </EditorModeContext.Provider>
  );
}

/** Simple for creators, Pro for precision; remembered per browser. */
function ModeSwitch({ mode, onChange, compact }: { mode: EditorMode; onChange: (m: EditorMode) => void; compact: boolean }) {
  if (compact) {
    // Phones: one small pill that turns Pro tools on and off, so the title keeps its room.
    return (
      <button
        role="switch"
        aria-checked={mode === 'pro'}
        aria-label="Pro tools"
        onClick={() => onChange(mode === 'pro' ? 'simple' : 'pro')}
        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
          mode === 'pro' ? 'border-gold-300/70 bg-gold-200 text-[#1a160e]' : 'border-white/[0.1] text-[#b0b8c4]'
        }`}
      >
        Pro
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label="Editor mode" className="relative flex items-center rounded-full bg-black/30 p-0.5 text-xs">
      {(['simple', 'pro'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          title={m === 'pro' ? 'Pro: frame timecode, zoom, row controls, exact lengths and shortcuts' : 'Simple: just what you need'}
          className={`relative rounded-full px-3 py-1 font-medium transition-colors ${mode === m ? 'text-[#1a160e]' : 'text-[#b0b8c4] hover:text-white'}`}
        >
          {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-gold-200 shadow-[0_6px_16px_-8px_rgba(227,207,159,0.9)]" transition={spring} />}
          <span className="relative">{m === 'pro' ? 'Pro' : 'Simple'}</span>
        </button>
      ))}
    </div>
  );
}

function SaveStatus({ saving, failed, short = false }: { saving: boolean; failed: boolean; short?: boolean }) {
  const [label, dot] = failed
    ? [short ? 'Retrying save' : 'Not saved yet · retrying', 'bg-amber-300']
    : saving
      ? ['Saving…', 'bg-gold-300 animate-pulse']
      : [short ? 'Saved' : 'All changes saved', 'bg-[#8fd1b9] shadow-[0_0_6px_#8fd1b9]'];
  return (
    <p className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-[#8f97a1]" aria-live="polite">
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
        : 'border-white/[0.12] text-[#e8e2d2]';
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      onClick={onClick}
      className={`flex h-9 items-center gap-2 rounded-full border bg-white/[0.03] px-3 text-[13px] transition-colors hover:bg-white/5 ${tone}`}
    >
      {busy ? (
        <>
          <svg viewBox="0 0 18 18" className="size-[18px] -rotate-90" aria-hidden>
            <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.2" />
            <circle cx="9" cy="9" r={r} fill="none" stroke="#e3cf9f" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, render.progress / 100))} className="transition-[stroke-dashoffset] duration-500" />
          </svg>
          <span className="tabular-nums">{render.progress}%</span>
        </>
      ) : render.status === 'completed' ? (
        <>
          <span className="lux-live-dot size-2 rounded-full bg-gold-300" aria-hidden /> Ready
        </>
      ) : (
        'Didn’t finish'
      )}
    </motion.button>
  );
}

function Toasts({ error, notice, onDismissError }: { error: string | null; notice: string | null; onDismissError: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4 md:top-20">
      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            role="alert"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-red-400/30 bg-[#2a1414]/95 px-4 py-3 text-sm text-red-100 shadow-2xl backdrop-blur"
          >
            <span className="flex-1">{error}</span>
            <button onClick={onDismissError} aria-label="Dismiss" className="text-red-200/70 hover:text-white"><X size={16} /></button>
          </motion.div>
        )}
        {notice && (
          <motion.div
            key={`notice-${notice}`}
            role="status"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            className="ed-glass w-full max-w-md rounded-2xl px-4 py-3 text-sm text-[#dff1ec]"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, title, disabled, onClick, accent = false }: {
  icon: typeof Scissors; label: string; title?: string; disabled?: boolean; onClick: () => void; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-all active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent ${
        accent ? 'text-gold-100 hover:bg-gold-500/15' : 'text-[#d6d0c0] hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

/** Phones: when something is selected, the tool dock becomes that item's actions. */
function ContextBar({ kind, locked, canSplit, position, shotCount, onDone, onSplit, onDelete, onMove, onSettings }: {
  kind: string; locked: boolean; canSplit: boolean; position: number; shotCount: number;
  onDone: () => void; onSplit: () => void; onDelete: () => void; onMove: (dir: -1 | 1) => void; onSettings: () => void;
}) {
  const item = (Icon: typeof Scissors, label: string, onClick: () => void, disabled = false, danger = false) => (
    <button key={label} onClick={onClick} disabled={disabled || locked} className={`group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-medium active:scale-95 disabled:opacity-30 ${danger ? 'text-red-200' : 'text-[#e8e2d2]'}`}>
      <span className="grid size-9 place-items-center rounded-xl group-hover:bg-white/[0.06]"><Icon size={19} strokeWidth={1.7} /></span>
      {label}
    </button>
  );
  return (
    <motion.nav
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      transition={spring}
      aria-label="Selected item"
      className={`${dockClass} !border-gold-400/35`}
    >
      <button onClick={onDone} aria-label="Done" className="grid h-12 w-10 shrink-0 place-items-center rounded-xl bg-gold-500/15 text-gold-200 active:scale-95">
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
    </motion.nav>
  );
}

function ToolSheet({ title, onClose, tall, seeThrough = false, children }: {
  title: string; onClose: () => void; tall: boolean; seeThrough?: boolean; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <motion.button
        aria-label="Close"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`absolute inset-0 z-30 ${seeThrough ? 'bg-transparent' : 'bg-black/45 backdrop-blur-[2px]'}`}
      />
      <motion.div
        role="dialog"
        aria-label={title}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 42 }}
        className={`ed-glass ed-glass-lit absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[28px] !bg-obsidian-900/95 ${
          tall ? 'h-[74%]' : seeThrough ? 'max-h-[48%]' : 'max-h-[62%]'
        }`}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <span className="block h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center justify-between px-4 pb-1">
          <h2 className="text-base font-medium text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-[#b0b8c4] hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
        <div className="ed-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</div>
      </motion.div>
    </>
  );
}

function ShortcutsCard({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={spring}
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="ed-glass ed-glass-lit w-full max-w-sm rounded-3xl !bg-obsidian-900/95 p-6"
        onClick={(e) => e.stopPropagation()}
      >
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
      </motion.div>
    </motion.div>
  );
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type * as React from "react"
import { Button } from "@/interface/components/ui/button"
import { Textarea } from "@/interface/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Clapperboard, ArrowRight, Pencil, Copy, Trash2, GripVertical, StickyNote, Lock, Unlock, CheckCircle2, ListChecks, CopyPlus, Eraser, Plus, Sparkles, RotateCcw, Loader2, ChevronDown, AlertTriangle, X, Link2, ImagePlus, Wand2 } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import { REFERENCE_BUCKET } from "@/core/validation/media-reference"
import type { KieVideoModelFamilyId } from "@/core/config/kie-video-models"
import type { CampaignProvenance } from "@/core/validation/campaign-references"
import type { MediaReference } from "@/core/validation/media-reference"
import type { ShotFrame } from "@/core/validation/shot-frames"
import { SHOT_REVIEW_LABELS, referenceChips, shotReview, type ReferenceChip, type ShotReview } from "./storyboard-continuity"

export type StoryboardItem = {
  mediaReferences?: MediaReference[]
  /** Campaign metadata when the item came from a Campaign Director asset. */
  campaignProvenance?: CampaignProvenance | null
  id: string
  sourceClipId: string | null
  url: string
  subject: string
  prompt: string
  durationSeconds: number
  modelFamilyId?: KieVideoModelFamilyId
  sceneGroup: "Scene A" | "Scene B" | "Scene C"
  note: string
  status: "draft" | "ready"
  createdAt: string
  approvedTakeId?: string | null
  continuityLockCount?: number
  /** What happens in this shot, in the creator's words. */
  direction?: string
  review?: ShotReview
  startFrame?: ShotFrame | null
  /** Captured from the approved take; becomes the next shot's start frame. */
  endFrame?: ShotFrame | null
  previousItemId?: string | null
  /** Full prompt the director built from the short direction. */
  enhancedPrompt?: string | null
  /** The direction text enhancedPrompt was built from; a change triggers a rebuild. */
  enhancedFrom?: string | null
  /** Off: the direction is sent exactly as written. */
  autoEnhance?: boolean
}

type SceneGroupFilter = "All" | "Scene A" | "Scene B" | "Scene C"

interface StoryboardPanelProps {
  items: StoryboardItem[]
  storyboardSource: "local" | "scene"
  projectName?: string | null
  sceneName?: string | null
  isLoading: boolean
  isSyncing: boolean
  onAddCurrentOutput: () => void
  onNewShot: () => void
  onRemoveItem: (id: string) => void
  onDuplicateItem: (id: string) => void
  onUpdateGroup: (id: string, group: "Scene A" | "Scene B" | "Scene C") => void
  onReorder: (draggedId: string, targetId: string) => void
  onUpdateNote: (id: string, note: string) => void
  onSaveNote: (id: string) => void
  onUpdateDirection: (id: string, direction: string) => void
  onSaveDirection: (id: string) => void
  onClearGroup: (group: "Scene A" | "Scene B" | "Scene C") => void
  onDuplicateGroup: (group: "Scene A" | "Scene B" | "Scene C") => void
  onCopyGroupShotList: (group: "Scene A" | "Scene B" | "Scene C") => void
  onGenerateShot: (item: StoryboardItem) => void
  onApproveShot: (item: StoryboardItem) => void
  onContinueToNext: (item: StoryboardItem) => void
  onStartNewScene: (item: StoryboardItem) => void
  onToggleReferenceLock: (item: StoryboardItem, referenceId: string) => void
  onRemoveReference: (item: StoryboardItem, referenceId: string) => void
  onEditShot?: (item: StoryboardItem) => void
  /** Images dropped or picked on a card become references for that shot. */
  onAddReferenceFiles: (item: StoryboardItem, files: File[]) => void
  onPatchItem: (id: string, patch: Partial<StoryboardItem>, persist?: boolean) => void
  onSwitchToBuilder: () => void
  addingReferencesId?: string | null
  /** The shot whose take is being captured as an end frame. */
  approvingId?: string | null
  /** The shot the builder is currently generating into. */
  generatingId?: string | null
  hasOutput: boolean
}

const REVIEW_STYLES: Record<ShotReview, { pill: string; dot: string }> = {
  draft: { pill: "bg-white/5 text-white/60", dot: "bg-white/35" },
  generating: { pill: "bg-gold-400/10 text-gold-100", dot: "animate-pulse bg-gold-300" },
  review: { pill: "bg-sky-400/10 text-sky-100", dot: "bg-sky-300" },
  approved: { pill: "bg-emerald-400/10 text-emerald-100", dot: "bg-emerald-300" },
  failed: { pill: "bg-rose-400/10 text-rose-100", dot: "bg-rose-300" },
}

export function StoryboardPanel({
  items,
  storyboardSource,
  projectName,
  sceneName,
  isLoading,
  isSyncing,
  onAddCurrentOutput,
  onNewShot,
  onRemoveItem,
  onDuplicateItem,
  onUpdateGroup,
  onReorder,
  onUpdateNote,
  onSaveNote,
  onUpdateDirection,
  onSaveDirection,
  onClearGroup,
  onDuplicateGroup,
  onCopyGroupShotList,
  onGenerateShot,
  onApproveShot,
  onContinueToNext,
  onStartNewScene,
  onToggleReferenceLock,
  onRemoveReference,
  onEditShot,
  onAddReferenceFiles,
  onPatchItem,
  onSwitchToBuilder,
  addingReferencesId,
  approvingId,
  generatingId,
  hasOutput,
}: StoryboardPanelProps) {
  const [groupFilter, setGroupFilter] = useState<SceneGroupFilter>("All")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const filteredItems = useMemo(() => {
    if (groupFilter === "All") return items
    return items.filter((item) => item.sceneGroup === groupFilter)
  }, [groupFilter, items])

  const totalRuntime = useMemo(() => items.reduce((sum, item) => sum + (item.url ? item.durationSeconds || 0 : 0), 0), [items])
  const approvedCount = useMemo(() => items.filter((item) => shotReview(item) === "approved").length, [items])

  const groupRuntime = useMemo(() => {
    const runtime = { "Scene A": 0, "Scene B": 0, "Scene C": 0 }
    for (const item of items) if (item.url) runtime[item.sceneGroup] += item.durationSeconds || 0
    return runtime
  }, [items])

  const busy = isLoading || isSyncing

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 rounded-3xl border border-gold-400/[0.12] bg-obsidian-900 text-white shadow-[0_24px_55px_-40px_rgba(0,0,0,0.95)]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="font-serif text-xl tracking-tight text-[#f1ece0]">Storyboard</CardTitle>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-white/55">
              <span>{items.length} shot{items.length !== 1 ? "s" : ""}</span>
              <span className="text-gold-400/40">·</span>
              <span className="text-emerald-200/80">{approvedCount} approved</span>
              <span className="text-gold-400/40">·</span>
              <span className="text-gold-100">{totalRuntime}s</span>
              <span className="text-gold-400/40">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${busy ? "animate-pulse bg-gold-300" : storyboardSource === "scene" ? "bg-emerald-300" : "bg-white/35"}`} />
                {isLoading ? "Loading…" : isSyncing ? "Syncing…" : storyboardSource === "scene" && sceneName ? `Synced to ${projectName} / ${sceneName}` : "Saved on this device"}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-white/35">Choose the shot, say what happens, approve it, then continue.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="studioSecondary" onClick={onNewShot} disabled={busy} className="h-9 px-3 text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" />New shot
            </Button>
            <Button
              type="button"
              onClick={onAddCurrentOutput}
              variant="studio"
              title="Adds the clip you just generated as a new card. It does not link to other shots."
              className="h-9 px-3.5 text-xs font-semibold"
              disabled={busy || !hasOutput}
            >
              <Clapperboard className="mr-1.5 h-3.5 w-3.5" />
              Add to storyboard
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Filter by scene" className="inline-flex rounded-full border border-gold-400/[0.12] bg-black/30 p-0.5">
            {(["All", "Scene A", "Scene B", "Scene C"] as const).map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={groupFilter === group}
                onClick={() => setGroupFilter(group)}
                disabled={isLoading}
                className={`h-7 rounded-full px-3 text-[11px] transition ${groupFilter === group ? "bg-gold-400/20 text-gold-50" : "text-white/60 hover:text-white/90"}`}
              >
                {group === "All" ? "All" : group.replace("Scene ", "")}
                {group !== "All" ? <span className="ml-1 text-white/35">{groupRuntime[group]}s</span> : null}
              </button>
            ))}
          </div>
          {groupFilter !== "All" && (
            <div className="ml-auto flex items-center gap-0.5">
              {([
                { label: "Copy shot list", icon: ListChecks, onClick: () => onCopyGroupShotList(groupFilter), danger: false },
                { label: "Duplicate scene", icon: CopyPlus, onClick: () => onDuplicateGroup(groupFilter), danger: false },
                { label: "Clear scene", icon: Eraser, onClick: () => onClearGroup(groupFilter), danger: true },
              ]).map(({ label, icon: Icon, onClick, danger }) => (
                <button key={label} type="button" title={label} aria-label={label} onClick={onClick} disabled={busy}
                  className={`grid size-8 place-items-center rounded-full transition disabled:opacity-35 ${danger ? "text-rose-200/70 hover:bg-rose-500/10 hover:text-rose-100" : "text-white/60 hover:bg-gold-400/10 hover:text-gold-50"}`}>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1].map((n) => <div key={n} className="h-64 animate-pulse rounded-2xl border border-gold-400/[0.08] bg-white/[0.03]" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gold-400/20 bg-[radial-gradient(circle_at_top,rgba(217,192,138,0.08),transparent_60%)] p-8 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gold-300/30 bg-gold-500/10 text-gold-100">
              <Clapperboard className="h-4 w-4" />
            </div>
            <p className="text-sm text-white/80">No storyboard shots yet</p>
            <p className="mt-1 text-xs text-white/55">Start a new shot here, or generate in Shot Builder and add it.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button type="button" variant="studio" onClick={onNewShot} className="h-9 px-3.5 text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />New shot
              </Button>
              <Button type="button" variant="studioSecondary" onClick={onSwitchToBuilder} className="h-9 px-3.5 text-xs">
                Go to Shot Builder
              </Button>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gold-400/20 bg-white/[0.03] p-6 text-center text-xs text-white/60">
            No shots in {groupFilter}. Switch scene or add more shots.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredItems.map((item) => {
              const shotNumber = items.indexOf(item) + 1
              const previous = item.previousItemId ? items.find((entry) => entry.id === item.previousItemId) : undefined
              return (
                <ShotCard
                  key={item.id}
                  item={item}
                  shotNumber={shotNumber}
                  previousNumber={previous ? items.indexOf(previous) + 1 : null}
                  isSyncing={isSyncing}
                  approving={approvingId === item.id}
                  addingReferences={addingReferencesId === item.id}
                  generating={generatingId === item.id}
                  dragging={draggingId === item.id}
                  dropTarget={dropTargetId === item.id}
                  dragHandlers={{
                    onDragStart: () => setDraggingId(item.id),
                    onDragEnd: () => { setDraggingId(null); setDropTargetId(null) },
                    onDragOver: (event) => { event.preventDefault(); if (draggingId && draggingId !== item.id) setDropTargetId(item.id) },
                    onDragLeave: () => setDropTargetId((current) => (current === item.id ? null : current)),
                    onDrop: () => {
                      setDropTargetId(null)
                      if (!draggingId || draggingId === item.id) return
                      onReorder(draggingId, item.id)
                      setDraggingId(null)
                    },
                  }}
                  actions={{ onRemoveItem, onDuplicateItem, onUpdateGroup, onUpdateNote, onSaveNote, onUpdateDirection, onSaveDirection, onGenerateShot, onApproveShot, onContinueToNext, onStartNewScene, onToggleReferenceLock, onRemoveReference, onEditShot, onAddReferenceFiles, onPatchItem }}
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type ShotActions = Pick<StoryboardPanelProps,
  "onRemoveItem" | "onDuplicateItem" | "onUpdateGroup" | "onUpdateNote" | "onSaveNote" | "onUpdateDirection" | "onSaveDirection"
  | "onGenerateShot" | "onApproveShot" | "onContinueToNext" | "onStartNewScene" | "onToggleReferenceLock" | "onRemoveReference" | "onEditShot"
  | "onAddReferenceFiles" | "onPatchItem">

function ShotCard({ item, shotNumber, previousNumber, isSyncing, approving, addingReferences, generating, dragging, dropTarget, dragHandlers, actions }: {
  item: StoryboardItem
  shotNumber: number
  previousNumber: number | null
  isSyncing: boolean
  approving: boolean
  addingReferences: boolean
  generating: boolean
  dragging: boolean
  dropTarget: boolean
  dragHandlers: Pick<React.HTMLAttributes<HTMLElement>, "onDragStart" | "onDragEnd" | "onDragOver" | "onDragLeave" | "onDrop">
  actions: ShotActions
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [noteOpen, setNoteOpen] = useState(Boolean(item.note))
  const [openChipId, setOpenChipId] = useState<string | null>(null)
  const review: ShotReview = generating ? "generating" : shotReview(item)
  const chips = referenceChips(item.mediaReferences)
  const lockedNames = chips.filter((chip) => chip.locked).map((chip) => chip.label)
  const direction = item.direction ?? ""
  const hasVideo = Boolean(item.url)
  const isContinuation = Boolean(item.previousItemId && item.startFrame)
  const openChip = chips.find((chip) => chip.id === openChipId) ?? null
  const [fileOver, setFileOver] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files")
  const canAddReferences = !isSyncing && !addingReferences && chips.length < 6
  const autoEnhance = item.autoEnhance !== false

  return (
    <article
      draggable
      {...dragHandlers}
      onDragOver={(event) => {
        if (hasFiles(event)) { event.preventDefault(); if (canAddReferences) setFileOver(true); return }
        dragHandlers.onDragOver?.(event)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileOver(false)
        dragHandlers.onDragLeave?.(event)
      }}
      onDrop={(event) => {
        if (hasFiles(event)) {
          event.preventDefault()
          setFileOver(false)
          if (canAddReferences) actions.onAddReferenceFiles(item, Array.from(event.dataTransfer.files))
          return
        }
        dragHandlers.onDrop?.(event)
      }}
      className={`group/shot relative animate-in fade-in-0 slide-in-from-bottom-1 duration-300 overflow-hidden rounded-2xl border bg-gradient-to-b from-white/[0.035] to-black/30 transition ${
        dropTarget || fileOver ? "border-gold-300/70 ring-2 ring-gold-300/25" : review === "approved" ? "border-emerald-300/25" : "border-gold-400/[0.14] hover:border-gold-300/30"
      } ${dragging ? "opacity-40" : ""}`}
    >
      {fileOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="text-center">
            <ImagePlus className="mx-auto h-6 w-6 text-gold-200" />
            <p className="mt-2 text-[12px] font-medium text-gold-50">Drop images to use in this shot</p>
            <p className="mt-0.5 text-[10.5px] text-white/55">Characters, products or places. Tagged automatically.</p>
          </div>
        </div>
      ) : null}
      <input ref={picker} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" aria-label="Add reference images"
        onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length) actions.onAddReferenceFiles(item, files) }} />
      <header className="flex items-center gap-2 px-3 pt-3">
        <GripVertical aria-hidden className="h-4 w-4 shrink-0 cursor-grab text-white/25 transition group-hover/shot:text-gold-300/70 active:cursor-grabbing" />
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-gold-300/35 bg-gold-400/10 font-serif text-[12px] text-gold-100">{shotNumber}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium tracking-tight text-[#f1ece0]">{item.subject || "Storyboard shot"}</p>
          <p className="truncate text-[10.5px] text-white/40">{item.durationSeconds}s · {item.sceneGroup}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] ${REVIEW_STYLES[review].pill}`}>
          <span className={`size-1.5 rounded-full ${REVIEW_STYLES[review].dot}`} />
          {SHOT_REVIEW_LABELS[review]}
        </span>
      </header>

      <div className="relative mx-3 mt-3 overflow-hidden rounded-xl border border-gold-400/[0.12] bg-black/50">
        {hasVideo ? (
          <video
            key={item.url}
            src={`/api/media/proxy?url=${encodeURIComponent(item.url)}`}
            className="aspect-video w-full object-cover"
            controls
            playsInline
            preload="metadata"
          />
        ) : item.startFrame ? (
          <div className="relative aspect-video w-full">
            <FrameImage assetPath={item.startFrame.assetPath} alt="Starting image" />
            <div className="absolute inset-0 grid place-items-center bg-black/45 text-center">
              {review === "generating" ? <Loader2 className="h-5 w-5 animate-spin text-gold-200" /> : <p className="px-6 text-[11px] text-white/75">Starts from this image. Describe what happens, then generate.</p>}
            </div>
          </div>
        ) : (
          <div className={`grid aspect-video w-full place-items-center px-6 text-center ${review === "generating" ? "animate-pulse bg-gold-400/[0.05]" : ""}`}>
            {review === "generating" ? <Loader2 className="h-5 w-5 animate-spin text-gold-300/70" /> : <p className="text-[11px] text-white/45">Describe what happens, then generate this shot.</p>}
          </div>
        )}
      </div>

      <div className="space-y-2.5 px-3 pb-3 pt-2.5">
        {isContinuation && review === "draft" ? (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.05] px-2.5 py-2 text-[11px] text-emerald-50/90">
            <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />Continuing from Shot {previousNumber ?? "before"}</p>
            {lockedNames.length ? <p className="mt-0.5 pl-5 text-white/55">{joinNames(lockedNames)} will stay consistent.</p> : null}
            <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5">
              {actions.onEditShot ? <button type="button" onClick={() => actions.onEditShot?.(item)} className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] text-white/70 transition hover:border-gold-300/40 hover:text-gold-50">Change references</button> : null}
              <button type="button" onClick={() => actions.onStartNewScene(item)} className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] text-white/70 transition hover:border-gold-300/40 hover:text-gold-50">Start new scene instead</button>
            </div>
          </div>
        ) : null}

        <div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[10.5px] text-white/40">Using</span>
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  aria-expanded={openChipId === chip.id}
                  onClick={() => setOpenChipId((current) => (current === chip.id ? null : chip.id))}
                  title={chipTitle(chip)}
                  className={`inline-flex max-w-[11rem] items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] transition ${
                    chip.binding === "off" ? "border border-amber-300/30 text-amber-100"
                      : chip.binding === "sent" ? "bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/20"
                        : "border border-gold-400/20 text-[#d4cfc0] hover:border-gold-300/40"
                  } ${openChipId === chip.id ? "ring-1 ring-gold-300/40" : ""}`}
                >
                  <span className="truncate">{chip.label}</span>
                  {chip.binding === "off" ? <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> : chip.binding === "sent" ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> : null}
                  {chip.locked ? <Lock className="h-2.5 w-2.5 shrink-0 text-gold-300" /> : null}
                </button>
              ))}
              {addingReferences ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/20 px-2 py-0.5 text-[10.5px] text-gold-100"><Loader2 className="h-2.5 w-2.5 animate-spin" />Adding…</span>
              ) : chips.length < 6 ? (
                <button type="button" onClick={() => picker.current?.click()} disabled={!canAddReferences}
                  title="Add or drop character, product or location images"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-gold-400/30 px-2 py-0.5 text-[10.5px] text-white/55 transition hover:border-gold-300/60 hover:text-gold-50 disabled:opacity-40">
                  <ImagePlus className="h-2.5 w-2.5" />{chips.length ? "Image" : "Add or drop images"}
                </button>
              ) : null}
            </div>
            {openChip ? (
              <div className="mt-1.5 rounded-xl border border-gold-400/[0.16] bg-black/40 p-2.5 text-[11px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#f1ece0]">{openChip.label}</p>
                    <p className="mt-0.5 text-white/50">
                      <span className="capitalize">{openChip.role}</span> · {openChip.locked ? "Locked for this shot" : "Not locked"} · {chipTitle(openChip)}
                    </p>
                  </div>
                  <button type="button" aria-label="Close" onClick={() => setOpenChipId(null)} className="text-white/40 hover:text-white/80"><X className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {actions.onEditShot ? <button type="button" onClick={() => actions.onEditShot?.(item)} className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] text-white/75 hover:border-gold-300/40 hover:text-gold-50">Change</button> : null}
                  <button type="button" onClick={() => actions.onToggleReferenceLock(item, openChip.id)} disabled={isSyncing} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] text-white/75 hover:border-gold-300/40 hover:text-gold-50">
                    {openChip.locked ? <><Unlock className="h-2.5 w-2.5" />Unlock for this shot</> : <><Lock className="h-2.5 w-2.5" />Lock for this shot</>}
                  </button>
                  <button type="button" onClick={() => { setOpenChipId(null); actions.onRemoveReference(item, openChip.id) }} disabled={isSyncing} className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] text-rose-200/80 hover:border-rose-300/40">Remove from this shot</button>
                </div>
              </div>
            ) : null}
        </div>

        {item.startFrame ? (
          <div className="flex items-center gap-2 text-[10.5px] text-white/50">
            <span>Starts from</span>
            <span className="relative h-7 w-12 shrink-0 overflow-hidden rounded-md border border-gold-400/20">
              <FrameImage assetPath={item.startFrame.assetPath} alt="Start frame" />
            </span>
            <span className="inline-flex min-w-0 items-center gap-1 truncate text-white/65"><Link2 className="h-3 w-3 shrink-0" />{previousNumber ? `Shot ${previousNumber} ending` : item.startFrame.sourceLabel || "Starting image"}</span>
          </div>
        ) : null}

        <label className="block">
          <span className="text-[10.5px] text-white/45">{hasVideo ? "What happens in this shot" : "What happens next?"}</span>
          <Textarea
            value={direction}
            onChange={(event) => actions.onUpdateDirection(item.id, event.target.value)}
            onBlur={() => actions.onSaveDirection(item.id)}
            placeholder={hasVideo ? "Describe the action…" : "Short is fine, e.g. puts the earbud in, eyes closed, enjoying it"}
            maxLength={1200}
            className="mt-1 min-h-14 rounded-xl border-gold-400/[0.12] bg-black/30 text-[11.5px] leading-relaxed text-white placeholder:text-white/30"
          />
        </label>

        <div className="space-y-1.5">
          {review === "approved" ? (
            <Button type="button" variant="studio" onClick={() => actions.onContinueToNext(item)} disabled={isSyncing} className="h-9 w-full text-[11.5px] font-semibold">
              <ArrowRight className="mr-1.5 h-3.5 w-3.5" />Continue to next shot
            </Button>
          ) : hasVideo ? (
            <Button type="button" onClick={() => actions.onApproveShot(item)} disabled={isSyncing || approving || generating}
              className="h-9 w-full rounded-xl border border-emerald-300/35 bg-emerald-400/15 text-[11.5px] font-semibold text-emerald-50 hover:bg-emerald-400/25">
              {approving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              {approving ? "Saving end frame…" : "Approve take"}
            </Button>
          ) : (
            <Button type="button" variant="studio" onClick={() => actions.onGenerateShot(item)} disabled={isSyncing || generating} className="h-9 w-full text-[11.5px] font-semibold">
              {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              {generating ? "Generating…" : "Generate shot"}
            </Button>
          )}
          {hasVideo ? (
            <Button type="button" variant="studioSecondary" onClick={() => actions.onGenerateShot(item)} disabled={isSyncing || generating || approving} className="h-8 w-full text-[11px]">
              {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
              {generating ? "Generating…" : "Regenerate this shot"}
            </Button>
          ) : null}
        </div>

        <details className="group/more rounded-xl border border-gold-400/[0.1] bg-black/20">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-2.5 py-1.5 text-[10.5px] text-white/50 hover:text-white/80 [&::-webkit-details-marker]:hidden">
            More options
            <ChevronDown className="h-3 w-3 transition group-open/more:rotate-180" />
          </summary>
          <div className="space-y-2.5 border-t border-gold-400/[0.08] px-2.5 pb-2.5 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-white/60"><Wand2 className="h-3 w-3 text-gold-300" />Auto-enhance short directions</span>
              <button type="button" role="switch" aria-checked={autoEnhance} aria-label="Auto-enhance short directions"
                onClick={() => actions.onPatchItem(item.id, { autoEnhance: !autoEnhance })}
                className={`relative h-5 w-9 rounded-full transition ${autoEnhance ? "bg-gold-400/70" : "bg-white/15"}`}>
                <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${autoEnhance ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            {autoEnhance && item.enhancedPrompt ? (
              <label className="block">
                <span className="text-[10px] text-white/40">
                  Full prompt sent to the model{(item.enhancedFrom || "").trim() !== direction.trim() ? " (rebuilt on next generate)" : ""}
                </span>
                <Textarea
                  value={item.enhancedPrompt}
                  onChange={(event) => actions.onPatchItem(item.id, { enhancedPrompt: event.target.value, enhancedFrom: direction.trim() }, false)}
                  onBlur={() => actions.onPatchItem(item.id, { enhancedPrompt: (item.enhancedPrompt || "").trim() || null })}
                  maxLength={1200}
                  className="mt-1 min-h-20 rounded-xl border-gold-400/[0.12] bg-black/30 text-[10.5px] leading-relaxed text-white/75"
                />
              </label>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] text-white/45">Scene</span>
              <div role="radiogroup" aria-label="Scene" className="inline-flex rounded-full border border-gold-400/[0.12] bg-black/30 p-0.5">
                {(["Scene A", "Scene B", "Scene C"] as const).map((group) => (
                  <button key={group} type="button" role="radio" aria-checked={item.sceneGroup === group} aria-label={group}
                    onClick={() => actions.onUpdateGroup(item.id, group)} disabled={isSyncing}
                    className={`h-6 min-w-7 rounded-full px-2 text-[10.5px] transition ${item.sceneGroup === group ? "bg-gold-400/20 text-gold-50" : "text-white/45 hover:text-white/85"}`}>
                    {group.replace("Scene ", "")}
                  </button>
                ))}
              </div>
            </div>
            {noteOpen ? (
              <Textarea
                value={item.note}
                onChange={(event) => actions.onUpdateNote(item.id, event.target.value)}
                onBlur={() => actions.onSaveNote(item.id)}
                placeholder="Director note…"
                className="min-h-12 rounded-xl border-gold-400/[0.12] bg-black/30 text-[11px] text-white placeholder:text-white/30"
              />
            ) : (
              <button type="button" onClick={() => setNoteOpen(true)} className="inline-flex items-center gap-1 text-[10.5px] text-white/50 hover:text-gold-100">
                <StickyNote className="h-3 w-3" />Add director note
              </button>
            )}
            <div className="flex items-center gap-1">
              {actions.onEditShot ? (
                <button type="button" onClick={() => actions.onEditShot?.(item)} disabled={isSyncing}
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[10.5px] text-white/60 transition hover:bg-gold-400/10 hover:text-gold-50">
                  <Pencil className="h-3 w-3" />Open in Shot Builder
                </button>
              ) : null}
              <button type="button" onClick={() => actions.onDuplicateItem(item.id)} disabled={isSyncing}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[10.5px] text-white/60 transition hover:bg-gold-400/10 hover:text-gold-50">
                <Copy className="h-3 w-3" />Duplicate
              </button>
              {confirmingRemove ? (
                <button type="button" autoFocus onBlur={() => setConfirmingRemove(false)} onClick={() => { setConfirmingRemove(false); actions.onRemoveItem(item.id) }} disabled={isSyncing}
                  className="ml-auto h-7 rounded-full bg-rose-500/20 px-3 text-[10.5px] text-rose-100 hover:bg-rose-500/30">
                  Remove?
                </button>
              ) : (
                <button type="button" title="Remove shot" aria-label="Remove shot" onClick={() => setConfirmingRemove(true)} disabled={isSyncing}
                  className="ml-auto grid size-7 place-items-center rounded-full text-white/40 transition hover:bg-rose-500/10 hover:text-rose-200">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </details>
      </div>
    </article>
  )
}

function chipTitle(chip: ReferenceChip) {
  if (chip.binding === "sent") return "Sent to the video model as an image"
  if (chip.binding === "guide") return "Used as written guidance (this model cannot take it as an image)"
  return "Not used in this generation"
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

function FrameImage({ assetPath, alt }: { assetPath: string; alt: string }) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    let cancelled = false
    void createClient().storage.from(REFERENCE_BUCKET).createSignedUrl(assetPath, 3600).then(({ data }) => { if (!cancelled && data) setUrl(data.signedUrl) })
    return () => { cancelled = true }
  }, [assetPath])
  // Private signed URLs must not pass through the image optimizer cache.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className="absolute inset-0 h-full w-full object-cover" /> : <div className="lux-shimmer absolute inset-0" />
}

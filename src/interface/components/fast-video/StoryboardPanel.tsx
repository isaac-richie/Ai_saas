"use client"

import { useMemo, useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { Textarea } from "@/interface/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Clapperboard, ArrowRight, Pencil, Copy, Trash2, GripVertical, StickyNote, Lock, CheckCircle2, ListChecks, CopyPlus, Eraser } from "lucide-react"
import type { KieVideoModelFamilyId } from "@/core/config/kie-video-models"
import type { CampaignProvenance } from "@/core/validation/campaign-references"
import type { MediaReference } from "@/core/validation/media-reference"

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
  onRemoveItem: (id: string) => void
  onDuplicateItem: (id: string) => void
  onUpdateGroup: (id: string, group: "Scene A" | "Scene B" | "Scene C") => void
  onReorder: (draggedId: string, targetId: string) => void
  onUpdateNote: (id: string, note: string) => void
  onSaveNote: (id: string) => void
  onClearGroup: (group: "Scene A" | "Scene B" | "Scene C") => void
  onDuplicateGroup: (group: "Scene A" | "Scene B" | "Scene C") => void
  onCopyGroupShotList: (group: "Scene A" | "Scene B" | "Scene C") => void
  onContinueFromShot?: (item: StoryboardItem) => void
  onEditShot?: (item: StoryboardItem) => void
  onSwitchToBuilder: () => void
  hasOutput: boolean
}

export function StoryboardPanel({
  items,
  storyboardSource,
  projectName,
  sceneName,
  isLoading,
  isSyncing,
  onAddCurrentOutput,
  onRemoveItem,
  onDuplicateItem,
  onUpdateGroup,
  onReorder,
  onUpdateNote,
  onSaveNote,
  onClearGroup,
  onDuplicateGroup,
  onCopyGroupShotList,
  onContinueFromShot,
  onEditShot,
  onSwitchToBuilder,
  hasOutput,
}: StoryboardPanelProps) {
  const [groupFilter, setGroupFilter] = useState<SceneGroupFilter>("All")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set())

  const filteredItems = useMemo(() => {
    if (groupFilter === "All") return items
    return items.filter((item) => item.sceneGroup === groupFilter)
  }, [groupFilter, items])

  const totalRuntime = useMemo(() => items.reduce((sum, item) => sum + (item.durationSeconds || 0), 0), [items])

  const groupRuntime = useMemo(() => {
    const runtime = { "Scene A": 0, "Scene B": 0, "Scene C": 0 }
    for (const item of items) runtime[item.sceneGroup] += item.durationSeconds || 0
    return runtime
  }, [items])

  const sceneCount = useMemo(() => new Set(items.map((i) => i.sceneGroup)).size, [items])
  const busy = isLoading || isSyncing

  const toggleNote = (id: string) => setOpenNotes((open) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 rounded-3xl border border-gold-400/[0.12] bg-obsidian-900 text-white shadow-[0_24px_55px_-40px_rgba(0,0,0,0.95)]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="font-serif text-xl tracking-tight text-[#f1ece0]">Storyboard</CardTitle>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-white/55">
              <span>{items.length} shot{items.length !== 1 ? "s" : ""}</span>
              <span className="text-gold-400/40">·</span>
              <span>{sceneCount} scene{sceneCount !== 1 ? "s" : ""}</span>
              <span className="text-gold-400/40">·</span>
              <span className="text-gold-100">{totalRuntime}s total</span>
              <span className="text-gold-400/40">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${isLoading || isSyncing ? "animate-pulse bg-gold-300" : storyboardSource === "scene" ? "bg-emerald-300" : "bg-white/35"}`} />
                {isLoading ? "Loading…" : isSyncing ? "Syncing…" : storyboardSource === "scene" && sceneName ? `Synced to ${projectName} / ${sceneName}` : "Saved on this device"}
              </span>
            </p>
          </div>
          <Button
            type="button"
            onClick={onAddCurrentOutput}
            className="h-9 rounded-xl border border-gold-300/35 bg-gold-400/15 px-3.5 text-xs font-medium text-gold-50 hover:bg-gold-400/25"
            disabled={busy || !hasOutput}
          >
            <Clapperboard className="mr-1.5 h-3.5 w-3.5" />
            Add current output
          </Button>
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
            <p className="mt-1 text-xs text-white/55">Generate in Shot Builder and add your best outputs to start sequence planning.</p>
            <Button type="button" onClick={onSwitchToBuilder} className="mt-4 h-9 rounded-xl border border-gold-400/[0.12] bg-white/5 px-3.5 text-xs text-white/85 hover:bg-gold-400/[0.1]">
              Go to Shot Builder
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gold-400/20 bg-white/[0.03] p-6 text-center text-xs text-white/60">
            No shots in {groupFilter}. Switch scene or add more outputs.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredItems.map((item) => {
              const shotNumber = items.indexOf(item) + 1
              const noteOpen = openNotes.has(item.id) || Boolean(item.note)
              return (
                <article
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggingId(item.id)}
                  onDragEnd={() => { setDraggingId(null); setDropTargetId(null) }}
                  onDragOver={(event) => { event.preventDefault(); if (draggingId && draggingId !== item.id) setDropTargetId(item.id) }}
                  onDragLeave={() => setDropTargetId((current) => (current === item.id ? null : current))}
                  onDrop={() => {
                    setDropTargetId(null)
                    if (!draggingId || draggingId === item.id) return
                    onReorder(draggingId, item.id)
                    setDraggingId(null)
                  }}
                  className={`group/shot animate-in fade-in-0 slide-in-from-bottom-1 duration-300 overflow-hidden rounded-2xl border bg-gradient-to-b from-white/[0.035] to-black/30 transition ${
                    dropTargetId === item.id ? "border-gold-300/70 ring-2 ring-gold-300/25" : "border-gold-400/[0.14] hover:border-gold-300/30"
                  } ${draggingId === item.id ? "opacity-40" : ""}`}
                >
                  <header className="flex items-center gap-2 px-3 pt-3">
                    <GripVertical aria-hidden className="h-4 w-4 shrink-0 cursor-grab text-white/25 transition group-hover/shot:text-gold-300/70 active:cursor-grabbing" />
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-gold-300/35 bg-gold-400/10 font-serif text-[12px] text-gold-100">{shotNumber}</span>
                    <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-tight text-[#f1ece0]">{item.subject || "Storyboard shot"}</p>
                    {item.approvedTakeId ? <CheckCircle2 aria-label="Approved take" className="h-4 w-4 shrink-0 text-emerald-300" /> : null}
                    {(item.continuityLockCount ?? 0) > 0 ? (
                      <span title="Continuity locks" className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gold-400/10 px-1.5 py-0.5 text-[10px] text-gold-200">
                        <Lock className="h-2.5 w-2.5" />{item.continuityLockCount}
                      </span>
                    ) : null}
                  </header>

                  <div className="relative mx-3 mt-3 overflow-hidden rounded-xl border border-gold-400/[0.12] bg-black/50">
                    <video
                      src={`/api/media/proxy?url=${encodeURIComponent(item.url)}`}
                      className="aspect-video w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                      onError={(e) => {
                        const target = e.currentTarget
                        target.style.display = "none"
                        const fallback = target.parentElement?.querySelector(".video-fallback") as HTMLElement | null
                        if (fallback) fallback.style.display = "flex"
                      }}
                    />
                    <div className="video-fallback hidden aspect-video w-full items-center justify-center text-[10px] text-white/40">Video unavailable</div>
                    <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur">{item.durationSeconds}s</span>
                  </div>

                  <div className="px-3 pb-3">
                    <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/45">{item.prompt}</p>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <div role="radiogroup" aria-label="Scene" className="inline-flex rounded-full border border-gold-400/[0.12] bg-black/30 p-0.5">
                        {(["Scene A", "Scene B", "Scene C"] as const).map((group) => (
                          <button
                            key={group}
                            type="button"
                            role="radio"
                            aria-checked={item.sceneGroup === group}
                            aria-label={group}
                            onClick={() => onUpdateGroup(item.id, group)}
                            disabled={isSyncing}
                            className={`h-6 min-w-7 rounded-full px-2 text-[10.5px] transition ${item.sceneGroup === group ? "bg-gold-400/20 text-gold-50" : "text-white/45 hover:text-white/85"}`}
                          >
                            {group.replace("Scene ", "")}
                          </button>
                        ))}
                      </div>
                      {!noteOpen ? (
                        <button type="button" onClick={() => toggleNote(item.id)} className="inline-flex items-center gap-1 text-[11px] text-white/45 transition hover:text-gold-100">
                          <StickyNote className="h-3 w-3" />Add note
                        </button>
                      ) : null}
                    </div>

                    {noteOpen ? (
                      <Textarea
                        value={item.note}
                        onChange={(event) => onUpdateNote(item.id, event.target.value)}
                        onBlur={() => onSaveNote(item.id)}
                        autoFocus={!item.note}
                        placeholder="Director note…"
                        className="mt-2 min-h-14 rounded-xl border-gold-400/[0.12] bg-black/30 text-[11.5px] text-white placeholder:text-white/30"
                      />
                    ) : null}

                    <div className="mt-2.5 flex items-center gap-1.5">
                      {onContinueFromShot ? (
                        <Button type="button" onClick={() => onContinueFromShot(item)} disabled={isSyncing}
                          className="h-8 flex-1 rounded-xl border border-gold-300/35 bg-gold-400/15 text-[11px] font-medium text-gold-50 hover:bg-gold-400/25">
                          <ArrowRight className="mr-1 h-3.5 w-3.5" />Continue
                        </Button>
                      ) : null}
                      {onEditShot ? (
                        <button type="button" title="Edit shot" aria-label="Edit shot" onClick={() => onEditShot(item)} disabled={isSyncing}
                          className="grid size-8 place-items-center rounded-full text-white/60 transition hover:bg-gold-400/10 hover:text-gold-50 disabled:opacity-35">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button type="button" title="Duplicate shot" aria-label="Duplicate shot" onClick={() => onDuplicateItem(item.id)} disabled={isSyncing}
                        className="grid size-8 place-items-center rounded-full text-white/60 transition hover:bg-gold-400/10 hover:text-gold-50 disabled:opacity-35">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {confirmingRemoveId === item.id ? (
                        <button type="button" onClick={() => { setConfirmingRemoveId(null); onRemoveItem(item.id) }} onBlur={() => setConfirmingRemoveId(null)} autoFocus disabled={isSyncing}
                          className="ml-auto h-8 rounded-full bg-rose-500/20 px-3 text-[11px] text-rose-100 transition hover:bg-rose-500/30">
                          Remove?
                        </button>
                      ) : (
                        <button type="button" title="Remove shot" aria-label="Remove shot" onClick={() => setConfirmingRemoveId(item.id)} disabled={isSyncing}
                          className="ml-auto grid size-8 place-items-center rounded-full text-white/40 transition hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-35">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

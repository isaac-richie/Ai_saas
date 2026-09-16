"use client"

import { useMemo, useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { Textarea } from "@/interface/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Clapperboard, ArrowRight, Pencil } from "lucide-react"
import type { KieVideoModelFamilyId } from "@/core/config/kie-video-models"
import type { MediaReference } from "@/core/validation/media-reference"

export type StoryboardItem = {
  mediaReferences?: MediaReference[]
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

  const filteredItems = useMemo(() => {
    if (groupFilter === "All") return items
    return items.filter((item) => item.sceneGroup === groupFilter)
  }, [groupFilter, items])

  const totalRuntime = useMemo(
    () => items.reduce((sum, item) => sum + (item.durationSeconds || 0), 0),
    [items]
  )

  const groupRuntime = useMemo(() => ({
    "Scene A": items.filter((i) => i.sceneGroup === "Scene A").reduce((s, i) => s + (i.durationSeconds || 0), 0),
    "Scene B": items.filter((i) => i.sceneGroup === "Scene B").reduce((s, i) => s + (i.durationSeconds || 0), 0),
    "Scene C": items.filter((i) => i.sceneGroup === "Scene C").reduce((s, i) => s + (i.durationSeconds || 0), 0),
  }), [items])

  const sceneCount = useMemo(() => {
    const groups = new Set(items.map((i) => i.sceneGroup))
    return groups.size
  }, [items])

  return (
    <Card className="hover-lift animate-in fade-in-0 slide-in-from-bottom-2 duration-500 rounded-3xl border border-white/12 bg-[#0b0f14] text-white shadow-[0_24px_55px_-40px_rgba(0,0,0,0.95)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Storyboard</CardTitle>
            <p className="mt-1 text-xs text-white/50">Arrange your shots, add notes, and refine sequence flow.</p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-white/65">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                {storyboardSource === "scene" && sceneName
                  ? `Synced to ${projectName} / ${sceneName}`
                  : "Stored locally"}
              </span>
              {isLoading && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-cyan-100">Loading scene board...</span>
              )}
              {isSyncing && (
                <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2 py-0.5 text-cyan-100">Syncing changes...</span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-white/65">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                {sceneCount} scene{sceneCount !== 1 ? "s" : ""} &middot; {items.length} shot{items.length !== 1 ? "s" : ""} &middot; {totalRuntime}s
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">Scene A: {groupRuntime["Scene A"]}s</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">Scene B: {groupRuntime["Scene B"]}s</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">Scene C: {groupRuntime["Scene C"]}s</span>
            </div>
          </div>

          <Button
            type="button"
            onClick={onAddCurrentOutput}
            className="h-10 rounded-xl border border-cyan-300/35 bg-cyan-500/12 text-xs text-cyan-100 hover:bg-cyan-500/20"
            disabled={isLoading || isSyncing || !hasOutput}
          >
            <Clapperboard className="mr-1.5 h-3.5 w-3.5" />
            Add Current Output
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Scene group filter tabs */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
          {(["All", "Scene A", "Scene B", "Scene C"] as const).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setGroupFilter(group)}
              className={`h-8 rounded-full border px-3 text-[11px] transition ${
                groupFilter === group
                  ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                  : "border-white/12 bg-white/5 text-white/75 hover:bg-white/10"
              }`}
              disabled={isLoading}
            >
              {group}
              {group !== "All" ? ` (${groupRuntime[group]}s)` : ""}
            </button>
          ))}

          {groupFilter !== "All" && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="liquidMetal"
                onClick={() => onCopyGroupShotList(groupFilter)}
                className="h-8 px-2.5 text-[11px]"
                disabled={isLoading || isSyncing}
              >
                Copy List
              </Button>
              <Button
                type="button"
                variant="liquidMetalCyan"
                onClick={() => onDuplicateGroup(groupFilter)}
                className="h-8 px-2.5 text-[11px]"
                disabled={isLoading || isSyncing}
              >
                Duplicate Group
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onClearGroup(groupFilter)}
                className="h-8 rounded-lg border border-rose-300/20 bg-rose-500/10 px-2.5 text-[11px] text-rose-100 hover:bg-rose-500/20"
                disabled={isLoading || isSyncing}
              >
                Clear Group
              </Button>
            </div>
          )}
        </div>

        {/* Shot cards */}
        {isLoading ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-xs text-white/60">
            Loading storyboard for the selected scene...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_60%)] p-8 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/10 text-cyan-100">
              <Clapperboard className="h-4 w-4" />
            </div>
            <p className="text-sm text-white/80">No storyboard shots yet</p>
            <p className="mt-1 text-xs text-white/55">Generate in Shot Builder and add your best outputs to start sequence planning.</p>
            <Button
              type="button"
              onClick={onSwitchToBuilder}
              className="mt-4 h-9 rounded-xl border border-white/12 bg-white/5 px-3.5 text-xs text-white/85 hover:bg-white/12"
            >
              Go to Shot Builder
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-xs text-white/60">
            No shots in {groupFilter}. Switch group or add more outputs.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredItems.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggingId || draggingId === item.id) return
                  onReorder(draggingId, item.id)
                  setDraggingId(null)
                }}
                className="hover-lift animate-in fade-in-0 slide-in-from-bottom-1 duration-300 rounded-2xl border border-white/12 bg-[#111822] p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-white/85">Shot {index + 1}</p>
                    {item.approvedTakeId && (
                      <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">
                        Approved
                      </span>
                    )}
                    {(item.continuityLockCount ?? 0) > 0 && (
                      <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-300">
                        {item.continuityLockCount} lock{(item.continuityLockCount ?? 0) !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/65">{item.durationSeconds}s</span>
                    <select
                      value={item.sceneGroup}
                      onChange={(event) => onUpdateGroup(item.id, event.target.value as "Scene A" | "Scene B" | "Scene C")}
                      className="h-6 rounded-md border border-white/12 bg-white/5 px-1.5 text-[10px] text-white"
                      disabled={isSyncing}
                    >
                      <option value="Scene A" className="bg-[#0f1012]">Scene A</option>
                      <option value="Scene B" className="bg-[#0f1012]">Scene B</option>
                      <option value="Scene C" className="bg-[#0f1012]">Scene C</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  <video
                    src={`/api/media/proxy?url=${encodeURIComponent(item.url)}`}
                    className="aspect-video w-full object-cover"
                    muted
                    playsInline
                    onError={(e) => {
                      const target = e.currentTarget
                      target.style.display = "none"
                      const fallback = target.parentElement?.querySelector(".video-fallback") as HTMLElement | null
                      if (fallback) fallback.style.display = "flex"
                    }}
                  />
                  <div className="video-fallback hidden aspect-video w-full items-center justify-center text-[10px] text-white/40">
                    Video unavailable
                  </div>
                </div>

                <p className="mt-2 line-clamp-1 text-xs text-white/85">{item.subject || "Storyboard shot"}</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-white/45">{item.prompt}</p>

                <Textarea
                  value={item.note}
                  onChange={(event) => onUpdateNote(item.id, event.target.value)}
                  onBlur={() => onSaveNote(item.id)}
                  placeholder="Add director note..."
                  className="mt-2 min-h-20 rounded-xl border-white/10 bg-white/5 text-xs text-white placeholder:text-white/35"
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  {onContinueFromShot && (
                    <Button
                      type="button"
                      variant="liquidMetalCyan"
                      onClick={() => onContinueFromShot(item)}
                      className="h-8 px-2.5 text-[11px]"
                      disabled={isSyncing}
                    >
                      <ArrowRight className="mr-1 h-3 w-3" />
                      Continue
                    </Button>
                  )}
                  {onEditShot && (
                    <Button
                      type="button"
                      variant="liquidMetal"
                      onClick={() => onEditShot(item)}
                      className="h-8 px-2.5 text-[11px]"
                      disabled={isSyncing}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="liquidMetal"
                    onClick={() => onDuplicateItem(item.id)}
                    className="h-8 px-2.5 text-[11px]"
                    disabled={isSyncing}
                  >
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onRemoveItem(item.id)}
                    className="h-8 rounded-lg border border-rose-300/20 bg-rose-500/10 px-2.5 text-[11px] text-rose-100 hover:bg-rose-500/20"
                    disabled={isSyncing}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

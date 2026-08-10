"use client"

import { useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { Film, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { queueGalleryExport, type ExportProfile } from "@/core/actions/exports"

interface StoryboardExportPanelProps {
  storyboardItems: {
    id: string
    sourceClipId: string | null
    url: string
    approvedTakeId?: string | null
  }[]
  projectId: string | null
}

const PROFILES: { id: ExportProfile; label: string }[] = [
  { id: "master_16_9", label: "16:9 Master" },
  { id: "social_9_16", label: "9:16 Social" },
  { id: "square_1_1", label: "1:1 Square" },
]

export function StoryboardExportPanel({ storyboardItems, projectId }: StoryboardExportPanelProps) {
  const [selectedProfile, setSelectedProfile] = useState<ExportProfile>("master_16_9")
  const [isExporting, setIsExporting] = useState(false)

  const exportableItems = storyboardItems.filter((i) => i.sourceClipId || i.approvedTakeId)
  const hasItems = exportableItems.length > 0

  const handleExport = async () => {
    if (!hasItems) {
      toast.error("No exportable shots in storyboard")
      return
    }

    const generationIds = exportableItems
      .map((i) => i.approvedTakeId || i.sourceClipId)
      .filter(Boolean) as string[]

    if (generationIds.length === 0) {
      toast.error("No generation IDs found — save shots to a project first")
      return
    }

    setIsExporting(true)
    try {
      const res = await queueGalleryExport(generationIds, selectedProfile)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Export queued: ${res.data?.itemCount} clip(s) as ${selectedProfile.replace(/_/g, " ")}`)

      try {
        await fetch("/api/exports/worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 1 }),
        })
      } catch {
        // Worker trigger is best-effort — export is already queued
      }
    } catch {
      toast.error("Failed to queue export")
    } finally {
      setIsExporting(false)
    }
  }

  if (storyboardItems.length === 0) return null

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-white/35 font-medium">Final Render</p>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProfile(p.id)}
              className={`h-8 rounded-lg border px-2.5 text-[11px] transition ${
                selectedProfile === p.id
                  ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="liquidMetalCyan"
          onClick={handleExport}
          disabled={!hasItems || isExporting}
          className="h-9 px-4 text-xs font-medium"
        >
          {isExporting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Film className="mr-1.5 h-3.5 w-3.5" />
          )}
          {isExporting ? "Queuing..." : `Render ${exportableItems.length} Shot${exportableItems.length !== 1 ? "s" : ""}`}
        </Button>
      </div>

      <p className="mt-2 text-[10px] text-white/35">
        {hasItems
          ? `${exportableItems.length} shot${exportableItems.length !== 1 ? "s" : ""} ready for final render`
          : "Add approved shots to storyboard to enable rendering"}
      </p>
    </div>
  )
}

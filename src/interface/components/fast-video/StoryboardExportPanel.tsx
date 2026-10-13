"use client"

import { useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { Film, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { approvedForRender, type ShotReview } from "./storyboard-continuity"
import { queueGalleryExport, type ExportProfile } from "@/core/actions/exports"

interface StoryboardExportPanelProps {
  storyboardItems: {
    id: string
    sourceClipId: string | null
    url: string
    approvedTakeId?: string | null
    review?: ShotReview
  }[]
  projectId: string | null
}

const PROFILES: { id: ExportProfile; label: string }[] = [
  { id: "master_16_9", label: "16:9 Master" },
  { id: "social_9_16", label: "9:16 Social" },
  { id: "square_1_1", label: "1:1 Square" },
]

export function StoryboardExportPanel({ storyboardItems }: StoryboardExportPanelProps) {
  const [selectedProfile, setSelectedProfile] = useState<ExportProfile>("master_16_9")
  const [isExporting, setIsExporting] = useState(false)

  // Only approved shots render, in storyboard order.
  const exportableItems = approvedForRender(storyboardItems)
  const hasItems = exportableItems.length > 0

  const handleExport = async () => {
    if (!hasItems) {
      toast.error("Approve at least one shot to render.")
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
    <div className="rounded-3xl border border-gold-400/[0.12] bg-gradient-to-b from-white/[0.035] to-black/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gold-200/60">Final render</p>
          <p className="mt-1 text-[11.5px] text-white/55">
            {hasItems
              ? `${exportableItems.length} of ${storyboardItems.length} shot${storyboardItems.length !== 1 ? "s" : ""} approved, rendered in storyboard order`
              : "Approve takes on your shots to render them"}
          </p>
        </div>
        <div role="radiogroup" aria-label="Export format" className="inline-flex rounded-full border border-gold-400/[0.12] bg-black/30 p-0.5">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selectedProfile === p.id}
              onClick={() => setSelectedProfile(p.id)}
              className={`h-7 rounded-full px-3 text-[11px] transition ${selectedProfile === p.id ? "bg-gold-400/20 text-gold-50" : "text-white/55 hover:text-white/90"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <Button
        type="button"
        onClick={handleExport}
        variant="studio"
        disabled={!hasItems || isExporting}
        className="mt-3 h-10 w-full text-xs font-semibold"
      >
        {isExporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Film className="mr-1.5 h-3.5 w-3.5" />}
        {isExporting ? "Queuing…" : "Render approved shots"}
      </Button>
    </div>
  )
}

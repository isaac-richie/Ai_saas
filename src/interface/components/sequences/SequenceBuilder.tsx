/* eslint-disable @next/next/no-img-element */
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/interface/components/ui/button"
import { Badge } from "@/interface/components/ui/badge"
import { moveSequenceShot, removeSequenceShot, updateSequenceShotDuration } from "@/core/actions/sequences"
import { SequenceTimeline } from "@/interface/components/sequences/SequenceTimeline"
import { ArrowUp, ArrowDown, Trash2, Clapperboard, Film, Video } from "lucide-react"
import { toast } from "sonner"

type SequenceItem = {
    id: string
    order_index: number
    duration_seconds: number | null
    preview_url: string | null
    shot: {
        id: string
        name: string
        description: string | null
        shot_type: string | null
        camera_movement: string | null
    }
}

type SequenceBuilderProps = {
    sequence: {
        id: string
        name: string
        status: string
        output_url: string | null
        project_id: string
        scene_id: string
    }
    items: SequenceItem[]
}

export function SequenceBuilder({ sequence, items }: SequenceBuilderProps) {
    const [loadingId, setLoadingId] = useState<string | null>(null)
    const [durationOverrides, setDurationOverrides] = useState<Record<string, string>>({})

    const getVideoProxyUrl = (url?: string | null) => {
        if (!url) return ""
        return `/api/media/proxy?url=${encodeURIComponent(url)}`
    }

    const totalDuration = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0)
    }, [items])

    const handleMove = async (id: string, direction: "up" | "down") => {
        setLoadingId(id)
        const res = await moveSequenceShot(sequence.id, id, direction)
        setLoadingId(null)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Sequence order updated")
    }

    const handleRemove = async (id: string) => {
        if (!confirm("Remove this shot from the sequence?")) return
        setLoadingId(id)
        const res = await removeSequenceShot(id)
        setLoadingId(null)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Shot removed from sequence")
    }

    const handleDurationSave = async (id: string) => {
        const raw = durationOverrides[id]
        if (!raw) return
        const value = Number(raw)
        if (!Number.isFinite(value) || value <= 0) {
            toast.error("Duration must be a positive number")
            return
        }
        setLoadingId(id)
        const res = await updateSequenceShotDuration(id, value)
        setLoadingId(null)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Duration updated")
    }

    return (
        <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-[#0b0b0d] p-6 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Sequence Builder</Badge>
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{sequence.name}</h1>
                        <p className="mt-2 max-w-2xl text-sm text-white/55">
                            Reorder shots, adjust durations, and stitch a final clip.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                Shots {items.length}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                Duration {totalDuration}s
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 capitalize">
                                Status {sequence.status}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/dashboard/projects/${sequence.project_id}/scenes/${sequence.scene_id}`} className="rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-xs text-white hover:bg-white/15">
                            Back to Scene
                        </Link>
                        {sequence.output_url && (
                            <a
                                href={sequence.output_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-xs text-white hover:bg-white/15"
                            >
                                View Output
                            </a>
                        )}
                        <a
                            href={`/api/sequences/${sequence.id}/stitch`}
                            className="rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-xs text-white hover:bg-white/15"
                            onClick={(event) => {
                                event.preventDefault()
                                fetch(`/api/sequences/${sequence.id}/stitch`, { method: "POST" })
                                    .then(async (res) => {
                                        const data = await res.json()
                                        if (!res.ok) throw new Error(data.error || "Failed to render")
                                        toast.success("Sequence rendering started")
                                    })
                                    .catch((error) => {
                                        const message = error instanceof Error ? error.message : "Render failed"
                                        toast.error(message)
                                    })
                            }}
                        >
                            Render Sequence
                        </a>
                    </div>
                </div>
            </section>

            {items.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 bg-[#0b0b0d] p-6 text-sm text-white/60">
                    No shots in this sequence yet.
                </div>
            ) : (
                <div className="grid gap-4">
                    <SequenceTimeline
                        sequenceId={sequence.id}
                        items={items.map((item) => ({
                            id: item.id,
                            order_index: item.order_index,
                            duration_seconds: item.duration_seconds,
                            preview_url: item.preview_url,
                            title: item.shot.name,
                        }))}
                    />
                    {items.map((item, index) => (
                        <div key={item.id} className="grid gap-4 rounded-3xl border border-white/10 bg-[#0b0b0d] p-4 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] md:grid-cols-[180px_1fr]">
                            <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                                {item.preview_url ? (
                                    item.preview_url.endsWith(".mp4") ? (
                                        <video src={getVideoProxyUrl(item.preview_url)} className="h-full w-full object-cover" muted loop playsInline preload="metadata" />
                                    ) : (
                                        <img src={item.preview_url} alt={item.shot.name} className="h-full w-full object-cover" />
                                    )
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-white/40">
                                        <Clapperboard className="h-8 w-8" />
                                    </div>
                                )}
                                <span className="absolute left-2 top-2 rounded-full border border-white/20 bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80">
                                    {index + 1}
                                </span>
                            </div>
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold">{item.shot.name}</h3>
                                        <p className="mt-1 text-sm text-white/55">{item.shot.description || "No description."}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 rounded-xl text-white/50 hover:bg-white/10 hover:text-white"
                                            disabled={loadingId === item.id || index === 0}
                                            onClick={() => handleMove(item.id, "up")}
                                        >
                                            <ArrowUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 rounded-xl text-white/50 hover:bg-white/10 hover:text-white"
                                            disabled={loadingId === item.id || index === items.length - 1}
                                            onClick={() => handleMove(item.id, "down")}
                                        >
                                            <ArrowDown className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 rounded-xl text-white/50 hover:bg-red-500/10 hover:text-red-200"
                                            disabled={loadingId === item.id}
                                            onClick={() => handleRemove(item.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 text-xs text-white/55">
                                    {item.shot.shot_type && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                            <Film className="mr-1 inline h-3 w-3" />
                                            {item.shot.shot_type}
                                        </span>
                                    )}
                                    {item.shot.camera_movement && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                            <Video className="mr-1 inline h-3 w-3" />
                                            {item.shot.camera_movement}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="text-white/45">Duration (sec)</span>
                                    <input
                                        value={durationOverrides[item.id] ?? (item.duration_seconds ?? "")}
                                        onChange={(event) =>
                                            setDurationOverrides((prev) => ({ ...prev, [item.id]: event.target.value }))
                                        }
                                        onBlur={() => handleDurationSave(item.id)}
                                        className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                                    />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                                        onClick={() => handleDurationSave(item.id)}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

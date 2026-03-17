/* eslint-disable @next/next/no-img-element */
"use client"

import { useMemo, useState } from "react"
import { GripVertical, Trash2 } from "lucide-react"
import { Button } from "@/interface/components/ui/button"
import { moveSequenceShot, removeSequenceShot } from "@/core/actions/sequences"
import { toast } from "sonner"

type TimelineItem = {
    id: string
    order_index: number
    duration_seconds: number | null
    preview_url: string | null
    title: string
}

interface SequenceTimelineProps {
    sequenceId: string
    items: TimelineItem[]
}

export function SequenceTimeline({ sequenceId, items }: SequenceTimelineProps) {
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const ordered = useMemo(() => [...items].sort((a, b) => a.order_index - b.order_index), [items])

    const getVideoProxyUrl = (url?: string | null) => {
        if (!url) return ""
        return `/api/media/proxy?url=${encodeURIComponent(url)}`
    }

    const handleMove = async (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return
        const direction = toIndex < fromIndex ? "up" : "down"
        const target = ordered[fromIndex]
        const moves = Math.abs(toIndex - fromIndex)
        for (let i = 0; i < moves; i += 1) {
            const res = await moveSequenceShot(sequenceId, target.id, direction)
            if (res.error) {
                toast.error(res.error)
                return
            }
        }
        toast.success("Timeline reordered")
    }

    const handleRemove = async (id: string) => {
        const confirmed = confirm("Remove this shot from the sequence?")
        if (!confirmed) return
        const res = await removeSequenceShot(id)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Removed from sequence")
    }

    return (
        <div className="rounded-3xl border border-white/10 bg-[#0b0b0d] p-4 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/45">Timeline Strip</div>
                    <p className="mt-1 text-sm text-white/70">Drag to reorder or remove shots.</p>
                </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-3">
                {ordered.map((item, index) => (
                    <div
                        key={item.id}
                        draggable
                        onDragStart={() => setDraggingId(item.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                            const fromIndex = ordered.findIndex((row) => row.id === draggingId)
                            if (fromIndex >= 0) {
                                handleMove(fromIndex, index)
                            }
                            setDraggingId(null)
                        }}
                        className={`group relative w-[160px] shrink-0 rounded-2xl border border-white/10 bg-black/40 ${
                            draggingId === item.id ? "ring-2 ring-cyan-400/60" : ""
                        }`}
                    >
                        <div className="relative aspect-video overflow-hidden rounded-2xl">
                            {item.preview_url ? (
                                item.preview_url.endsWith(".mp4") ? (
                                    <video src={getVideoProxyUrl(item.preview_url)} className="h-full w-full object-cover" muted loop playsInline preload="metadata" />
                                ) : (
                                    <img src={item.preview_url} alt={item.title} className="h-full w-full object-cover" />
                                )
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-white/35">
                                    <GripVertical className="h-5 w-5" />
                                </div>
                            )}
                            <span className="absolute left-2 top-2 rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/80">
                                {index + 1}
                            </span>
                        </div>
                        <div className="px-3 py-2 text-xs text-white/70">
                            <div className="line-clamp-1">{item.title}</div>
                            <div className="text-[11px] text-white/45">{item.duration_seconds ?? 0}s</div>
                        </div>
                        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full border border-white/10 bg-black/60 text-white/70 hover:bg-red-500/10 hover:text-red-200"
                                onClick={() => handleRemove(item.id)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

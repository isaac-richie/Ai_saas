/* eslint-disable @next/next/no-img-element */
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/interface/components/ui/button"
import { Badge } from "@/interface/components/ui/badge"
import { moveSequenceShot, removeSequenceShot, updateSequenceFinishing, updateSequenceShotEdit } from "@/core/actions/sequences"
import { SequenceTimeline } from "@/interface/components/sequences/SequenceTimeline"
import { ArrowUp, ArrowDown, Trash2, Clapperboard, Film, Video, Upload } from "lucide-react"
import { toast } from "sonner"

type SequenceItem = {
    id: string
    order_index: number
    duration_seconds: number | null
    trim_start_seconds: number | null
    transition_type: "cut" | "dissolve" | "fade"
    transition_seconds: number | null
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
        finishing_settings?: { color?: string; audio?: string; loudnessTarget?: number; captions?: string; captionTrackUrl?: string | null; delivery?: string } | null
        edit_version?: number
    }
    items: SequenceItem[]
}

export function SequenceBuilder({ sequence, items }: SequenceBuilderProps) {
    const router = useRouter()
    const [loadingId, setLoadingId] = useState<string | null>(null)
    const [isRendering, setIsRendering] = useState(false)
    const [editOverrides, setEditOverrides] = useState<Record<string, { duration: string; trimStart: string; transition: "cut" | "dissolve" | "fade"; transitionSeconds: string }>>({})
    const initialFinishing = sequence.finishing_settings || {}
    const [finishing, setFinishing] = useState({ color: initialFinishing.color || "cinematic-neutral", audio: initialFinishing.audio || "preserve", loudnessTarget: initialFinishing.loudnessTarget ?? -14, captions: initialFinishing.captions || "none", captionTrackUrl: initialFinishing.captionTrackUrl || null, delivery: initialFinishing.delivery || "1080p" })
    const [isUploadingCaptions, setIsUploadingCaptions] = useState(false)

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

    const getEdit = (item: SequenceItem) => editOverrides[item.id] || {
        duration: String(item.duration_seconds ?? 5),
        trimStart: String(item.trim_start_seconds ?? 0),
        transition: item.transition_type || "cut",
        transitionSeconds: String(item.transition_seconds ?? 0.5),
    }

    const handleEditSave = async (item: SequenceItem) => {
        const edit = getEdit(item)
        const duration = Number(edit.duration)
        const trimStart = Number(edit.trimStart)
        const transitionSeconds = edit.transition === "cut" ? 0 : Number(edit.transitionSeconds)
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(trimStart) || trimStart < 0) {
            toast.error("Check the duration and trim values")
            return
        }
        setLoadingId(item.id)
        const res = await updateSequenceShotEdit({ sequenceShotId: item.id, durationSeconds: duration, trimStartSeconds: trimStart, transitionType: edit.transition, transitionSeconds })
        setLoadingId(null)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Shot edit saved")
    }

    const uploadCaptionTrack = async (file?: File | null) => {
        if (!file) return
        setIsUploadingCaptions(true)
        try {
            const form = new FormData()
            form.append("file", file)
            const response = await fetch("/api/captions/upload", { method: "POST", body: form })
            const result = await response.json()
            if (!response.ok || !result.url) throw new Error(result.error || "Caption upload failed")
            setFinishing(current => ({ ...current, captionTrackUrl: result.url }))
            toast.success("Caption track attached. Save finishing before rendering.")
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Caption upload failed")
        } finally { setIsUploadingCaptions(false) }
    }

    const renderSequence = async () => {
        setIsRendering(true)
        try {
            const response = await fetch(`/api/sequences/${sequence.id}/stitch`, { method: "POST" })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "Failed to render")
            toast.success("Sequence rendered")
            router.refresh()
        } catch (error) {
            const message = error instanceof Error ? error.message : "Render failed"
            toast.error(message)
        } finally {
            setIsRendering(false)
        }
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
                        <Button
                            type="button"
                            disabled={isRendering || items.length === 0}
                            className="rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-xs text-white hover:bg-white/15 disabled:opacity-45"
                            onClick={() => void renderSequence()}
                        >
                            {isRendering ? "Rendering..." : "Render Sequence"}
                        </Button>
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#0b0b0d] p-6 text-white">
                <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Finishing room</h2><p className="mt-1 text-sm text-white/50">Save picture, sound, caption, and delivery intent before rendering. Edit version {sequence.edit_version || 1}.</p></div>
                <Button className="rounded-xl bg-[#d6ede7] text-black hover:bg-[#c4ded7]" onClick={async () => { const result = await updateSequenceFinishing({ sequenceId: sequence.id, ...finishing }); if (result.error) toast.error(result.error); else toast.success("Finishing settings saved") }}>Save finishing</Button></div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="text-xs text-white/55">Color<select value={finishing.color} onChange={e => setFinishing(v => ({ ...v, color: e.target.value }))} className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white"><option value="cinematic-neutral">Cinematic neutral</option><option value="warm-film">Warm film</option><option value="cool-noir">Cool noir</option><option value="high-contrast">High contrast</option></select></label>
                    <label className="text-xs text-white/55">Audio<select value={finishing.audio} onChange={e => setFinishing(v => ({ ...v, audio: e.target.value }))} className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white"><option value="preserve">Preserve</option><option value="normalize">Normalize</option><option value="mute">Mute</option></select></label>
                    <label className="text-xs text-white/55">Loudness<input type="number" min={-24} max={-9} value={finishing.loudnessTarget} onChange={e => setFinishing(v => ({ ...v, loudnessTarget: Number(e.target.value) }))} className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white" /></label>
                    <label className="text-xs text-white/55">Captions<select value={finishing.captions} onChange={e => setFinishing(v => ({ ...v, captions: e.target.value }))} className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white"><option value="none">None</option><option value="burn-in">Burn in</option><option value="sidecar">Sidecar</option></select></label>
                    <label className="text-xs text-white/55">Delivery<select value={finishing.delivery} onChange={e => setFinishing(v => ({ ...v, delivery: e.target.value }))} className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white"><option value="1080p">1080p landscape</option><option value="vertical-1080p">1080p vertical</option><option value="square-1080p">1080p square</option></select></label>
                </div>
                {finishing.captions !== "none" && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/75 hover:bg-white/5"><Upload className="h-3.5 w-3.5" />{isUploadingCaptions ? "Uploading..." : "Attach .srt"}<input className="sr-only" type="file" accept=".srt,application/x-subrip,text/plain" disabled={isUploadingCaptions} onChange={event => void uploadCaptionTrack(event.target.files?.[0])} /></label>{finishing.captionTrackUrl ? <a className="text-xs text-[#d6ede7]" href={finishing.captionTrackUrl} target="_blank" rel="noopener noreferrer">Caption track attached</a> : <p className="text-xs text-amber-200">Attach a valid SRT track before rendering.</p>}<p className="basis-full text-[11px] text-white/40">Burn in places captions on the master. Sidecar preserves a downloadable SRT beside the video.</p></div>}
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

                                <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs sm:grid-cols-4">
                                    <label className="text-white/45">Duration (sec)<input type="number" min="0.1" max="60" step="0.1" value={getEdit(item).duration} onChange={event => setEditOverrides(prev => ({ ...prev, [item.id]: { ...getEdit(item), duration: event.target.value } }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white" /></label>
                                    <label className="text-white/45">Trim start (sec)<input type="number" min="0" max="60" step="0.1" value={getEdit(item).trimStart} onChange={event => setEditOverrides(prev => ({ ...prev, [item.id]: { ...getEdit(item), trimStart: event.target.value } }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white" /></label>
                                    <label className="text-white/45">Transition<select value={getEdit(item).transition} onChange={event => setEditOverrides(prev => ({ ...prev, [item.id]: { ...getEdit(item), transition: event.target.value as "cut" | "dissolve" | "fade" } }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"><option value="cut">Cut</option><option value="dissolve">Dissolve</option><option value="fade">Fade through black</option></select></label>
                                    <label className="text-white/45">Transition (sec)<input type="number" min="0.1" max="2" step="0.1" disabled={getEdit(item).transition === "cut"} value={getEdit(item).transitionSeconds} onChange={event => setEditOverrides(prev => ({ ...prev, [item.id]: { ...getEdit(item), transitionSeconds: event.target.value } }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white disabled:opacity-40" /></label>
                                    <div className="sm:col-span-4">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                                        disabled={loadingId === item.id}
                                        onClick={() => handleEditSave(item)}
                                    >
                                        Save edit
                                    </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

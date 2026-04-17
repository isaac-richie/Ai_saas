/* eslint-disable @next/next/no-img-element */
"use client"

import { Card } from "@/interface/components/ui/card"
import { Input } from "@/interface/components/ui/input"
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/interface/components/ui/dialog" // We can reuse Dialog or make a specific Preview component
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { Play, ImageIcon, Download, Copy, Trash2, Loader2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { deleteGalleryAssets, moveGalleryAssetsToProject } from "@/core/actions/gallery"
import { queueGalleryExport } from "@/core/actions/exports"
import { toast } from "sonner"
import { appendShotToSequence, VideoSequence } from "@/core/actions/sequences"
import { buildMediaFilename } from "@/lib/download-filename"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"

// Define a type for Media Asset based on our schema usage (shot_generations mostly)
// We need to fetch this data. For now, let's assume we pass in a list of assets.
export interface MediaAsset {
    id: string
    url: string
    type: 'image' | 'video'
    prompt: string
    shotName: string
    shotType?: string
    lensName?: string
    sceneName?: string
    projectName?: string
    shotId?: string
    projectId?: string
}

interface MediaGalleryProps {
    assets: MediaAsset[]
    projectOptions?: { id: string; name: string }[]
}

export function MediaGallery({ assets, projectOptions = [] }: MediaGalleryProps) {
    const router = useRouter()
    const [items, setItems] = useState<MediaAsset[]>(assets)
    const [query, setQuery] = useState("")
    const [filter, setFilter] = useState<"all" | "image" | "video">("all")
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
    const [sequenceTargets, setSequenceTargets] = useState<Record<string, string>>({})
    const [sequences, setSequences] = useState<Record<string, VideoSequence[]>>({})
    const [sequenceLoadingByAsset, setSequenceLoadingByAsset] = useState<Record<string, boolean>>({})
    const [sequenceLoadingByProject, setSequenceLoadingByProject] = useState<Record<string, boolean>>({})
    const [moveProjectId, setMoveProjectId] = useState<string>(projectOptions[0]?.id || "")
    const [exportProfile, setExportProfile] = useState<"master_16_9" | "social_9_16" | "square_1_1">("master_16_9")
    const [downloadNames, setDownloadNames] = useState<Record<string, string>>({})
    const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({})
    const [isMoving, setIsMoving] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const searchInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        setItems(assets)
    }, [assets])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null
            const isTypingTarget =
                target?.tagName === "INPUT"
                || target?.tagName === "TEXTAREA"
                || target?.getAttribute("contenteditable") === "true"

            if (event.key === "/" && !isTypingTarget) {
                event.preventDefault()
                searchInputRef.current?.focus()
            }

            if (event.key === "Escape") {
                setSelectedIds(new Set())
            }
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [])

    const getPreviewUrl = (asset: MediaAsset) => {
        if (asset.type !== "video") return asset.url
        return `/api/media/proxy?url=${encodeURIComponent(asset.url)}`
    }

    const copyUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url)
            toast.success("Copied URL to clipboard")
        } catch {
            toast.error("Failed to copy URL")
        }
    }

    const copyPrompt = async (prompt: string) => {
        try {
            await navigator.clipboard.writeText(prompt)
            toast.success("Copied prompt")
        } catch {
            toast.error("Failed to copy prompt")
        }
    }

    const getDefaultDownloadName = (asset: MediaAsset) =>
        buildMediaFilename({
            base: asset.shotName || asset.projectName || "visiowave-asset",
            kind: asset.type,
            url: asset.url,
        })

    const counts = useMemo(() => {
        const images = items.filter((asset) => asset.type === "image").length
        const videos = items.filter((asset) => asset.type === "video").length
        return { total: items.length, images, videos }
    }, [items])

    const filteredAssets = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        return items.filter((asset) => {
            if (filter !== "all" && asset.type !== filter) return false
            if (!normalizedQuery) return true
            return [
                asset.prompt,
                asset.shotName,
                asset.sceneName,
                asset.projectName,
            ]
                .filter(Boolean)
                .some((field) => field!.toLowerCase().includes(normalizedQuery))
        })
    }, [items, filter, query])

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAllFiltered = () => {
        setSelectedIds(new Set(filteredAssets.map((asset) => asset.id)))
    }

    const handleDelete = async (ids: string[]) => {
        if (ids.length === 0) return
        if (!confirm(`Delete ${ids.length} asset${ids.length > 1 ? "s" : ""}?`)) return

        setDeletingIds((prev) => {
            const next = new Set(prev)
            ids.forEach((id) => next.add(id))
            return next
        })

        try {
            const res = await deleteGalleryAssets(ids)
            if (res.error) throw new Error(res.error)
            setItems((prev) => prev.filter((asset) => !ids.includes(asset.id)))
            toast.success("Assets deleted")
            setSelectedIds(new Set())
            router.refresh()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Delete failed"
            toast.error(message)
        } finally {
            setDeletingIds(new Set())
        }
    }

    const loadSequences = async (projectId: string) => {
        if (sequences[projectId]) return
        setSequenceLoadingByProject((prev) => ({ ...prev, [projectId]: true }))
        try {
            const res = await fetch(`/api/sequences?projectId=${projectId}`)
            if (!res.ok) {
                toast.error("Failed to load sequences")
                return
            }
            const data = await res.json()
            setSequences((prev) => ({ ...prev, [projectId]: data.data || [] }))
        } catch {
            toast.error("Failed to load sequences")
        } finally {
            setSequenceLoadingByProject((prev) => ({ ...prev, [projectId]: false }))
        }
    }

    const handleAddToSequence = async (asset: MediaAsset) => {
        if (!asset.projectId || !asset.shotId) {
            toast.error("Missing project or shot for sequence")
            return
        }
        const target = sequenceTargets[asset.id]
        if (!target) {
            toast.error("Select a sequence first")
            return
        }
        const existing = sequences[asset.projectId] || []
        if (!existing.find((sequence) => sequence.id === target)) {
            toast.error("Sequence not loaded yet")
            return
        }
        setSequenceLoadingByAsset((prev) => ({ ...prev, [asset.id]: true }))
        const res = await appendShotToSequence(target, asset.shotId, 5)
        setSequenceLoadingByAsset((prev) => ({ ...prev, [asset.id]: false }))
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Added to sequence")
    }

    const handleMoveSelected = async () => {
        const ids = Array.from(selectedIds)
        if (ids.length === 0) {
            toast.error("Select at least one asset")
            return
        }
        if (!moveProjectId) {
            toast.error("Choose a destination project")
            return
        }

        setIsMoving(true)
        const res = await moveGalleryAssetsToProject(ids, moveProjectId)
        setIsMoving(false)
        if (res.error) {
            toast.error(res.error)
            return
        }
        setItems((prev) => prev.filter((asset) => !selectedIds.has(asset.id)))
        toast.success(`Moved ${res.data?.movedCount ?? 0} asset(s)`)
        setSelectedIds(new Set())
        router.refresh()
    }

    const handleQueueExport = async () => {
        const ids = Array.from(selectedIds)
        if (ids.length === 0) {
            toast.error("Select at least one asset")
            return
        }

        setIsExporting(true)
        const res = await queueGalleryExport(ids, exportProfile)
        setIsExporting(false)
        if (res.error) {
            toast.error(res.error)
            return
        }

        toast.success(`Export queued (${res.data?.itemCount ?? 0} assets)`)
        fetch("/api/exports/worker", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: 1 }),
        }).catch(() => {
            // Non-blocking kick-off; queue can still be processed from Exports page.
        })
        setSelectedIds(new Set())
    }

    if (items.length === 0) {
        return (
            <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#0b0b0d] text-center">
                <ImageIcon className="h-8 w-8 text-white/35" />
                <h3 className="mt-4 text-sm font-medium text-white">No media generated yet</h3>
                <p className="text-xs text-white/50">Generate shots to see them here.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#0f1012]/95 px-4 py-3 backdrop-blur">
                <div className="flex flex-1 min-w-[220px]">
                    <Input
                        ref={searchInputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by prompt, shot, scene, or project... (/)"
                        className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                    />
                </div>
                <div className="flex items-center gap-2 text-xs">
                    {(["all", "image", "video"] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => setFilter(type)}
                            className={`rounded-full border px-3 py-1 uppercase tracking-[0.2em] ${
                                filter === type
                                    ? "border-white/30 bg-white/15 text-white"
                                    : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10"
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex flex-wrap gap-2 text-xs text-white/50">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Total: {counts.total}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Images: {counts.images}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Videos: {counts.videos}</span>
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0f1012] px-4 py-3 text-sm text-white/70 shadow-[0_18px_30px_-24px_rgba(0,0,0,0.85)]">
                    <span>{selectedIds.size} selected</span>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                            onClick={() => setSelectedIds(new Set())}
                        >
                            Clear
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                            onClick={selectAllFiltered}
                        >
                            Select All
                        </Button>
                        <Button
                            size="sm"
                            className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                            disabled={deletingIds.size > 0}
                            onClick={() => handleDelete(Array.from(selectedIds))}
                        >
                            {deletingIds.size > 0 ? "Deleting..." : "Delete Selected"}
                        </Button>
                        {projectOptions.length > 0 && (
                            <>
                                <select
                                    value={moveProjectId}
                                    onChange={(event) => setMoveProjectId(event.target.value)}
                                    className="h-8 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white/80"
                                >
                                    {projectOptions.map((project) => (
                                        <option key={project.id} value={project.id}>
                                            {project.name}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                                    onClick={handleMoveSelected}
                                    disabled={isMoving || selectedIds.size === 0}
                                >
                                    {isMoving ? "Moving..." : "Move To Project"}
                                </Button>
                            </>
                        )}
                        <select
                            value={exportProfile}
                            onChange={(event) => setExportProfile(event.target.value as typeof exportProfile)}
                            className="h-8 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white/80"
                        >
                            <option value="master_16_9">Export 16:9 Master</option>
                            <option value="social_9_16">Export TikTok 9:16</option>
                            <option value="square_1_1">Export Square 1:1</option>
                        </select>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                            onClick={handleQueueExport}
                            disabled={isExporting || selectedIds.size === 0}
                        >
                            {isExporting ? "Queueing..." : "Batch Export"}
                        </Button>
                    </div>
                </div>
            )}

            {filteredAssets.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#0b0b0d] text-center">
                    <ImageIcon className="h-8 w-8 text-white/35" />
                    <h3 className="mt-4 text-sm font-medium text-white">No matches</h3>
                    <p className="text-xs text-white/50">Try adjusting filters or search terms.</p>
                </div>
            ) : (
                <div className="columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3 xl:columns-4">
                    {filteredAssets.map((asset) => {
                        const previewUrl = getPreviewUrl(asset)
                        const promptPreview = asset.prompt?.replace(/\s+/g, " ").trim() || ""
                        return (
                            <Dialog key={asset.id}>
                                <DialogTrigger asChild>
                                    <Card className="group relative mb-4 min-w-0 break-inside-avoid cursor-pointer overflow-hidden border border-white/10 bg-[#0f1012] transition-all hover:border-white/25 hover:shadow-[0_20px_35px_-30px_rgba(0,0,0,0.9)]">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                toggleSelect(asset.id)
                                            }}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            className={`absolute top-2 right-2 z-10 h-7 w-7 rounded-full border text-xs ${
                                                selectedIds.has(asset.id)
                                                    ? "border-cyan-400 bg-cyan-400/20 text-cyan-100"
                                                    : "border-white/20 bg-black/40 text-white/60 hover:bg-white/10"
                                            }`}
                                            title={selectedIds.has(asset.id) ? "Deselect" : "Select"}
                                        >
                                            {selectedIds.has(asset.id) ? "✓" : "○"}
                                        </button>
                                        <div className="absolute top-2 left-2 z-10 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 backdrop-blur">
                                            {asset.type}
                                        </div>
                                        <div className={asset.type === "video" ? "relative aspect-video w-full bg-black" : "relative aspect-[4/5] w-full"}>
                                            {asset.type === 'image' ? (
                                                <img
                                                    src={previewUrl}
                                                    alt={asset.prompt}
                                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="relative h-full w-full bg-black">
                                                    <video
                                                        src={previewUrl}
                                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                                        autoPlay
                                                        muted
                                                        loop
                                                        playsInline
                                                        preload="metadata"
                                                    />
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                                                        <Play className="h-8 w-8 text-white opacity-80 drop-shadow-md" />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/90 via-black/15 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                                                <div className="min-w-0">
                                                    <p className="line-clamp-1 text-xs font-medium text-white">{asset.shotName}</p>
                                                    {asset.sceneName ? <p className="line-clamp-1 text-[10px] text-white/70">{asset.sceneName}</p> : null}
                                                    {asset.projectName ? <p className="line-clamp-1 text-[10px] text-white/50">{asset.projectName}</p> : null}
                                                    {promptPreview ? (
                                                        <p className="mt-1 line-clamp-1 text-[10px] text-white/45">{promptPreview}</p>
                                                    ) : null}
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {asset.shotType ? (
                                                            <span className="rounded-full border border-white/15 bg-black/40 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/70">
                                                                {asset.shotType}
                                                            </span>
                                                        ) : null}
                                                        {asset.lensName ? (
                                                            <span className="rounded-full border border-white/15 bg-black/40 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/70">
                                                                {asset.lensName}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </DialogTrigger>
                                <DialogContent className="max-w-[min(1280px,96vw)] overflow-hidden border-white/10 bg-[#060607]/95 p-0 text-white">
                                    <VisuallyHidden.Root>
                                        <DialogTitle>Media Preview</DialogTitle>
                                    </VisuallyHidden.Root>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.98, y: 8 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                        className="grid h-[min(88vh,820px)] grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]"
                                    >
                                        <div className="relative flex items-center justify-center overflow-hidden bg-black">
                                            {asset.type === "image" ? (
                                                <img src={previewUrl} alt={asset.prompt} className="h-full w-full object-contain" />
                                            ) : (
                                                <video
                                                    src={previewUrl}
                                                    className="h-full w-full object-contain"
                                                    controls
                                                    autoPlay
                                                    loop
                                                    playsInline
                                                    preload="metadata"
                                                />
                                            )}
                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4">
                                                <div className="inline-flex items-center rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] text-white/75 backdrop-blur">
                                                    {asset.type.toUpperCase()} {asset.shotType ? `• ${asset.shotType}` : ""}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex min-h-0 flex-col border-t border-white/10 bg-[#0f1012] lg:border-l lg:border-t-0">
                                            <div className="border-b border-white/10 p-5">
                                                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Shot</div>
                                                <div className="mt-1 truncate text-xl font-semibold">{asset.shotName}</div>
                                                <div className="mt-3 flex flex-wrap gap-1.5">
                                                    <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/70">
                                                        {asset.type}
                                                    </span>
                                                    {asset.shotType ? (
                                                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
                                                            {asset.shotType}
                                                        </span>
                                                    ) : null}
                                                    {asset.projectName ? (
                                                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
                                                            {asset.projectName}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                                                <div className="space-y-1 text-sm text-white/60 [&>div]:break-words [&>div]:[overflow-wrap:anywhere]">
                                                    {asset.projectName && <div>Project: <span className="text-white/85">{asset.projectName}</span></div>}
                                                    {asset.sceneName && <div>Scene: <span className="text-white/85">{asset.sceneName}</span></div>}
                                                    <div>Type: <span className="text-white/85">{asset.type}</span></div>
                                                    {asset.shotType && <div>Shot Type: <span className="text-white/85">{asset.shotType}</span></div>}
                                                    {asset.lensName && <div>Lens: <span className="text-white/85">{asset.lensName}</span></div>}
                                                </div>

                                                <div>
                                                    <div className="text-xs uppercase tracking-[0.2em] text-white/45">Prompt</div>
                                                    <div className={`mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm leading-relaxed text-white/70 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${expandedPrompts[asset.id] ? "max-h-72 overflow-y-auto" : "line-clamp-3"}`}>
                                                        {asset.prompt}
                                                    </div>
                                                    <div className="mt-2 flex items-center gap-3 text-xs">
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedPrompts((prev) => ({ ...prev, [asset.id]: !prev[asset.id] }))}
                                                            className="text-cyan-300 hover:text-cyan-200"
                                                        >
                                                            {expandedPrompts[asset.id] ? "Collapse" : "Expand"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyPrompt(asset.prompt)}
                                                            className="text-white/60 hover:text-white/80"
                                                        >
                                                            Copy Prompt
                                                        </button>
                                                    </div>
                                                </div>

                                                {asset.projectId && (
                                                    <div className="space-y-2">
                                                        <div className="text-xs uppercase tracking-[0.2em] text-white/45">Use In Sequence</div>
                                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                                            <button
                                                                type="button"
                                                                className="h-8 rounded-lg border border-white/10 bg-white/10 px-2.5 text-white/75 hover:bg-white/20"
                                                                onClick={() => loadSequences(asset.projectId!)}
                                                                disabled={Boolean(sequenceLoadingByProject[asset.projectId!])}
                                                            >
                                                                {sequenceLoadingByProject[asset.projectId!] ? "Loading..." : "Load Sequences"}
                                                            </button>
                                                            <select
                                                                value={sequenceTargets[asset.id] ?? ""}
                                                                onChange={(event) =>
                                                                    setSequenceTargets((prev) => ({ ...prev, [asset.id]: event.target.value }))
                                                                }
                                                                className="h-8 min-w-[140px] rounded-lg border border-white/10 bg-white/5 px-2.5 text-white/80"
                                                            >
                                                                <option value="">Select sequence</option>
                                                                {(sequences[asset.projectId] || []).map((sequence) => (
                                                                    <option key={sequence.id} value={sequence.id}>
                                                                        {sequence.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <Button
                                                                size="sm"
                                                                className="h-8 rounded-lg border border-cyan-400/35 bg-cyan-500/15 text-xs text-cyan-100 hover:bg-cyan-500/25"
                                                                onClick={() => handleAddToSequence(asset)}
                                                                disabled={Boolean(sequenceLoadingByAsset[asset.id])}
                                                            >
                                                                {sequenceLoadingByAsset[asset.id] ? (
                                                                    <>
                                                                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                                                        Adding...
                                                                    </>
                                                                ) : (
                                                                    "Add To Sequence"
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-3 border-t border-white/10 p-5">
                                                <div className="flex min-w-[220px] items-center gap-2">
                                                    <div className="flex-1">
                                                        <Input
                                                            value={downloadNames[asset.id] ?? getDefaultDownloadName(asset)}
                                                            onChange={(event) =>
                                                                setDownloadNames((prev) => ({ ...prev, [asset.id]: event.target.value }))
                                                            }
                                                            className="h-8 rounded-lg border-white/10 bg-white/5 text-xs text-white placeholder:text-white/35"
                                                            placeholder="File name"
                                                        />
                                                    </div>
                                                    <a
                                                        href={`/api/media/proxy?url=${encodeURIComponent(asset.url)}&filename=${encodeURIComponent(downloadNames[asset.id] ?? getDefaultDownloadName(asset))}`}
                                                        download={downloadNames[asset.id] ?? getDefaultDownloadName(asset)}
                                                        className="inline-flex h-8 items-center rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-3 text-xs text-cyan-100 hover:bg-cyan-500/25"
                                                    >
                                                        <Download className="mr-1.5 h-3.5 w-3.5" />
                                                        Download
                                                    </a>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                                                        onClick={() => copyUrl(asset.url)}
                                                    >
                                                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                                                        Copy URL
                                                    </Button>
                                                </div>

                                                <div className="border-t border-red-500/20 pt-3">
                                                    <Button
                                                        size="sm"
                                                        className="h-8 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                                                        disabled={deletingIds.has(asset.id)}
                                                        onClick={() => handleDelete([asset.id])}
                                                    >
                                                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                                        {deletingIds.has(asset.id) ? "Deleting..." : "Delete Asset"}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </DialogContent>
                            </Dialog>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

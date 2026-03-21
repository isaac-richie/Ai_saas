/* eslint-disable @next/next/no-img-element */
"use client"

import { Card } from "@/interface/components/ui/card"
import { Input } from "@/interface/components/ui/input"
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/interface/components/ui/dialog" // We can reuse Dialog or make a specific Preview component
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { Play, ImageIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { deleteGalleryAsset } from "@/core/actions/gallery"
import { toast } from "sonner"
import { appendShotToSequence, VideoSequence } from "@/core/actions/sequences"

// Define a type for Media Asset based on our schema usage (shot_generations mostly)
// We need to fetch this data. For now, let's assume we pass in a list of assets.
export interface MediaAsset {
    id: string
    url: string
    type: 'image' | 'video'
    prompt: string
    shotName: string
    sceneName?: string
    projectName?: string
    shotId?: string
    projectId?: string
}

interface MediaGalleryProps {
    assets: MediaAsset[]
}

export function MediaGallery({ assets }: MediaGalleryProps) {
    const [query, setQuery] = useState("")
    const [filter, setFilter] = useState<"all" | "image" | "video">("all")
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
    const [sequenceTargets, setSequenceTargets] = useState<Record<string, string>>({})
    const [sequences, setSequences] = useState<Record<string, VideoSequence[]>>({})

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

    const counts = useMemo(() => {
        const images = assets.filter((asset) => asset.type === "image").length
        const videos = assets.filter((asset) => asset.type === "video").length
        return { total: assets.length, images, videos }
    }, [assets])

    const filteredAssets = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        return assets.filter((asset) => {
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
    }, [assets, filter, query])

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
            for (const id of ids) {
                const res = await deleteGalleryAsset(id)
                if (res.error) throw new Error(res.error)
            }
            toast.success("Assets deleted")
            setSelectedIds(new Set())
            window.location.reload()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Delete failed"
            toast.error(message)
        } finally {
            setDeletingIds(new Set())
        }
    }

    const loadSequences = async (projectId: string) => {
        if (sequences[projectId]) return
        try {
            const res = await fetch(`/api/sequences?projectId=${projectId}`)
            if (!res.ok) return
            const data = await res.json()
            setSequences((prev) => ({ ...prev, [projectId]: data.data || [] }))
        } catch {
            // ignore
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
        const res = await appendShotToSequence(target, asset.shotId, 5)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Added to sequence")
    }

    if (assets.length === 0) {
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
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by prompt, shot, scene, or project..."
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
                            onClick={() => handleDelete(Array.from(selectedIds))}
                        >
                            Delete Selected
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
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {filteredAssets.map((asset) => {
                        const previewUrl = getPreviewUrl(asset)
                        return (
                            <Dialog key={asset.id}>
                                <DialogTrigger asChild>
                                    <Card className="aspect-square relative cursor-pointer overflow-hidden group border border-white/10 bg-[#0f1012] transition-all hover:border-white/25 hover:shadow-[0_20px_35px_-30px_rgba(0,0,0,0.9)]">
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
                                    {asset.type === 'image' ? (
                                        <img
                                            src={previewUrl}
                                            alt={asset.prompt}
                                            className="object-cover w-full h-full transition-transform group-hover:scale-105"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full relative bg-black">
                                            <video
                                                src={previewUrl}
                                                className="object-contain w-full h-full transition-transform group-hover:scale-[1.02]"
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
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                            <div>
                                                <p className="text-xs text-white line-clamp-1 font-medium">{asset.shotName}</p>
                                                {asset.sceneName ? <p className="text-[10px] text-white/70 line-clamp-1">{asset.sceneName}</p> : null}
                                                {asset.projectName ? <p className="text-[10px] text-white/50 line-clamp-1">{asset.projectName}</p> : null}
                                            </div>
                                        </div>
                                    </Card>
                                </DialogTrigger>
                                <DialogContent className="max-w-5xl overflow-hidden border-white/10 bg-[#060607]/95 p-0 text-white">
                                    <VisuallyHidden.Root>
                                        <DialogTitle>Media Preview</DialogTitle>
                                    </VisuallyHidden.Root>
                                    <div className="grid min-h-[70vh] grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                                    <div className="relative flex items-center justify-center bg-black overflow-hidden">
                                        {asset.type === 'image' ? (
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
                                    </div>
                                    <div className="space-y-4 border-l border-white/10 bg-[#0f1012] p-5">
                                        <div>
                                            <div className="text-xs uppercase tracking-[0.2em] text-white/50">Shot</div>
                                            <div className="mt-1 text-lg font-semibold">{asset.shotName}</div>
                                        </div>
                                        <div className="space-y-1 text-sm text-white/60">
                                            {asset.projectName && <div>Project: <span className="text-white/85">{asset.projectName}</span></div>}
                                            {asset.sceneName && <div>Scene: <span className="text-white/85">{asset.sceneName}</span></div>}
                                            <div>Type: <span className="text-white/85">{asset.type}</span></div>
                                        </div>
                                        <div>
                                            <div className="text-xs uppercase tracking-[0.2em] text-white/50">Prompt</div>
                                            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70 leading-relaxed">
                                                {asset.prompt}
                                            </div>
                                        </div>
                                        {asset.projectId && (
                                            <div className="space-y-2">
                                                <div className="text-xs uppercase tracking-[0.2em] text-white/50">Add To Sequence</div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                                    <button
                                                        type="button"
                                                        className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-white/70 hover:bg-white/20"
                                                        onClick={() => loadSequences(asset.projectId!)}
                                                    >
                                                        Load Sequences
                                                    </button>
                                                    <select
                                                        value={sequenceTargets[asset.id] ?? ""}
                                                        onChange={(event) =>
                                                            setSequenceTargets((prev) => ({ ...prev, [asset.id]: event.target.value }))
                                                        }
                                                        className="min-w-[140px] rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/80"
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
                                                        className="rounded-full border border-white/10 bg-white/10 text-xs text-white/80 hover:bg-white/20"
                                                        onClick={() => handleAddToSequence(asset)}
                                                    >
                                                        Add
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="pt-2">
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="rounded-lg border border-white/10 text-white/70 hover:bg-white/10"
                                                    onClick={() => copyUrl(asset.url)}
                                                >
                                                    Copy URL
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                                                    disabled={deletingIds.has(asset.id)}
                                                    onClick={() => handleDelete([asset.id])}
                                                >
                                                    {deletingIds.has(asset.id) ? "Deleting..." : "Delete Asset"}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </DialogContent>
                            </Dialog>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

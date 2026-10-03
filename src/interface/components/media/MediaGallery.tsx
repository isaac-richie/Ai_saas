/* eslint-disable @next/next/no-img-element */
"use client"

import { Card } from "@/interface/components/ui/card"
import { Input } from "@/interface/components/ui/input"
import { Dialog, DialogContent, DialogTitle } from "@/interface/components/ui/dialog"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { Check, CheckSquare, ChevronLeft, ChevronRight, Clapperboard, Copy, Download, FolderInput, ImageOff, Loader2, Play, Search, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { deleteGalleryAssets, moveGalleryAssetsToProject, pollPendingGalleryAssets } from "@/core/actions/gallery"
import { queueGalleryExport } from "@/core/actions/exports"
import { toast } from "sonner"
import { appendShotToSequence, VideoSequence } from "@/core/actions/sequences"
import { buildMediaFilename } from "@/lib/download-filename"
import { AnimatePresence, motion } from "framer-motion"
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
    pendingIds?: string[]
}

export function MediaGallery({ assets, projectOptions = [], pendingIds = [] }: MediaGalleryProps) {
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
    const [activeId, setActiveId] = useState<string | null>(null)
    const [selectMode, setSelectMode] = useState(false)
    const searchInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        setItems(assets)
    }, [assets])

    // Resolve still-generating assets in the background (never during page render).
    // Refreshes the route when a provider reports progress, then stops after a few
    // attempts so a permanently-stuck job can't poll forever.
    const pendingKey = pendingIds.join(",")
    useEffect(() => {
        if (pendingIds.length === 0) return
        let cancelled = false
        let attempts = 0
        let timer: ReturnType<typeof setTimeout>

        const tick = async () => {
            attempts += 1
            try {
                const res = await pollPendingGalleryAssets(pendingIds)
                if (cancelled) return
                if (res.changed) {
                    router.refresh()
                    return
                }
            } catch {
                // best-effort; retry on the next tick
            }
            if (!cancelled && attempts < 5) {
                timer = setTimeout(tick, 6000)
            }
        }

        timer = setTimeout(tick, 3000)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingKey, router])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            // Events can target the document or window, which are not elements.
            const target = event.target instanceof HTMLElement ? event.target : null
            const isTypingTarget =
                target?.tagName === "INPUT"
                || target?.tagName === "TEXTAREA"
                || target?.tagName === "SELECT"
                || target?.isContentEditable === true

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
        // Persisted renders (Supabase Storage) and same-origin media stream fine
        // directly with range support — only proxy remote provider URLs.
        if (asset.url.startsWith("/") || asset.url.includes("/storage/v1/object/public/")) {
            return asset.url
        }
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
        setSelectedIds(new Set())

        // Kick off the worker — retry once on failure so the job doesn't sit orphaned
        const kickWorker = async (attempt: number) => {
            try {
                const workerRes = await fetch("/api/exports/worker", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ limit: 1 }),
                })
                if (!workerRes.ok && attempt < 1) {
                    await new Promise((r) => setTimeout(r, 2000))
                    return kickWorker(attempt + 1)
                }
                if (!workerRes.ok) {
                    toast.error("Export queued but worker failed to start. Visit Exports page to run it manually.")
                }
            } catch {
                if (attempt < 1) {
                    await new Promise((r) => setTimeout(r, 2000))
                    return kickWorker(attempt + 1)
                }
                toast.error("Export queued but worker unreachable. Visit Exports page to run it manually.")
            }
        }
        void kickWorker(0)
    }

    if (items.length === 0) {
        if (pendingIds.length > 0) {
            return (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-gold-400/20 bg-obsidian-950 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gold-300/70" />
                    <h3 className="mt-4 text-sm font-medium text-white">
                        {pendingIds.length} shot{pendingIds.length > 1 ? "s" : ""} generating…
                    </h3>
                    <p className="text-xs text-white/50">This updates automatically when they finish.</p>
                </div>
            )
        }
        return (
            <div className="lux-rise flex flex-col items-center justify-center rounded-3xl border border-dashed border-gold-400/20 [background:radial-gradient(70%_120%_at_50%_0%,rgba(217,192,138,0.08),transparent_60%),#0f110f] px-6 py-16 text-center">
                <div className="grid size-14 place-items-center rounded-2xl border border-gold-400/20 bg-gold-400/[0.06] text-gold-300 shadow-[0_0_40px_-12px_rgba(217,192,138,0.6)]">
                    <Clapperboard className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <h3 className="mt-5 text-2xl font-light tracking-tight text-[#f3eee2]">Your <span className="lux-serif text-gold-300">collection</span> starts here</h3>
                <p className="mt-2 max-w-sm text-sm text-[#a3a59a]">Every clip and frame you create in Fast Track lands here, ready to review, sequence and export.</p>
                <a href="/dashboard/fast-video" className="workspace-primary-link mt-6">Create your first clip</a>
            </div>
        )
    }

    const activeIndex = activeId ? filteredAssets.findIndex((asset) => asset.id === activeId) : -1
    const activeAsset = activeIndex >= 0 ? filteredAssets[activeIndex] : null
    const selecting = selectMode || selectedIds.size > 0
    const step = (delta: number) => {
        if (activeIndex < 0 || filteredAssets.length === 0) return
        const next = (activeIndex + delta + filteredAssets.length) % filteredAssets.length
        setActiveId(filteredAssets[next].id)
    }

    return (
        <div className="workspace-media space-y-5 pb-28">
            <div className="workspace-gallery-toolbar lux-glass flex flex-wrap items-center gap-2.5 rounded-2xl px-3 py-2.5">
                <label className="relative flex min-w-0 basis-64 flex-1 items-center">
                    <Search className="pointer-events-none absolute left-3 z-10 h-3.5 w-3.5 text-gold-400/70" aria-hidden />
                    <Input
                        ref={searchInputRef}
                        aria-label="Search gallery"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search prompts, shots, scenes or projects"
                        className="h-10 rounded-xl pl-9 pr-10 text-sm"
                    />
                    {query ? (
                        <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-3 text-[#8f9086] hover:text-gold-100"><X className="h-3.5 w-3.5" /></button>
                    ) : <span className="lux-kbd pointer-events-none absolute right-3">/</span>}
                </label>
                <div role="radiogroup" aria-label="Filter by type" className="flex rounded-xl border border-gold-400/[0.12] bg-black/20 p-1">
                    {([["all", "All", counts.total], ["video", "Videos", counts.videos], ["image", "Images", counts.images]] as const).map(([type, label, count]) => (
                        <button
                            key={type}
                            type="button"
                            role="radio"
                            aria-checked={filter === type}
                            onClick={() => setFilter(type)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all duration-300 ${
                                filter === type ? "bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] font-semibold text-[#1a160e] shadow-[0_6px_16px_-10px_rgba(217,192,138,0.9)]" : "text-[#a3a59a] hover:text-gold-100"
                            }`}
                        >
                            {label}<span className={`tabular-nums ${filter === type ? "text-[#1a160e]/70" : "text-[#77796f]"}`}>{count}</span>
                        </button>
                    ))}
                </div>
                {pendingIds.length > 0 && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-500/10 px-3 py-1.5 text-xs text-gold-100">
                        <span className="lux-live-dot !size-1.5" />
                        {pendingIds.length} generating
                    </span>
                )}
                <button
                    type="button"
                    aria-pressed={selecting}
                    onClick={() => { if (selecting) { setSelectMode(false); setSelectedIds(new Set()) } else setSelectMode(true) }}
                    className={`ml-auto inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs transition-all duration-300 ${
                        selecting ? "border-gold-300/60 bg-gold-400/10 text-gold-50" : "border-gold-400/[0.15] text-[#d4cfc0] hover:border-gold-400/45 hover:text-gold-100"
                    }`}
                >
                    <CheckSquare className="h-3.5 w-3.5" />{selecting ? "Done" : "Select"}
                </button>
            </div>

            {items.length === 0 ? (
                <div className="lux-rise flex flex-col items-center justify-center rounded-3xl border border-dashed border-gold-400/20 [background:radial-gradient(70%_120%_at_50%_0%,rgba(217,192,138,0.08),transparent_60%),#0f110f] px-6 py-16 text-center">
                    <div className="grid size-14 place-items-center rounded-2xl border border-gold-400/20 bg-gold-400/[0.06] text-gold-300 shadow-[0_0_40px_-12px_rgba(217,192,138,0.6)]">
                        <Clapperboard className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-5 text-2xl font-light tracking-tight text-[#f3eee2]">Your <span className="lux-serif text-gold-300">collection</span> starts here</h3>
                    <p className="mt-2 max-w-sm text-sm text-[#a3a59a]">Every clip and frame you create in Fast Track lands here, ready to review, sequence and export.</p>
                    <a href="/dashboard/fast-video" className="workspace-primary-link mt-6">Create your first clip</a>
                </div>
            ) : filteredAssets.length === 0 ? (
                <div className="lux-fade flex flex-col items-center justify-center rounded-2xl border border-dashed border-gold-400/20 bg-[#0f110f] py-14 text-center">
                    <Search className="h-6 w-6 text-gold-400/50" />
                    <h3 className="mt-3 text-sm font-medium text-[#f3eee2]">Nothing matches {query ? `"${query}"` : "this filter"}</h3>
                    <button type="button" onClick={() => { setQuery(""); setFilter("all") }} className="workspace-text-link mt-2">Clear search and filters</button>
                </div>
            ) : (
                <div className="workspace-media-grid">
                    {filteredAssets.map((asset, index) => {
                        const previewUrl = getPreviewUrl(asset)
                        const selected = selectedIds.has(asset.id)
                        return (
                            <div key={asset.id} style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }} className="mb-4 break-inside-avoid">
                                <Card
                                    role="button"
                                    tabIndex={0}
                                    aria-label={selecting ? `${selected ? "Deselect" : "Select"} ${asset.shotName}` : `Open ${asset.shotName}`}
                                    aria-pressed={selecting ? selected : undefined}
                                    onClick={() => selecting ? toggleSelect(asset.id) : setActiveId(asset.id)}
                                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (selecting) toggleSelect(asset.id); else setActiveId(asset.id) } }}
                                    className={`workspace-media-card lux-spotlight gallery-card group relative min-w-0 cursor-pointer overflow-hidden border bg-obsidian-900 duration-500 ${selected ? "!border-gold-300/80 shadow-[0_0_0_1px_rgba(217,192,138,0.4),0_20px_40px_-24px_rgba(217,192,138,0.7)]" : "border-gold-400/[0.12]"}`}
                                >
                                    <div className={asset.type === "video" ? "relative aspect-video w-full bg-black" : "relative aspect-[4/5] w-full"}>
                                        <AssetMedia key={previewUrl} asset={asset} previewUrl={previewUrl} variant="thumb" />
                                        <div className="gallery-card__caption pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-black/10 to-transparent p-3">
                                            <div className="min-w-0">
                                                <p className="line-clamp-1 text-[13px] font-medium text-white">{asset.shotName}</p>
                                                <p className="line-clamp-1 text-[10.5px] text-white/60">{[asset.sceneName, asset.projectName].filter(Boolean).join(" · ")}</p>
                                            </div>
                                        </div>
                                        {asset.type === "video" ? (
                                            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white/85 backdrop-blur-md"><Play className="h-2.5 w-2.5 fill-current" /> Video</span>
                                        ) : null}
                                        <span
                                            aria-hidden
                                            className={`gallery-card__check absolute right-2 top-2 grid size-6 place-items-center rounded-full border backdrop-blur-md transition-all duration-300 ${
                                                selected ? "border-gold-300 bg-gold-300 text-[#1a160e] shadow-[0_0_16px_rgba(217,192,138,0.7)]" : "border-white/40 bg-black/35 text-transparent"
                                            } ${selecting || selected ? "opacity-100" : ""}`}
                                            onClick={(event) => { event.stopPropagation(); toggleSelect(asset.id) }}
                                        >
                                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                        </span>
                                    </div>
                                </Card>
                            </div>
                        )
                    })}
                </div>
            )}

            <Dialog open={Boolean(activeAsset)} onOpenChange={(open) => { if (!open) setActiveId(null) }}>
                {activeAsset ? (
                    <DialogContent
                        className="max-w-[min(1280px,96vw)] gap-0 overflow-hidden p-0 text-white"
                        showCloseButton={false}
                        onKeyDown={(event) => {
                            const target = event.target as HTMLElement
                            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return
                            if (event.key === "ArrowRight") { event.preventDefault(); step(1) }
                            if (event.key === "ArrowLeft") { event.preventDefault(); step(-1) }
                        }}
                    >
                        <VisuallyHidden.Root>
                            <DialogTitle>{activeAsset.shotName}</DialogTitle>
                        </VisuallyHidden.Root>
                        <div className="grid h-[min(88vh,820px)] grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]">
                            <div className="relative flex items-center justify-center overflow-hidden bg-black">
                                <motion.div key={activeAsset.id} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="relative h-full w-full">
                                    <AssetMedia key={getPreviewUrl(activeAsset)} asset={activeAsset} previewUrl={getPreviewUrl(activeAsset)} variant="full" />
                                </motion.div>
                                {filteredAssets.length > 1 ? (
                                    <>
                                        <button type="button" aria-label="Previous" onClick={() => step(-1)} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/45 text-white/85 backdrop-blur-md transition hover:border-gold-300/60 hover:text-gold-100"><ChevronLeft className="h-5 w-5" /></button>
                                        <button type="button" aria-label="Next" onClick={() => step(1)} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/45 text-white/85 backdrop-blur-md transition hover:border-gold-300/60 hover:text-gold-100"><ChevronRight className="h-5 w-5" /></button>
                                    </>
                                ) : null}
                                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] tabular-nums text-white/80 backdrop-blur">{activeIndex + 1} / {filteredAssets.length}</span>
                            </div>

                            <div className="flex min-h-0 flex-col border-t border-gold-400/[0.12] bg-[#111311] lg:border-l lg:border-t-0">
                                <div className="flex items-start justify-between gap-3 border-b border-gold-400/[0.12] p-5">
                                    <div className="min-w-0">
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">{activeAsset.type === "video" ? "Video" : "Image"}{activeAsset.shotType ? ` · ${activeAsset.shotType}` : ""}</p>
                                        <h3 className="mt-1.5 truncate text-xl font-light tracking-tight text-[#f6f1e4]">{activeAsset.shotName}</h3>
                                    </div>
                                    <button type="button" aria-label="Close" onClick={() => setActiveId(null)} className="grid size-8 shrink-0 place-items-center rounded-full border border-gold-400/15 text-[#a3a59a] transition hover:rotate-90 hover:border-gold-400/40 hover:text-gold-100"><X className="h-4 w-4" /></button>
                                </div>

                                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
                                        {([["Project", activeAsset.projectName], ["Scene", activeAsset.sceneName], ["Shot type", activeAsset.shotType], ["Lens", activeAsset.lensName]] as const).filter(([, value]) => value).map(([label, value]) => (
                                            <div key={label} className="contents">
                                                <dt className="text-[#8f9086]">{label}</dt>
                                                <dd className="min-w-0 truncate text-[#e8e2d2]">{value}</dd>
                                            </div>
                                        ))}
                                    </dl>

                                    <div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#8f9086]">Prompt</p>
                                            <div className="flex gap-3 text-[11px]">
                                                <button type="button" onClick={() => setExpandedPrompts((prev) => ({ ...prev, [activeAsset.id]: !prev[activeAsset.id] }))} className="text-gold-300 hover:text-gold-100">{expandedPrompts[activeAsset.id] ? "Less" : "More"}</button>
                                                <button type="button" onClick={() => copyPrompt(activeAsset.prompt)} className="inline-flex items-center gap-1 text-[#a3a59a] hover:text-gold-100"><Copy className="h-3 w-3" />Copy</button>
                                            </div>
                                        </div>
                                        <p className={`mt-2 rounded-xl border border-gold-400/[0.12] bg-black/20 p-3 text-[13px] leading-relaxed text-[#c8c3b3] whitespace-pre-wrap [overflow-wrap:anywhere] ${expandedPrompts[activeAsset.id] ? "max-h-72 overflow-y-auto" : "line-clamp-4"}`}>
                                            {activeAsset.prompt || "No prompt recorded."}
                                        </p>
                                    </div>

                                    {activeAsset.projectId && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#8f9086]">Add to a sequence</p>
                                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                                <select
                                                    aria-label="Sequence"
                                                    value={sequenceTargets[activeAsset.id] ?? ""}
                                                    onFocus={() => { if (!sequences[activeAsset.projectId!] && !sequenceLoadingByProject[activeAsset.projectId!]) void loadSequences(activeAsset.projectId!) }}
                                                    onChange={(event) => setSequenceTargets((prev) => ({ ...prev, [activeAsset.id]: event.target.value }))}
                                                    className="h-9 min-w-[160px] flex-1 rounded-lg border px-2.5"
                                                >
                                                    <option value="">{sequenceLoadingByProject[activeAsset.projectId] ? "Loading sequences…" : "Choose a sequence"}</option>
                                                    {(sequences[activeAsset.projectId] || []).map((sequence) => (
                                                        <option key={sequence.id} value={sequence.id}>{sequence.name}</option>
                                                    ))}
                                                </select>
                                                <Button size="sm" variant="studioSecondary" className="h-9" onClick={() => handleAddToSequence(activeAsset)} disabled={Boolean(sequenceLoadingByAsset[activeAsset.id]) || !sequenceTargets[activeAsset.id]}>
                                                    {sequenceLoadingByAsset[activeAsset.id] ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Adding…</> : "Add"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3 border-t border-gold-400/[0.12] p-5">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            aria-label="Download file name"
                                            value={downloadNames[activeAsset.id] ?? getDefaultDownloadName(activeAsset)}
                                            onChange={(event) => setDownloadNames((prev) => ({ ...prev, [activeAsset.id]: event.target.value }))}
                                            className="h-10 flex-1 rounded-lg text-xs"
                                            placeholder="File name"
                                        />
                                        <a
                                            href={`/api/media/proxy?url=${encodeURIComponent(activeAsset.url)}&filename=${encodeURIComponent(downloadNames[activeAsset.id] ?? getDefaultDownloadName(activeAsset))}`}
                                            download={downloadNames[activeAsset.id] ?? getDefaultDownloadName(activeAsset)}
                                            className="workspace-primary-link !min-h-10 !px-3.5"
                                        >
                                            <Download className="h-3.5 w-3.5" />Download
                                        </a>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <Button size="sm" variant="studioSecondary" className="h-9" onClick={() => copyUrl(activeAsset.url)}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy link</Button>
                                        <Button size="sm" variant="ghost" className="h-9 rounded-lg text-red-200/80 hover:!bg-red-500/10 hover:!text-red-100" disabled={deletingIds.has(activeAsset.id)} onClick={() => handleDelete([activeAsset.id])}>
                                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />{deletingIds.has(activeAsset.id) ? "Deleting…" : "Delete"}
                                        </Button>
                                    </div>
                                    <p className="text-center text-[10px] text-[#77796f]"><span className="lux-kbd">←</span> <span className="lux-kbd">→</span> to browse · <span className="lux-kbd">esc</span> to close</p>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                ) : null}
            </Dialog>

            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.98 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                        role="toolbar"
                        aria-label="Selection actions"
                        className="lux-glass lux-hairline fixed bottom-5 left-1/2 z-40 flex w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] md:left-[calc(50%+9rem)]"
                    >
                        <span className="flex items-center gap-2 pl-1 text-sm text-[#f3eee2]">
                            <span className="grid size-6 place-items-center rounded-full bg-gold-300 text-[11px] font-semibold tabular-nums text-[#1a160e]">{selectedIds.size}</span>
                            selected
                        </span>
                        <button type="button" onClick={selectAllFiltered} className="text-xs text-gold-300 hover:text-gold-100">Select all {filteredAssets.length}</button>
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            {projectOptions.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <select aria-label="Move to project" value={moveProjectId} onChange={(event) => setMoveProjectId(event.target.value)} className="h-9 max-w-[160px] rounded-lg border px-2 text-xs">
                                        {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                                    </select>
                                    <Button size="sm" variant="studioSecondary" className="h-9" onClick={handleMoveSelected} disabled={isMoving}>
                                        <FolderInput className="mr-1.5 h-3.5 w-3.5" />{isMoving ? "Moving…" : "Move"}
                                    </Button>
                                </div>
                            )}
                            <div className="flex items-center gap-1.5">
                                <select aria-label="Export format" value={exportProfile} onChange={(event) => setExportProfile(event.target.value as typeof exportProfile)} className="h-9 rounded-lg border px-2 text-xs">
                                    <option value="master_16_9">16:9 master</option>
                                    <option value="social_9_16">9:16 social</option>
                                    <option value="square_1_1">1:1 square</option>
                                </select>
                                <Button size="sm" variant="studio" className="h-9" onClick={handleQueueExport} disabled={isExporting}>
                                    <Download className="mr-1.5 h-3.5 w-3.5" />{isExporting ? "Queueing…" : "Export"}
                                </Button>
                            </div>
                            <Button size="sm" variant="ghost" className="h-9 rounded-lg text-red-200/80 hover:!bg-red-500/10 hover:!text-red-100" disabled={deletingIds.size > 0} onClick={() => handleDelete(Array.from(selectedIds))}>
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />{deletingIds.size > 0 ? "Deleting…" : "Delete"}
                            </Button>
                            <button type="button" aria-label="Clear selection" onClick={() => { setSelectedIds(new Set()); setSelectMode(false) }} className="grid size-9 place-items-center rounded-lg text-[#a3a59a] hover:bg-white/5 hover:text-gold-100"><X className="h-4 w-4" /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function BrokenMedia() {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/[0.03] text-white/40">
            <ImageOff className="h-6 w-6" />
            <span className="px-4 text-center text-[10px] uppercase tracking-[0.16em]">Media unavailable</span>
        </div>
    )
}

function AssetMedia({
    asset,
    previewUrl,
    variant,
}: {
    asset: MediaAsset
    previewUrl: string
    variant: "thumb" | "full"
}) {
    // Keyed by previewUrl at the call site, so a resolved pending asset remounts
    // this and resets error/loading state automatically.
    const [errored, setErrored] = useState(false)
    const [loaded, setLoaded] = useState(false)

    if (errored) return <BrokenMedia />

    if (variant === "full") {
        return asset.type === "image" ? (
            <img
                src={previewUrl}
                alt={asset.prompt}
                className="h-full w-full object-contain"
                onError={() => setErrored(true)}
            />
        ) : (
            <video
                src={previewUrl}
                className="h-full w-full object-contain"
                controls
                autoPlay
                playsInline
                preload="metadata"
                onError={() => setErrored(true)}
            />
        )
    }

    return (
        <>
            {!loaded && <div className="lux-shimmer absolute inset-0" />}
            {asset.type === "image" ? (
                <img
                    // A cached image can finish before hydration attaches onLoad.
                    ref={(node) => { if (node?.complete && node.naturalWidth > 0 && !loaded) setLoaded(true) }}
                    src={previewUrl}
                    alt={asset.prompt}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onLoad={() => setLoaded(true)}
                    onError={() => setErrored(true)}
                />
            ) : (
                <HoverVideo src={previewUrl} onReady={() => setLoaded(true)} onError={() => setErrored(true)} />
            )}
        </>
    )
}

/**
 * Thumbnails stay paused until hovered or focused, so a gallery of many clips
 * does not decode every video at once.
 */
function HoverVideo({ src, onReady, onError }: { src: string; onReady: () => void; onError: () => void }) {
    const ref = useRef<HTMLVideoElement | null>(null)
    const play = () => { void ref.current?.play().catch(() => undefined) }
    const pause = () => { const video = ref.current; if (video) { video.pause(); video.currentTime = Math.min(1, (video.duration || 0) / 2) } }
    return (
        <div className="relative h-full w-full bg-black" onMouseEnter={play} onMouseLeave={pause} onFocus={play} onBlur={pause}>
            <video
                ref={ref}
                src={`${src}${src.includes("#") ? "" : "#t=1"}`}
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                preload="metadata"
                onLoadedData={onReady}
                onError={onError}
            />
        </div>
    )
}

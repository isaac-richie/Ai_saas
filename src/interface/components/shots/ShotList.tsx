/* eslint-disable @next/next/no-img-element */
"use client"

import { Shot, duplicateShot } from "@/core/actions/shots"
import { Badge } from "@/interface/components/ui/badge"
import { Card, CardContent } from "@/interface/components/ui/card"
import { Button } from "@/interface/components/ui/button"
import { Checkbox } from "@/interface/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/interface/components/ui/dialog"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { GripVertical, Camera, Aperture, Wand2, Loader2, Play, Sparkles, Check, Video, Trash2, ChevronRight, X } from "lucide-react"
import { generateShot, generateVideoShot, pollShotStatus } from "@/core/actions/generation"
import { batchGenerate } from "@/core/actions/batch"
import { updateShotStatus, removeShot } from "@/core/actions/shots"
import { addShotsToSequence, appendShotToSequence, createSequence, VideoSequence } from "@/core/actions/sequences"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

interface ShotListProps {
    projectId: string
    sceneId: string
    shots: (Shot & {
        camera?: { name: string } | null,
        lens?: { name: string } | null,
        options?: ShotOption[]
    })[]
    sequences?: VideoSequence[]
}

type ShotOption = {
    id: string
    prompt?: string | null
    output_url?: string | null
    created_at: string
    status: string
    model_version?: string | null
    provider?: { name: string; slug: string } | null
    negative_prompt?: string | null
    seed?: number | null
    cfg_scale?: number | null
    steps?: number | null
}

type SelectionPayload = {
    subject?: string
    selections?: Record<string, { label?: string }>
}

export function ShotList({ shots, projectId, sceneId, sequences }: ShotListProps) {
    const [generatingId, setGeneratingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [selectedShots, setSelectedShots] = useState<string[]>([])
    const [batchLoading, setBatchLoading] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
    const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null)
    const [compareTargets, setCompareTargets] = useState<ShotOption[]>([])
    const [compareSet, setCompareSet] = useState<string[]>([])
    const listRef = useRef<HTMLDivElement>(null)

    const getOutputType = (option: ShotOption) => {
        if (!option.output_url) return "Pending"
        if (option.output_url?.endsWith(".mp4")) return "Video"
        return "Image"
    }

    const getVideoProxyUrl = (url?: string | null) => {
        if (!url) return ""
        return `/api/media/proxy?url=${encodeURIComponent(url)}`
    }

    useEffect(() => {
        if (!listRef.current || shots.length === 0) return
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

        let active = true
        let revert: (() => void) | undefined

            ; (async () => {
                const mod = await import("gsap")
                const gsap = mod.gsap
                if (!active || !listRef.current) return

                const ctx = gsap.context(() => {
                    gsap.fromTo(
                        ".shot-card",
                        { y: 12, opacity: 0 },
                        { y: 0, opacity: 1, duration: 0.45, stagger: 0.05, ease: "power2.out" }
                    )
                }, listRef)

                revert = () => ctx.revert()
            })()

        return () => {
            active = false
            if (revert) revert()
        }
    }, [shots])

    // Polling effect for processing shots
    useEffect(() => {
        if (!isMounted) return;

        // Find all options currently in 'processing' state
        const processingOptIds: string[] = [];
        shots.forEach(shot => {
            if (shot.options) {
                shot.options.forEach(opt => {
                    if (opt.status === 'processing' || opt.status === 'pending') {
                        processingOptIds.push(opt.id);
                    }
                });
            }
        });

        if (processingOptIds.length === 0) return;

        const interval = setInterval(() => {
            processingOptIds.forEach(async (id) => {
                await pollShotStatus(id);
            });
        }, 5000);

        return () => clearInterval(interval);
    }, [shots, isMounted])

    useEffect(() => {
        setIsMounted(true)
    }, [])

    useEffect(() => {
        if (!selectedSequenceId && sequences && sequences.length > 0) {
            setSelectedSequenceId(sequences[0].id)
        }
    }, [sequences, selectedSequenceId])


    const toggleSelect = (id: string) => {
        if (selectedShots.includes(id)) {
            setSelectedShots(selectedShots.filter((shotId) => shotId !== id))
        } else {
            setSelectedShots([...selectedShots, id])
        }
    }

    const handleBatchGenerate = async () => {
        if (selectedShots.length === 0) return
        setBatchLoading(true)
        try {
            const res = await batchGenerate(selectedShots)
            toast.success(res.message)
            setSelectedShots([])
        } catch {
            toast.error("Batch generation failed")
        } finally {
            setBatchLoading(false)
        }
    }

    const handleCreateSequence = async () => {
        if (selectedShots.length < 2) {
            toast.error("Select at least two shots for a sequence")
            return
        }
        const name = window.prompt("Sequence name", "New Sequence")
        if (!name || !name.trim()) return

        const createRes = await createSequence(projectId, sceneId, name.trim())
        if (createRes.error || !createRes.data) {
            toast.error(`Failed to create sequence: ${createRes.error || "Unknown error"}`)
            return
        }

        const ordered = shots
            .filter((shot) => selectedShots.includes(shot.id))
            .map((shot, index) => ({
                shot_id: shot.id,
                order_index: index + 1,
                duration_seconds: 5,
            }))

        const addRes = await addShotsToSequence(createRes.data.id, ordered)
        if (addRes.error) {
            toast.error(`Failed to add shots: ${addRes.error}`)
            return
        }

        toast.success("Sequence created")
        setSelectedShots([])
    }

    const handleGenerate = async (shotId: string) => {
        setGeneratingId(shotId)
        const res = await generateShot(shotId)
        setGeneratingId(null)

        if (res.error) {
            toast.error(res.error)
        } else if (res.url) {
            toast.success("Generation complete! See options below.")
        }
    }

    const handleDelete = async (shotId: string) => {
        if (!confirm("Are you sure you want to delete this shot?")) return;

        setDeletingId(shotId)
        try {
            const res = await removeShot(shotId)
            if (res.error) throw new Error(res.error)
            toast.success("Shot removed")
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Delete failed"
            toast.error(`Delete failed: ${message}`)
        } finally {
            setDeletingId(null)
        }
    }


    const handleGenerateVideo = async (optionId: string) => {
        setGeneratingId(optionId)
        try {
            const videoPrompt = window.prompt("Video prompt", "Cinematic motion, subtle camera move, natural lighting")
            if (videoPrompt === null) {
                return
            }
            const useSourceImage = window.confirm("Use selected image as start frame?\nOK = Image-to-video\nCancel = Prompt-to-video")
            const res = await generateVideoShot(optionId, {
                customPrompt: videoPrompt,
                useSourceImage,
            })
            if (res.error) throw new Error(res.error)
            toast.success("Video generation started! This may take a few minutes. Refresh later to see the result.")
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Video generation failed"
            toast.error(`Video generation failed: ${message}`)
        } finally {
            setGeneratingId(null)
        }
    }

    const handleDuplicate = async (shotId: string) => {
        const res = await duplicateShot(shotId)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Shot duplicated")
    }

    const handleAppendToSequence = async (shotId: string) => {
        if (!selectedSequenceId) {
            toast.error("Select a sequence first")
            return
        }
        const duration = shots.find((shot) => shot.id === shotId)?.estimated_duration ?? null
        const res = await appendShotToSequence(selectedSequenceId, shotId, duration)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success("Added to sequence")
    }

    const handleCompare = (option: ShotOption) => {
        setCompareTargets((prev) => {
            if (prev.find((item) => item.id === option.id)) {
                return prev.filter((item) => item.id !== option.id)
            }
            if (prev.length >= 2) {
                return [option]
            }
            return [...prev, option]
        })
    }

    const toggleCompareSet = (option: ShotOption) => {
        setCompareSet((prev) => {
            if (prev.includes(option.id)) {
                return prev.filter((id) => id !== option.id)
            }
            if (prev.length >= 3) {
                return [...prev.slice(1), option.id]
            }
            return [...prev, option.id]
        })
    }

    const handleApprove = async (shotId: string, optionId: string, newStatus: string) => {
        setGeneratingId(shotId) // Using shotId for loading state, assuming it's tied to the parent shot
        try {
            const res = await updateShotStatus(shotId, optionId, newStatus)
            if (res.error) throw new Error(res.error)
            toast.success(newStatus === 'approved' ? "Shot approved!" : "Shot unapproved.")
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Approval failed"
            toast.error(`Approval failed: ${message}`)
        } finally {
            setGeneratingId(null)
        }
    }

    if (shots.length === 0) {
        return (
            <div className="flex h-28 w-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#0b0b0d] text-sm text-white/55">
                No shots added yet. Create one above.
            </div>
        )
    }

    const selectedShot = selectedShotId ? shots.find((shot) => shot.id === selectedShotId) : null
    const selectedSettings = selectedShot?.generation_settings as Record<string, unknown> | null
    const selectedAspectRatio = typeof selectedSettings?.aspect_ratio === "string" ? selectedSettings.aspect_ratio : null
    const selectedDuration = typeof selectedSettings?.duration_seconds === "number" ? selectedSettings.duration_seconds : null
    const selectedModel = typeof selectedSettings?.model === "string" ? selectedSettings.model : null
    const selectedVariations = typeof selectedSettings?.variations === "number" ? selectedSettings.variations : null

    return (
        <div ref={listRef} className="grid gap-4">
            {selectedShot && (
                <Card className="rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                    <CardContent className="space-y-4 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Shot Details</div>
                                <h3 className="mt-1 text-lg font-semibold">{selectedShot.name}</h3>
                                {selectedShot.description && (
                                    <p className="mt-2 text-sm text-white/55">{selectedShot.description}</p>
                                )}
                            </div>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-full border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                                onClick={() => setSelectedShotId(null)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {(() => {
                            const payload = selectedShot.selection_payload as SelectionPayload | null
                            const selections = payload?.selections || {}
                            const shotLabel = selections.shot?.label || selectedShot.shot_type || "—"
                            const movementLabel = selections.movement?.label || selectedShot.camera_movement || "—"
                            const cameraLabel = selections.camera?.label || "—"
                            const lensLabel = selections.lens?.label || "—"
                            const angleLabel = selections.angle?.label || "—"
                            const lightingLabel = selections.lighting?.label || "—"
                            return (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Shot Type</div>
                                <div className="mt-1 font-medium text-white/90">{shotLabel}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Movement</div>
                                <div className="mt-1 font-medium text-white/90">{movementLabel}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Camera</div>
                                <div className="mt-1 font-medium text-white/90">{cameraLabel}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Lens</div>
                                <div className="mt-1 font-medium text-white/90">{lensLabel}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Angle</div>
                                <div className="mt-1 font-medium text-white/90">{angleLabel}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Lighting</div>
                                <div className="mt-1 font-medium text-white/90">{lightingLabel}</div>
                            </div>
                        </div>
                            )
                        })()}

                        {(() => {
                            const latestOption = selectedShot.options
                                ?.filter((option) => option.created_at)
                                .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0]
                            if (!latestOption) return null
                            return (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Latest Output Settings</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {latestOption.model_version && (
                                        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1">
                                            Model {latestOption.model_version}
                                        </span>
                                    )}
                                    {latestOption.seed !== null && latestOption.seed !== undefined && (
                                        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1">
                                            Seed {latestOption.seed}
                                        </span>
                                    )}
                                    {latestOption.cfg_scale !== null && latestOption.cfg_scale !== undefined && (
                                        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1">
                                            CFG {latestOption.cfg_scale}
                                        </span>
                                    )}
                                    {latestOption.steps !== null && latestOption.steps !== undefined && (
                                        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1">
                                            Steps {latestOption.steps}
                                        </span>
                                    )}
                                </div>
                            </div>
                            )
                        })()}

                        <div className="flex flex-wrap gap-3 text-xs text-white/55">
                            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                Options: {selectedShot.options?.length || 0}
                            </div>
                            {selectedAspectRatio && (
                                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                    Ratio: {selectedAspectRatio}
                                </div>
                            )}
                            {selectedDuration !== null && (
                                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                    Duration: {selectedDuration}s
                                </div>
                            )}
                            {selectedModel && (
                                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                    Model: {selectedModel}
                                </div>
                            )}
                            {selectedVariations !== null && (
                                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                    Variations: {selectedVariations}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {sequences && sequences.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#0b0b0d] px-4 py-3 text-xs text-white/60">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-white/45">Sequence Target</span>
                    <select
                        value={selectedSequenceId ?? ""}
                        onChange={(event) => setSelectedSequenceId(event.target.value)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
                    >
                        {sequences.map((sequence) => (
                            <option key={sequence.id} value={sequence.id}>
                                {sequence.name}
                            </option>
                        ))}
                    </select>
                    <Button
                        size="sm"
                        className="rounded-full border border-white/10 bg-white/10 text-xs text-white/80 hover:bg-white/20"
                        onClick={() => {
                            const name = window.prompt("Sequence name", "New Sequence")
                            if (!name || !name.trim()) return
                            createSequence(projectId, sceneId, name.trim()).then((res) => {
                                if (res.error || !res.data) {
                                    toast.error(res.error || "Failed to create sequence")
                                    return
                                }
                                setSelectedSequenceId(res.data.id)
                                toast.success("Sequence created")
                            })
                        }}
                    >
                        New Sequence
                    </Button>
                </div>
            )}

            {shots.map((shot) => {
                const approvedOption = shot.options?.find(opt => opt.status === 'approved');
                const latestCompletedImage = shot.options
                    ?.filter((opt) => opt.status === "completed" && opt.output_url && !opt.output_url.endsWith(".mp4"))
                    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0];
                const animateCandidate = approvedOption || latestCompletedImage;
                const selectionPayload = shot.selection_payload as SelectionPayload | null
                const selections = selectionPayload?.selections || {}
                const shotLabel = selections.shot?.label || shot.shot_type
                const movementLabel = selections.movement?.label || shot.camera_movement
                const cameraLabel = selections.camera?.label
                const lensLabel = selections.lens?.label
                return (
                    <Card key={shot.id} className="shot-card rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] transition-all hover:border-white/20">
                        <CardContent className="flex items-center p-3.5">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id={`select-${shot.id}`}
                                    checked={selectedShots.includes(shot.id)}
                                    onCheckedChange={() => toggleSelect(shot.id)}
                                />
                                <GripVertical className="h-4 w-4 text-white/35" />
                                <div className="grid gap-1">
                                    <div className="flex items-center gap-2">
                                        <div className="font-medium">{shot.name}</div>
                                        {approvedOption && (
                                            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                                                Approved
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-white/55">
                                        {shotLabel && (
                                            <Badge variant="outline" className="flex items-center gap-1 border-white/10 bg-white/5 text-white/75">
                                                {shotLabel}
                                            </Badge>
                                        )}
                                        {movementLabel && (
                                            <Badge variant="outline" className="flex items-center gap-1 border-white/10 bg-white/5 text-white/75">
                                                {movementLabel}
                                            </Badge>
                                        )}
                                        {cameraLabel && (
                                            <Badge variant="outline" className="flex items-center gap-1 border-white/10 bg-white/5 text-white/75">
                                                <Camera className="h-3 w-3" />
                                                {cameraLabel}
                                            </Badge>
                                        )}
                                        {lensLabel && (
                                            <Badge variant="outline" className="flex items-center gap-1 border-white/10 bg-white/5 text-white/75">
                                                <Aperture className="h-3 w-3" />
                                                {lensLabel}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 rounded-xl"
                                    onClick={() => handleAppendToSequence(shot.id)}
                                    disabled={!selectedSequenceId}
                                    title="Add to sequence"
                                >
                                    <Video className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 rounded-xl"
                                    onClick={() => handleDuplicate(shot.id)}
                                    title="Duplicate shot"
                                >
                                    <Sparkles className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 rounded-xl"
                                    onClick={() => setSelectedShotId(shot.id)}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                                    disabled={deletingId === shot.id}
                                    onClick={() => handleDelete(shot.id)}
                                >
                                    {deletingId === shot.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-8 gap-1 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                                    disabled={generatingId === shot.id}
                                    onClick={() => handleGenerate(shot.id)}
                                >
                                    {generatingId === shot.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Wand2 className="h-3.5 w-3.5" />
                                    )}
                                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Generate</span>
                                </Button>
                            </div>
                        </CardContent>

                        {/* Rendering Expanded Options */}
                        {(shot.options && shot.options.length > 0) && (
                            <div className="border-t border-white/10 p-3 bg-white/[0.02]">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {shot.options.map((opt) => {
                                        const outputType = getOutputType(opt);
                                        const providerLabel = opt.provider?.name || "Provider";
                                        const statusLabel = opt.status === "processing" ? "Processing" : opt.status;
                                        return (
                                        <Card key={opt.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d]">
                                            <div className="aspect-video relative bg-black/50">
                                                {opt.output_url ? (
                                                    opt.status === 'completed' && opt.output_url.endsWith('.mp4') ? (
                                                        <video src={getVideoProxyUrl(opt.output_url)} className="w-full h-full object-cover" controls playsInline loop muted preload="metadata" />
                                                    ) : (
                                                        <a href={opt.output_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full cursor-zoom-in overflow-hidden">
                                                            <img src={opt.output_url} alt={opt.prompt || ""} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
                                                        </a>
                                                    )
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-white/30">
                                                        {opt.status === 'processing' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                                                    </div>
                                                )}

                                                {/* Approve Overlay */}
                                                {opt.status !== 'approved' && opt.status === 'completed' && !opt.output_url?.endsWith('.mp4') && (
                                                    <div className="absolute top-3 right-3 z-10 transition-all duration-300 hover:scale-105">
                                                        <Button
                                                            size="icon"
                                                            onClick={() => handleApprove(shot.id, opt.id, 'approved')}
                                                            className="h-8 w-8 rounded-full border border-emerald-500/30 bg-black/60 text-emerald-400 font-medium shadow-[0_4px_12px_rgba(16,185,129,0.15)] backdrop-blur-md transition-all hover:bg-emerald-500 hover:border-emerald-400 hover:text-white hover:shadow-[0_4px_20px_rgba(16,185,129,0.4)]"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                                {opt.status === 'approved' && (
                                                    <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200 shadow-[0_6px_18px_rgba(16,185,129,0.25)] backdrop-blur-md">
                                                        <Check className="h-3.5 w-3.5" />
                                                        Approved
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApprove(shot.id, opt.id, 'completed')}
                                                            className="ml-1 rounded-full border border-emerald-400/40 bg-black/40 px-2 py-0.5 text-[10px] text-emerald-100 hover:bg-black/60"
                                                        >
                                                            Undo
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-2 border-t border-white/10 bg-[#111114] p-3 text-xs text-white/55">
                                                <div className="flex items-center justify-between">
                                                    <span>{isMounted ? new Date(opt.created_at).toLocaleTimeString() : ""}</span>
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/70">
                                                        {outputType}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{providerLabel}</span>
                                                    {opt.model_version && (
                                                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                                            {opt.model_version}
                                                        </span>
                                                    )}
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 capitalize">
                                                        {statusLabel}
                                                    </span>
                                                    {opt.output_url && (
                                                        <a
                                                            href={opt.output_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            download
                                                            className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-white/80 hover:bg-white/20"
                                                        >
                                                            Download
                                                        </a>
                                                    )}
                                                    {opt.output_url && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCompare(opt)}
                                                            className={`rounded-full border px-2.5 py-1 ${
                                                                compareTargets.find((item) => item.id === opt.id)
                                                                    ? "border-cyan-400 bg-cyan-400/20 text-cyan-100"
                                                                    : "border-white/10 bg-white/10 text-white/70 hover:bg-white/20"
                                                            }`}
                                                        >
                                                            Compare
                                                        </button>
                                                    )}
                                                    {opt.output_url && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleCompareSet(opt)}
                                                            className={`rounded-full border px-2.5 py-1 ${
                                                                compareSet.includes(opt.id)
                                                                    ? "border-emerald-400 bg-emerald-400/20 text-emerald-100"
                                                                    : "border-white/10 bg-white/10 text-white/70 hover:bg-white/20"
                                                            }`}
                                                        >
                                                            Pin
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    )})}
                                </div>
                                {animateCandidate && !animateCandidate.output_url?.endsWith('.mp4') && (
                                    <div className="mt-3 flex justify-end">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleGenerateVideo(animateCandidate.id)}
                                            disabled={generatingId === animateCandidate.id || animateCandidate.status === 'processing'}
                                            className="h-8 gap-1 rounded-xl text-xs bg-white/10 hover:bg-white/20 text-white"
                                        >
                                            {generatingId === animateCandidate.id ? (
                                                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating Video...</>
                                            ) : (
                                                <><Video className="mr-1.5 h-3.5 w-3.5" /> Animate via Kie.ai</>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                );
            })}
            {selectedShots.length > 0 && (
                <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-3">
                    <Button onClick={handleBatchGenerate} disabled={batchLoading} className="rounded-xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] hover:bg-[#121216]">
                        {batchLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Play className="mr-2 h-4 w-4" />
                        )}
                        Generate {selectedShots.length} Shots
                    </Button>
                    <Button
                        onClick={handleCreateSequence}
                        className="rounded-xl border border-white/10 bg-white/10 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] hover:bg-white/20"
                    >
                        Create Sequence
                    </Button>
                </div>
            )}

            {compareTargets.length === 2 && (
                <Dialog open onOpenChange={() => setCompareTargets([])}>
                    <DialogContent className="max-w-6xl border-white/10 bg-black/95 p-0 text-white">
                        <VisuallyHidden.Root>
                            <DialogTitle>Compare Outputs</DialogTitle>
                        </VisuallyHidden.Root>
                        <div className="grid min-h-[60vh] grid-cols-1 lg:grid-cols-2">
                            {compareTargets.map((target) => (
                                <div key={target.id} className="relative flex items-center justify-center border-r border-white/10 bg-black p-4 last:border-r-0">
                                    {target.output_url?.endsWith(".mp4") ? (
                                        <video src={getVideoProxyUrl(target.output_url)} className="max-h-full max-w-full object-contain" controls autoPlay loop playsInline preload="metadata" />
                                    ) : (
                                        <img src={target.output_url || ""} alt={target.prompt || ""} className="max-h-full max-w-full object-contain" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {compareSet.length > 0 && (
                <Dialog open onOpenChange={() => setCompareSet([])}>
                    <DialogContent className="max-w-6xl border-white/10 bg-black/95 p-0 text-white">
                        <VisuallyHidden.Root>
                            <DialogTitle>Compare Set</DialogTitle>
                        </VisuallyHidden.Root>
                        <div className="grid min-h-[60vh] grid-cols-1 lg:grid-cols-3">
                            {compareSet.map((id) => {
                                const option = shots.flatMap((shot) => shot.options || []).find((opt) => opt.id === id)
                                if (!option) return null
                                return (
                                    <div key={id} className="relative flex items-center justify-center border-r border-white/10 bg-black p-4 last:border-r-0">
                                        {option.output_url?.endsWith(".mp4") ? (
                                            <video src={getVideoProxyUrl(option.output_url)} className="max-h-full max-w-full object-contain" controls autoPlay loop playsInline preload="metadata" />
                                        ) : (
                                            <img src={option.output_url || ""} alt={option.prompt || ""} className="max-h-full max-w-full object-contain" />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div >
    )
}

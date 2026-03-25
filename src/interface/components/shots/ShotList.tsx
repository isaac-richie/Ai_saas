/* eslint-disable @next/next/no-img-element */
"use client"

import { Shot, duplicateShot } from "@/core/actions/shots"
import { Badge } from "@/interface/components/ui/badge"
import { Card, CardContent } from "@/interface/components/ui/card"
import { Button } from "@/interface/components/ui/button"
import { Checkbox } from "@/interface/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/interface/components/ui/dialog"
import { Textarea } from "@/interface/components/ui/textarea"
import { Label } from "@/interface/components/ui/label"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { GripVertical, Camera, Aperture, Wand2, Loader2, Play, Sparkles, Check, Video, Trash2, ChevronRight, X } from "lucide-react"
import { generateShot, generateVideoShot, pollShotStatus } from "@/core/actions/generation"
import { batchGenerate } from "@/core/actions/batch"
import { updateShotStatus, removeShot } from "@/core/actions/shots"
import { addShotsToSequence, appendShotToSequence, createSequence, VideoSequence } from "@/core/actions/sequences"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
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
    const router = useRouter()
    const [generatingId, setGeneratingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [selectedShots, setSelectedShots] = useState<string[]>([])
    const [batchLoading, setBatchLoading] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
    const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null)
    const [compareTargets, setCompareTargets] = useState<ShotOption[]>([])
    const [compareSet, setCompareSet] = useState<string[]>([])
    const [videoPromptDialog, setVideoPromptDialog] = useState<{
        open: boolean
        optionId: string | null
        prompt: string
        useSourceImage: boolean
    }>({
        open: false,
        optionId: null,
        prompt: "Cinematic motion, subtle camera move, natural lighting",
        useSourceImage: true,
    })
    const [deleteDialog, setDeleteDialog] = useState<{
        open: boolean
        shotId: string | null
        shotName: string
    }>({
        open: false,
        shotId: null,
        shotName: "",
    })
    const listRef = useRef<HTMLDivElement>(null)

    const isMediaUrl = (url?: string | null) => {
        if (!url) return false
        if (url === "pending_generation") return false
        return /^https?:\/\//i.test(url) || url.startsWith("/storage/")
    }

    const isVideoUrl = (url?: string | null) => {
        if (!isMediaUrl(url)) return false
        return /\.mp4($|\?)/i.test(url || "")
    }

    const getOutputType = (option: ShotOption) => {
        if (!isMediaUrl(option.output_url)) return "Pending"
        if (isVideoUrl(option.output_url)) return "Video"
        return "Image"
    }

    const getStatusBadgeClass = (status: string) => {
        if (status === "approved") return "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
        if (status === "processing" || status === "pending") return "border-amber-400/35 bg-amber-500/15 text-amber-200"
        if (status === "failed") return "border-red-400/35 bg-red-500/15 text-red-200"
        return "border-white/10 bg-white/5 text-white/70"
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

        const interval = setInterval(async () => {
            const results = await Promise.all(
                processingOptIds.map(async (id) => pollShotStatus(id))
            );
            const hasUpdates = results.some((res) => res?.data && (res.data as { updated?: boolean }).updated);
            if (hasUpdates) {
                router.refresh();
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [shots, isMounted, router])

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

    const openDeleteDialog = (shotId: string, shotName: string) => {
        setDeleteDialog({
            open: true,
            shotId,
            shotName,
        })
    }

    const handleDeleteConfirm = async () => {
        if (!deleteDialog.shotId) return
        const shotId = deleteDialog.shotId
        setDeletingId(shotId)
        try {
            const res = await removeShot(shotId)
            if (res.error) throw new Error(res.error)
            toast.success("Shot removed")
            setDeleteDialog({
                open: false,
                shotId: null,
                shotName: "",
            })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Delete failed"
            toast.error(`Delete failed: ${message}`)
        } finally {
            setDeletingId(null)
        }
    }


    const openVideoPromptDialog = (option: ShotOption) => {
        if (option.status !== "approved") {
            toast.error("Approve an image first before generating video.")
            return
        }
        setVideoPromptDialog({
            open: true,
            optionId: option.id,
            prompt: option.prompt?.trim() || "Cinematic motion, subtle camera move, natural lighting",
            useSourceImage: true,
        })
    }

    const handleGenerateVideo = async () => {
        if (!videoPromptDialog.optionId) return
        setGeneratingId(videoPromptDialog.optionId)
        try {
            const res = await generateVideoShot(videoPromptDialog.optionId, {
                customPrompt: videoPromptDialog.prompt,
                useSourceImage: videoPromptDialog.useSourceImage,
            })
            if (res.error) throw new Error(res.error)
            toast.success("Video generation started. You can continue working while it renders.")
            setVideoPromptDialog((prev) => ({ ...prev, open: false }))
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
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#0f1012] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.16em] text-white/45">Shot Board</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="h-3 w-24 animate-pulse rounded bg-white/15" />
                        <div className="mt-3 aspect-video animate-pulse rounded-lg bg-white/10" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="h-3 w-20 animate-pulse rounded bg-white/15" />
                        <div className="mt-3 aspect-video animate-pulse rounded-lg bg-white/10" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="h-3 w-28 animate-pulse rounded bg-white/15" />
                        <div className="mt-3 aspect-video animate-pulse rounded-lg bg-white/10" />
                    </div>
                </div>
                <p className="mt-4 text-sm text-white/55">
                    No shots added yet. Build your first shot in the panel above and it will appear here.
                </p>
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
                const animateCandidate = approvedOption;
                const hasUnapprovedRenderableImage = !approvedOption && Boolean(latestCompletedImage);
                const isGeneratingShot = generatingId === shot.id;
                const selectionPayload = shot.selection_payload as SelectionPayload | null
                const selections = selectionPayload?.selections || {}
                const shotLabel = selections.shot?.label || shot.shot_type
                const movementLabel = selections.movement?.label || shot.camera_movement
                const cameraLabel = selections.camera?.label
                const lensLabel = selections.lens?.label
                return (
                <Card key={shot.id} className="shot-card rounded-2xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] transition-all hover:border-white/20">
                        <CardContent className="flex flex-col gap-3 p-3.5 md:flex-row md:items-center">
                            <div className="flex min-w-0 items-center gap-2">
                                <Checkbox
                                    id={`select-${shot.id}`}
                                    checked={selectedShots.includes(shot.id)}
                                    onCheckedChange={() => toggleSelect(shot.id)}
                                />
                                <GripVertical className="h-4 w-4 text-white/35" />
                                <div className="grid min-w-0 gap-1">
                                    <div className="flex items-center gap-2">
                                        <div className="truncate font-medium">{shot.name}</div>
                                        {approvedOption && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                                                <Check className="h-3 w-3" />
                                                Approved
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-white/55">
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
                            <div className="flex flex-wrap items-center gap-2 md:ml-auto md:justify-end">
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
                                    onClick={() => openDeleteDialog(shot.id, shot.name)}
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
                        {(shot.options && shot.options.length > 0) ? (
                            <div className="border-t border-white/10 bg-white/[0.02] p-3">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {shot.options.map((opt) => {
                                        const outputType = getOutputType(opt);
                                        const mediaUrl = isMediaUrl(opt.output_url) ? opt.output_url : undefined;
                                        const providerLabel = opt.provider?.name || "Provider";
                                        const statusLabel = opt.status === "processing" ? "Processing" : opt.status;
                                        return (
                                        <Card key={opt.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f1012]">
                                            <div className="relative aspect-video bg-black/50">
                                                {mediaUrl ? (
                                                    opt.status === 'completed' && isVideoUrl(mediaUrl) ? (
                                                        <video src={getVideoProxyUrl(mediaUrl)} className="h-full w-full object-contain" controls playsInline loop muted preload="metadata" />
                                                    ) : (
                                                        <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full cursor-zoom-in overflow-hidden">
                                                            <img src={mediaUrl} alt={opt.prompt || ""} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                                                        </a>
                                                    )
                                                ) : (
                                                    <div className="absolute inset-0 overflow-hidden">
                                                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-white/5 to-orange-400/10 animate-pulse" />
                                                        <div className="absolute -inset-[45%] bg-[conic-gradient(from_180deg,rgba(34,211,238,0.12),rgba(251,146,60,0.12),rgba(255,255,255,0),rgba(34,211,238,0.12))] animate-[spin_9s_linear_infinite]" />
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/70">
                                                            {opt.status === 'processing' ? (
                                                                <>
                                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                                    <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">Rendering</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Sparkles className="h-5 w-5" />
                                                                    <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">Queued</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Approve Overlay */}
                                                {opt.status !== 'approved' && opt.status === 'completed' && !isVideoUrl(opt.output_url) && (
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
                                                {opt.prompt && (
                                                    <div className="max-h-16 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2 text-[11px] leading-relaxed text-white/65 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                                        {opt.prompt}
                                                    </div>
                                                )}
                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{providerLabel}</span>
                                                    {opt.model_version && (
                                                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                                                            {opt.model_version}
                                                        </span>
                                                    )}
                                                    <span className={`rounded-full border px-2.5 py-1 capitalize ${getStatusBadgeClass(opt.status)}`}>
                                                        {statusLabel}
                                                    </span>
                                                    {mediaUrl && (
                                                        <a
                                                            href={mediaUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            download
                                                            className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-white/80 hover:bg-white/20"
                                                        >
                                                            Download
                                                        </a>
                                                    )}
                                                    {mediaUrl && (
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
                                                    {mediaUrl && (
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
                                            onClick={() => openVideoPromptDialog(animateCandidate)}
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
                                {hasUnapprovedRenderableImage && (
                                    <div className="mt-3 flex items-center justify-end gap-2">
                                        <span className="text-[11px] text-amber-200/80">Approve one generated image to unlock video generation.</span>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled
                                            className="h-8 gap-1 rounded-xl text-xs bg-white/5 text-white/45"
                                        >
                                            <Video className="mr-1.5 h-3.5 w-3.5" /> Animate via Kie.ai
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="border-t border-white/10 bg-white/[0.02] p-3">
                                <div className="rounded-2xl border border-dashed border-white/15 bg-[#0f1012] p-4">
                                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-white/45">Awaiting First Render</div>
                                    {isGeneratingShot ? (
                                        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 p-5 text-center">
                                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-white/5 to-orange-400/10 animate-pulse" />
                                            <div className="absolute -inset-[45%] bg-[conic-gradient(from_180deg,rgba(34,211,238,0.15),rgba(251,146,60,0.14),rgba(255,255,255,0),rgba(34,211,238,0.15))] animate-[spin_10s_linear_infinite]" />
                                            <div className="relative z-10">
                                                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-white/80" />
                                                <p className="text-xs uppercase tracking-[0.2em] text-white/65">Generating frame...</p>
                                                <p className="mt-1 text-[11px] text-white/45">Your first output will appear here automatically.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-center">
                                            <Sparkles className="mx-auto mb-2 h-5 w-5 text-white/35" />
                                            <p className="text-xs text-white/55">
                                                Click <span className="text-white/80">Generate</span> to create the first visual for this shot.
                                            </p>
                                        </div>
                                    )}
                                </div>
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

            <Dialog
                open={deleteDialog.open}
                onOpenChange={(open) => {
                    if (!open && deletingId) return
                    setDeleteDialog((prev) => ({ ...prev, open }))
                }}
            >
                <DialogContent className="max-w-md border-white/10 bg-[#111114] text-white">
                    <DialogTitle className="text-base font-semibold">Delete Shot?</DialogTitle>
                    <p className="mt-2 text-sm text-white/70">
                        This will permanently remove <span className="font-medium text-white">{deleteDialog.shotName || "this shot"}</span> and all generated outputs attached to it.
                    </p>
                    <div className="mt-5 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            className="rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                            disabled={Boolean(deletingId)}
                            onClick={() => setDeleteDialog({ open: false, shotId: null, shotName: "" })}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="rounded-xl bg-red-500/90 text-white hover:bg-red-500"
                            disabled={Boolean(deletingId)}
                            onClick={handleDeleteConfirm}
                        >
                            {deletingId ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                "Delete Shot"
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={videoPromptDialog.open}
                onOpenChange={(open) => setVideoPromptDialog((prev) => ({ ...prev, open }))}
            >
                <DialogContent className="max-w-xl border-white/10 bg-[#111114] text-white">
                    <VisuallyHidden.Root>
                        <DialogTitle>Video Generation Prompt</DialogTitle>
                    </VisuallyHidden.Root>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-base font-semibold">Edit Video Prompt</h3>
                            <p className="text-sm text-white/55">
                                Fine-tune the prompt here before generating video.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="video-prompt">Prompt</Label>
                            <Textarea
                                id="video-prompt"
                                value={videoPromptDialog.prompt}
                                onChange={(event) =>
                                    setVideoPromptDialog((prev) => ({ ...prev, prompt: event.target.value }))
                                }
                                rows={5}
                                className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                placeholder="Describe camera motion, pacing, and visual style..."
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-white/75">
                            <Checkbox
                                checked={videoPromptDialog.useSourceImage}
                                onCheckedChange={(checked) =>
                                    setVideoPromptDialog((prev) => ({ ...prev, useSourceImage: Boolean(checked) }))
                                }
                            />
                            Use selected image as start frame (image-to-video)
                        </label>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                className="rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                                onClick={() => setVideoPromptDialog((prev) => ({ ...prev, open: false }))}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/20"
                                disabled={generatingId === videoPromptDialog.optionId || !videoPromptDialog.prompt.trim()}
                                onClick={handleGenerateVideo}
                            >
                                {generatingId === videoPromptDialog.optionId ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Video className="mr-2 h-4 w-4" />
                                        Generate Video
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    )
}

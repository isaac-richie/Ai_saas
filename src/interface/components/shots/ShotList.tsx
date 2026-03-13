/* eslint-disable @next/next/no-img-element */
"use client"

import { Shot } from "@/core/actions/shots"
import { Badge } from "@/interface/components/ui/badge"
import { Card, CardContent } from "@/interface/components/ui/card"
import { Button } from "@/interface/components/ui/button"
import { Checkbox } from "@/interface/components/ui/checkbox"
import { GripVertical, Camera, Aperture, Wand2, Loader2, Play, Sparkles, Check, Video, Trash2, ChevronRight, X } from "lucide-react"
import { generateShot, generateVideoShot, pollShotStatus } from "@/core/actions/generation"
import { batchGenerate } from "@/core/actions/batch"
import { updateShotStatus, removeShot } from "@/core/actions/shots"
import { addShotsToSequence, createSequence } from "@/core/actions/sequences"
import { addShotReference, deleteShotReference, getShotReferences } from "@/core/actions/references"
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
}

type ShotOption = {
    id: string
    prompt?: string | null
    output_url?: string | null
    created_at: string
    status: string
}

type ShotReference = {
    id: string
    shot_id: string
    url: string
    type: string | null
}

export function ShotList({ shots, projectId, sceneId }: ShotListProps) {
    const [generatingId, setGeneratingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [selectedShots, setSelectedShots] = useState<string[]>([])
    const [batchLoading, setBatchLoading] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [referenceMap, setReferenceMap] = useState<Record<string, ShotReference[]>>({})
    const [referenceInputs, setReferenceInputs] = useState<Record<string, string>>({})
    const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
    const listRef = useRef<HTMLDivElement>(null)

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
        let active = true
        const loadReferences = async () => {
            const entries = await Promise.all(
                shots.map(async (shot) => {
                    const res = await getShotReferences(shot.id)
                    return [shot.id, res.data || []] as const
                })
            )
            if (!active) return
            const nextMap: Record<string, ShotReference[]> = {}
            for (const [shotId, refs] of entries) {
                nextMap[shotId] = refs
            }
            setReferenceMap(nextMap)
        }
        if (shots.length > 0) {
            loadReferences()
        }
        return () => {
            active = false
        }
    }, [shots])

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

    const handleAddReference = async (shotId: string) => {
        const input = referenceInputs[shotId]?.trim()
        if (!input) return
        const existing = referenceMap[shotId] || []
        if (existing.some((ref) => ref.url === input)) {
            toast.error("Reference already added")
            return
        }
        const res = await addShotReference(shotId, input, "image")
        if (res.error || !res.data) {
            toast.error(`Failed to add reference: ${res.error || "Unknown error"}`)
            return
        }
        setReferenceMap((prev) => ({
            ...prev,
            [shotId]: [res.data as ShotReference, ...(prev[shotId] || [])],
        }))
        setReferenceInputs((prev) => ({ ...prev, [shotId]: "" }))
    }

    const handleRemoveReference = async (shotId: string, refId: string) => {
        const res = await deleteShotReference(refId)
        if (res.error) {
            toast.error(`Failed to remove reference: ${res.error}`)
            return
        }
        setReferenceMap((prev) => ({
            ...prev,
            [shotId]: (prev[shotId] || []).filter((ref) => ref.id !== refId),
        }))
    }

    const handleGenerateVideo = async (optionId: string) => {
        setGeneratingId(optionId)
        try {
            const res = await generateVideoShot(optionId)
            if (res.error) throw new Error(res.error)
            toast.success("Video generation started! This may take a few minutes. Refresh later to see the result.")
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Video generation failed"
            toast.error(`Video generation failed: ${message}`)
        } finally {
            setGeneratingId(null)
        }
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

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Shot Type</div>
                                <div className="mt-1 font-medium text-white/90">{selectedShot.shot_type || "—"}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Movement</div>
                                <div className="mt-1 font-medium text-white/90">{selectedShot.camera_movement || "—"}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Camera</div>
                                <div className="mt-1 font-medium text-white/90">{selectedShot.camera?.name || "—"}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">Lens</div>
                                <div className="mt-1 font-medium text-white/90">{selectedShot.lens?.name || "—"}</div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 text-xs text-white/55">
                            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                References: {(referenceMap[selectedShot.id] || []).length}
                            </div>
                            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                Options: {selectedShot.options?.length || 0}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {shots.map((shot) => {
                const approvedOption = shot.options?.find(opt => opt.status === 'approved');
                const references = referenceMap[shot.id] || []
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
                                        {shot.camera && (
                                            <Badge variant="outline" className="flex items-center gap-1 border-white/10 bg-white/5 text-white/75">
                                                <Camera className="h-3 w-3" />
                                                {shot.camera.name}
                                            </Badge>
                                        )}
                                        {shot.lens && (
                                            <Badge variant="outline" className="flex items-center gap-1 border-white/10 bg-white/5 text-white/75">
                                                <Aperture className="h-3 w-3" />
                                                {shot.lens.name}
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

                        <div className="border-t border-white/10 px-3 py-2 bg-white/[0.02]">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-xs uppercase tracking-[0.12em] text-white/45">References</div>
                                {references.length === 0 && (
                                    <span className="text-xs text-white/40">No references yet.</span>
                                )}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {references.map((ref) => (
                                    <button
                                        key={ref.id}
                                        type="button"
                                        onClick={() => handleRemoveReference(shot.id, ref.id)}
                                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 hover:bg-white/10"
                                        title="Remove reference"
                                    >
                                        {ref.url}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-2 flex gap-2">
                                <input
                                    value={referenceInputs[shot.id] || ""}
                                    onChange={(event) =>
                                        setReferenceInputs((prev) => ({ ...prev, [shot.id]: event.target.value }))
                                    }
                                    placeholder="Add reference URL"
                                    className="h-8 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white/80 placeholder:text-white/35"
                                />
                                <Button
                                    size="sm"
                                    className="h-8 rounded-xl border border-white/10 bg-white/10 text-xs text-white/80 hover:bg-white/15"
                                    onClick={() => handleAddReference(shot.id)}
                                >
                                    Add
                                </Button>
                            </div>
                        </div>

                        {/* Rendering Expanded Options */}
                        {(shot.options && shot.options.length > 0) && (
                            <div className="border-t border-white/10 p-3 bg-white/[0.02]">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {shot.options.map((opt) => (
                                        <Card key={opt.id} className="overflow-hidden border-white/10 bg-[#0b0b0d]">
                                            <div className="aspect-video relative bg-black/50">
                                                {opt.output_url ? (
                                                    opt.status === 'completed' && opt.output_url.endsWith('.mp4') ? (
                                                        <video src={opt.output_url} className="w-full h-full object-cover" controls playsInline loop muted />
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
                                            <div className="p-2 flex justify-between items-center text-xs text-white/50 bg-[#111114]">
                                                <span>{isMounted ? new Date(opt.created_at).toLocaleTimeString() : ""}</span>
                                                {opt.status === 'processing' && <Badge variant="outline" className="text-[10px]">Processing</Badge>}
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                                {approvedOption && !approvedOption.output_url?.endsWith('.mp4') && (
                                    <div className="mt-3 flex justify-end">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleGenerateVideo(approvedOption.id)}
                                            disabled={generatingId === approvedOption.id || approvedOption.status === 'processing'}
                                            className="h-8 gap-1 rounded-xl text-xs bg-white/10 hover:bg-white/20 text-white"
                                        >
                                            {generatingId === approvedOption.id ? (
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
        </div >
    )
}

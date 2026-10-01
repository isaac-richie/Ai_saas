"use client"

import type * as React from "react"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/interface/components/ui/badge"
import { Button } from "@/interface/components/ui/button"
import {
    cancelExportJob,
    ExportJobItemRow,
    ExportJobRow,
    getExportJobItems,
    retryExportJob,
} from "@/core/actions/exports"
import { Download, Loader2, RefreshCcw } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface ExportJobsPanelProps {
    jobs: ExportJobRow[]
}

const profileLabels: Record<string, string> = {
    master_16_9: "16:9 Master",
    social_9_16: "9:16 Social",
    square_1_1: "1:1 Square",
}

function statusClass(status: string) {
    if (status === "completed") return "border-[#b6ddd3]/35 bg-[#b6ddd3]/10 text-[#d6efe8]"
    if (status === "processing") return "border-gold-400/40 bg-gold-400/12 text-gold-100"
    if (status === "failed") return "border-red-400/35 bg-red-500/12 text-red-200"
    return "border-gold-400/15 bg-white/[0.04] text-[#c8c3b3]"
}

export function ExportJobsPanel({ jobs }: ExportJobsPanelProps) {
    const router = useRouter()
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
    const [itemsByJob, setItemsByJob] = useState<Record<string, ExportJobItemRow[]>>({})
    const [loadingItemsFor, setLoadingItemsFor] = useState<string | null>(null)
    const [actioningJobId, setActioningJobId] = useState<string | null>(null)
    const [processingQueue, setProcessingQueue] = useState(false)

    const stats = useMemo(() => {
        return jobs.reduce(
            (acc, job) => {
                acc.total += 1
                if (job.status === "completed") acc.completed += 1
                else if (job.status === "failed") acc.failed += 1
                else if (job.status === "processing") acc.processing += 1
                else acc.queued += 1
                return acc
            },
            { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 }
        )
    }, [jobs])

    useEffect(() => {
        const hasActive = jobs.some((job) => job.status === "queued" || job.status === "processing")
        if (!hasActive) return

        const timer = window.setInterval(() => {
            router.refresh()
        }, 20000)

        return () => window.clearInterval(timer)
    }, [jobs, router])

    const handleToggleItems = async (jobId: string) => {
        if (expandedJobId === jobId) {
            setExpandedJobId(null)
            return
        }

        setExpandedJobId(jobId)
        if (itemsByJob[jobId]) return

        setLoadingItemsFor(jobId)
        const res = await getExportJobItems(jobId)
        setLoadingItemsFor(null)

        if (res.error) {
            toast.error(res.error)
            return
        }

        setItemsByJob((prev) => ({ ...prev, [jobId]: res.data || [] }))
    }

    const handleRetry = async (jobId: string) => {
        setActioningJobId(jobId)
        const res = await retryExportJob(jobId)
        setActioningJobId(null)

        if (res.error) {
            toast.error(res.error)
            return
        }

        toast.success("Export re-queued")
        window.location.reload()
    }

    const handleProcessQueue = async (jobId?: string) => {
        setProcessingQueue(true)
        try {
            const response = await fetch("/api/exports/worker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(jobId ? { jobId, limit: 1 } : { limit: 3 }),
            })
            const data = await response.json()
            if (!response.ok) {
                toast.error(data?.error || "Failed to process export queue")
                return
            }

            const processed = Number(data?.processed || 0)
            if (processed > 0) {
                toast.success(`Processed ${processed} export job(s)`)
            } else {
                toast.message(data?.message || "No queued exports")
            }
            window.location.reload()
        } catch {
            toast.error("Failed to process export queue")
        } finally {
            setProcessingQueue(false)
        }
    }

    const handleCancel = async (jobId: string) => {
        setActioningJobId(jobId)
        const res = await cancelExportJob(jobId)
        setActioningJobId(null)

        if (res.error) {
            toast.error(res.error)
            return
        }

        toast.success("Export removed")
        window.location.reload()
    }

    if (jobs.length === 0) {
        return (
            <section className="rounded-2xl border border-dashed border-gold-400/20 bg-obsidian-950 p-6 text-sm text-white/60">
                No export jobs yet. Queue exports from Gallery by selecting assets and clicking `Batch Export`.
            </section>
        )
    }

    return (
        <div className="space-y-4">
            <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-400/[0.12] bg-obsidian-900 px-3 py-2">
                <p className="text-xs text-white/60">
                    Run queue to process pending exports now.
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg border border-gold-400/[0.12] text-white/75 hover:bg-gold-400/[0.08]"
                        onClick={() => window.location.reload()}
                    >
                        <RefreshCcw className="h-4 w-4" />
                        Refresh
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg border border-gold-400/30 bg-gold-500/10 text-gold-100 hover:bg-gold-500/20"
                        onClick={() => handleProcessQueue()}
                        disabled={processingQueue}
                    >
                        {processingQueue ? <Loader2 className="h-4 w-4 animate-spin" /> : "Process Queue"}
                    </Button>
                </div>
            </section>

            <section className="lux-stagger grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                    { label: "Total", value: stats.total, tone: "text-[#f3eee2]", dot: "bg-[#8f9086]" },
                    { label: "Queued", value: stats.queued, tone: "text-gold-100", dot: "bg-gold-200/60" },
                    { label: "Processing", value: stats.processing, tone: "text-gold-200", dot: "bg-gold-400 shadow-[0_0_8px_rgba(217,192,138,0.9)]" },
                    { label: "Completed", value: stats.completed, tone: "text-[#d6efe8]", dot: "bg-[#b6ddd3]" },
                    { label: "Failed", value: stats.failed, tone: "text-red-200", dot: "bg-red-400" },
                ].map((stat, index) => (
                    <div
                        key={stat.label}
                        style={{ "--i": index } as React.CSSProperties}
                        className="lux-lift lux-spotlight rounded-2xl border border-gold-400/[0.12] bg-obsidian-900 p-4"
                    >
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">
                            <span className={`size-1.5 rounded-full ${stat.dot}`} />
                            {stat.label}
                        </div>
                        <div className={`mt-2 text-3xl font-light tracking-[-0.04em] tabular-nums ${stat.tone}`}>{stat.value}</div>
                    </div>
                ))}
            </section>

            <section className="lux-stagger space-y-3">
                {jobs.map((job, jobIndex) => {
                    const items = itemsByJob[job.id] || []
                    const isExpanded = expandedJobId === job.id
                    const isBusy = actioningJobId === job.id
                    const projectName = Array.isArray(job.projects) ? job.projects[0]?.name : job.projects?.name
                    return (
                        <article
                            key={job.id}
                            style={{ "--i": Math.min(jobIndex, 10) } as React.CSSProperties}
                            className="lux-spotlight rounded-2xl border border-gold-400/[0.12] bg-obsidian-900 p-5 text-white transition-[border-color,box-shadow] duration-300 hover:border-gold-400/30 hover:shadow-[0_20px_40px_-28px_rgba(217,192,138,0.35)]"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge className={`gap-1.5 capitalize ${statusClass(job.status)}`}>
                                            {job.status === "processing" ? <span className="lux-live-dot !size-1.5" /> : null}
                                            {job.status}
                                        </Badge>
                                        <Badge className="border border-gold-400/[0.12] bg-white/5 text-white/80">
                                            {profileLabels[job.profile] || job.profile}
                                        </Badge>
                                        {projectName ? (
                                            <Badge className="border border-gold-400/[0.12] bg-white/5 text-white/80">{projectName}</Badge>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-white/50">
                                        Created {new Date(job.created_at).toLocaleString()} · Updated {new Date(job.updated_at).toLocaleString()}
                                    </div>
                                    <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.06]">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-gold-600 via-gold-300 to-gold-100 shadow-[0_0_12px_rgba(217,192,138,0.7)] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                                            style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-lg border border-gold-400/[0.12] text-white/75 hover:bg-gold-400/[0.08]"
                                        onClick={() => handleToggleItems(job.id)}
                                    >
                                        {isExpanded ? "Hide Items" : "View Items"}
                                    </Button>
                                    {(job.status === "queued" || job.status === "processing") && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="rounded-lg border border-gold-400/30 bg-gold-500/10 text-gold-100 hover:bg-gold-500/20"
                                            onClick={() => handleProcessQueue(job.id)}
                                            disabled={processingQueue}
                                        >
                                            {processingQueue ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run Now"}
                                        </Button>
                                    )}
                                    {job.status === "failed" && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                                            onClick={() => handleRetry(job.id)}
                                            disabled={isBusy}
                                        >
                                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
                                        </Button>
                                    )}
                                    {(job.status === "queued" || job.status === "failed") && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                                            onClick={() => handleCancel(job.id)}
                                            disabled={isBusy}
                                        >
                                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {job.output_url && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <a
                                        href={`/api/media/proxy?url=${encodeURIComponent(job.output_url)}&filename=${encodeURIComponent(`visiowave-export-${(profileLabels[job.profile] || job.profile).replace(/[^a-zA-Z0-9]/g, "-")}.${job.output_url.endsWith(".json") ? "json" : "mp4"}`)}`}
                                        download
                                        className="inline-flex items-center rounded-lg border border-gold-400/30 bg-gold-500/10 px-3 py-1.5 text-xs text-gold-100 hover:bg-gold-500/20"
                                    >
                                        <Download className="mr-1.5 h-3.5 w-3.5" />
                                        Download
                                    </a>
                                    <a
                                        href={job.output_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex rounded-lg border border-gold-400/20 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-gold-400/[0.08]"
                                    >
                                        Open in New Tab
                                    </a>
                                </div>
                            )}

                            {isExpanded && (
                                <div className="mt-4 rounded-xl border border-gold-400/[0.12] bg-black/30 p-3">
                                    {loadingItemsFor === job.id ? (
                                        <div className="flex items-center gap-2 text-xs text-white/60">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading export items...
                                        </div>
                                    ) : items.length === 0 ? (
                                        <div className="text-xs text-white/60">No items found for this job.</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {items.map((item, index) => (
                                                <div
                                                    key={item.id}
                                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-400/[0.12] bg-white/5 px-3 py-2 text-xs"
                                                >
                                                    <div className="text-white/75">
                                                        Item {index + 1} · {item.source_url ? "Source attached" : "Missing source"}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge className={`capitalize ${statusClass(item.status)}`}>{item.status}</Badge>
                                                        {item.output_url ? (
                                                            <a
                                                                href={item.output_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="rounded-full border border-white/20 px-2 py-0.5 text-white/80 hover:bg-gold-400/[0.08]"
                                                            >
                                                                Open
                                                            </a>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </article>
                    )
                })}
            </section>
        </div>
    )
}

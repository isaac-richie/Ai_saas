"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/interface/components/ui/badge"
import { Button } from "@/interface/components/ui/button"
import {
    cancelExportJob,
    ExportJobItemRow,
    ExportJobRow,
    getExportJobItems,
    retryExportJob,
} from "@/core/actions/exports"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface ExportJobsPanelProps {
    jobs: ExportJobRow[]
}

const profileLabels: Record<string, string> = {
    master_16_9: "16:9 Master",
    social_9_16: "9:16 Social",
    square_1_1: "1:1 Square",
}

function statusClass(status: string) {
    if (status === "completed") return "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
    if (status === "processing") return "border-amber-400/35 bg-amber-500/15 text-amber-200"
    if (status === "failed") return "border-red-400/35 bg-red-500/15 text-red-200"
    return "border-cyan-400/35 bg-cyan-500/15 text-cyan-200"
}

export function ExportJobsPanel({ jobs }: ExportJobsPanelProps) {
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
    const [itemsByJob, setItemsByJob] = useState<Record<string, ExportJobItemRow[]>>({})
    const [loadingItemsFor, setLoadingItemsFor] = useState<string | null>(null)
    const [actioningJobId, setActioningJobId] = useState<string | null>(null)

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
            <section className="rounded-2xl border border-dashed border-white/15 bg-[#0b0b0d] p-6 text-sm text-white/60">
                No export jobs yet. Queue exports from Gallery by selecting assets and clicking `Batch Export`.
            </section>
        )
    }

    return (
        <div className="space-y-4">
            <section className="grid gap-3 md:grid-cols-5">
                <div className="rounded-xl border border-white/10 bg-[#0f1012] p-3 text-sm text-white/70">Total: {stats.total}</div>
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-sm text-cyan-100">Queued: {stats.queued}</div>
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">Processing: {stats.processing}</div>
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">Completed: {stats.completed}</div>
                <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">Failed: {stats.failed}</div>
            </section>

            <section className="space-y-3">
                {jobs.map((job) => {
                    const items = itemsByJob[job.id] || []
                    const isExpanded = expandedJobId === job.id
                    const isBusy = actioningJobId === job.id
                    const projectName = Array.isArray(job.projects) ? job.projects[0]?.name : job.projects?.name
                    return (
                        <article
                            key={job.id}
                            className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-4 text-white shadow-[0_16px_30px_-24px_rgba(0,0,0,0.88)]"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge className={`capitalize ${statusClass(job.status)}`}>{job.status}</Badge>
                                        <Badge className="border border-white/10 bg-white/5 text-white/80">
                                            {profileLabels[job.profile] || job.profile}
                                        </Badge>
                                        {projectName ? (
                                            <Badge className="border border-white/10 bg-white/5 text-white/80">{projectName}</Badge>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-white/50">
                                        Created {new Date(job.created_at).toLocaleString()} · Updated {new Date(job.updated_at).toLocaleString()}
                                    </div>
                                    <div className="h-2 w-full max-w-xs overflow-hidden rounded-full border border-white/10 bg-white/5">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-orange-300 transition-all"
                                            style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-lg border border-white/10 text-white/75 hover:bg-white/10"
                                        onClick={() => handleToggleItems(job.id)}
                                    >
                                        {isExpanded ? "Hide Items" : "View Items"}
                                    </Button>
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

                            {isExpanded && (
                                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
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
                                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
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
                                                                className="rounded-full border border-white/20 px-2 py-0.5 text-white/80 hover:bg-white/10"
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

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { Loader2, X, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import {
  listGenerationJobs,
  cancelGenerationJob,
  type GenerationJob,
  type GenerationJobStatus,
} from "@/core/actions/generation-jobs"

const STATUS_COLORS: Record<GenerationJobStatus, string> = {
  queued: "border-white/10 bg-white/5 text-white/60",
  preparing: "border-cyan-400/20 bg-cyan-500/10 text-cyan-300/70",
  submitted: "border-cyan-400/20 bg-cyan-500/10 text-cyan-300/70",
  generating: "border-cyan-400/25 bg-cyan-500/15 text-cyan-200",
  downloading: "border-cyan-400/25 bg-cyan-500/15 text-cyan-200",
  processing: "border-cyan-400/25 bg-cyan-500/15 text-cyan-200",
  completed: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300/70",
  failed: "border-rose-400/20 bg-rose-500/10 text-rose-300/70",
  cancelled: "border-white/10 bg-white/5 text-white/40",
}

const ACTIVE_STATUSES = new Set<GenerationJobStatus>([
  "queued", "preparing", "submitted", "generating", "downloading", "processing",
])

export function GenerationJobsPanel() {
  const [jobs, setJobs] = useState<GenerationJob[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await listGenerationJobs({ limit: 15 })
      if (mountedRef.current && res.data) setJobs(res.data)
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const hasActiveJobs = jobs.some((j) => ACTIVE_STATUSES.has(j.status))

  useEffect(() => {
    if (!hasActiveJobs) return
    const interval = setInterval(() => void refresh(), 5000)
    return () => clearInterval(interval)
  }, [hasActiveJobs, refresh])

  const handleCancel = async (jobId: string) => {
    const res = await cancelGenerationJob(jobId)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "cancelled" as const } : j)))
    toast.success("Job cancelled")
  }

  const activeCount = jobs.filter((j) => ACTIVE_STATUSES.has(j.status)).length

  if (jobs.length === 0 && !isLoading) return null

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/35 font-medium">
            Generation Jobs
          </p>
          {activeCount > 0 && (
            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-300">
              {activeCount} active
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="liquidMetal"
          size="sm"
          onClick={() => void refresh()}
          disabled={isLoading}
          className="h-7 w-7 p-0"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {jobs.map((job) => {
          const isActive = ACTIVE_STATUSES.has(job.status)
          return (
            <div
              key={job.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isActive && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-300/60" />}
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${STATUS_COLORS[job.status]}`}>
                    {job.status}
                  </span>
                  <span className="truncate text-[10px] text-white/50">
                    {job.provider}{job.model ? ` · ${job.model}` : ""}
                  </span>
                </div>
                {job.progress > 0 && job.progress < 100 && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-400/50 transition-[width] duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                )}
                {job.errorMessage && (
                  <p className="mt-1 truncate text-[10px] text-rose-300/60">{job.errorMessage}</p>
                )}
                <p className="mt-0.5 text-[9px] text-white/25">
                  {new Date(job.createdAt).toLocaleString()}
                </p>
              </div>

              {isActive && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCancel(job.id)}
                  className="h-6 w-6 shrink-0 rounded-md p-0 text-white/30 hover:bg-white/[0.06] hover:text-white/60"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { Check, Trash2, Play, RotateCcw } from "lucide-react"

export type TakeItem = {
  id: string
  takeNumber: number
  prompt: string
  compiledPrompt: string | null
  modelVersionUsed: string | null
  status: string
  outputUrl: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  aspectRatio: string | null
  createdAt: string
}

interface TakesPanelProps {
  takes: TakeItem[]
  approvedTakeId: string | null
  activeTakeId: string | null
  onSelectTake: (take: TakeItem) => void
  onApproveTake: (takeId: string) => void
  onDeleteTake: (takeId: string) => void
  onRetry: () => void
  isRetrying?: boolean
}

export function TakesPanel({
  takes,
  approvedTakeId,
  activeTakeId,
  onSelectTake,
  onApproveTake,
  onDeleteTake,
  onRetry,
  isRetrying,
}: TakesPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  if (takes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[11px] uppercase tracking-[0.12em] text-white/35 font-medium mb-2">Takes</p>
        <p className="text-xs text-white/40">Generate your first take to see results here.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-white/35 font-medium">
          Takes ({takes.length})
        </p>
        <Button
          type="button"
          variant="liquidMetal"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="h-7 px-2.5 text-[10px]"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          New Take
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
        {takes.map((take) => {
          const isActive = activeTakeId === take.id
          const isApproved = approvedTakeId === take.id
          const isCompleted = take.status === "completed"
          const isFailed = take.status === "failed"

          return (
            <div
              key={take.id}
              className={`min-w-[200px] snap-start rounded-xl border p-3 transition-all duration-200 ${
                isActive
                  ? "border-cyan-400/30 bg-cyan-500/[0.08] shadow-[0_12px_28px_-18px_rgba(34,211,238,0.5)]"
                  : isApproved
                    ? "border-emerald-400/25 bg-emerald-500/[0.06]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => isCompleted && onSelectTake(take)}
                disabled={!isCompleted}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-white/85">
                    Take {take.takeNumber}
                  </span>
                  <div className="flex items-center gap-1">
                    {isApproved && (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-300">
                        Approved
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] ${
                        isCompleted
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300/70"
                          : isFailed
                            ? "border-rose-400/20 bg-rose-500/10 text-rose-300/70"
                            : "border-cyan-400/20 bg-cyan-500/10 text-cyan-300/70"
                      }`}
                    >
                      {take.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] text-white/40 line-clamp-2">
                  {take.prompt?.slice(0, 80) || "No prompt"}
                </p>
                <p className="mt-1 text-[10px] text-white/30">
                  {new Date(take.createdAt).toLocaleString()}
                </p>
              </button>

              {isCompleted && (
                <div className="mt-2 flex items-center gap-1">
                  {!isApproved && (
                    <Button
                      type="button"
                      variant="liquidMetal"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onApproveTake(take.id)
                      }}
                    >
                      <Check className="mr-1 h-2.5 w-2.5" />
                      Approve
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="liquidMetal"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectTake(take)
                    }}
                  >
                    <Play className="mr-1 h-2.5 w-2.5" />
                    View
                  </Button>
                  {confirmDeleteId === take.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] border border-rose-400/20 bg-rose-500/10 text-rose-300"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteTake(take.id)
                        setConfirmDeleteId(null)
                      }}
                    >
                      Confirm
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-md text-white/30 hover:bg-white/[0.06] hover:text-white/60"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(take.id)
                        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
                        confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000)
                      }}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

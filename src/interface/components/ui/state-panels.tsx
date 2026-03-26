import { ReactNode } from "react"
import { AlertTriangle, Inbox, Loader2 } from "lucide-react"
import { CinematicSkeleton } from "@/interface/components/ui/CinematicSkeleton"

interface StatePanelProps {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
  compact?: boolean
}

export function EmptyStatePanel({ title, description, action, icon, compact = false }: StatePanelProps) {
  return (
    <div className={`rounded-2xl border border-dashed border-white/15 bg-[#0b0b0d] text-center ${compact ? "p-5" : "p-8"}`}>
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white/45">{icon || <Inbox className="h-5 w-5" />}</div>
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-white/55">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function ErrorStatePanel({ title, description, action, icon, compact = false }: StatePanelProps) {
  return (
    <div className={`rounded-2xl border border-red-500/25 bg-red-500/5 text-center ${compact ? "p-5" : "p-8"}`}>
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-red-500/15 text-red-200">{icon || <AlertTriangle className="h-5 w-5" />}</div>
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-white/70">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function LoadingStatePanel({ title = "Loading", description = "Preparing workspace...", compact = false }: { title?: string; description?: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#0f1012] text-center ${compact ? "p-5" : "p-8"}`}>
      <Loader2 className="mx-auto h-5 w-5 animate-spin text-white/60" />
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-white/55">{description}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <CinematicSkeleton className="h-16" />
        <CinematicSkeleton className="h-16" />
        <CinematicSkeleton className="h-16" />
      </div>
    </div>
  )
}

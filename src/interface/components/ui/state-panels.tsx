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
    <div className={`lux-rise relative overflow-hidden rounded-2xl border border-dashed border-gold-400/20 [background:radial-gradient(80%_120%_at_50%_0%,rgba(217,192,138,0.06),transparent_60%),#0f110f] text-center ${compact ? "p-5" : "p-10"}`}>
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-gold-400/20 bg-gold-400/[0.06] text-gold-300 shadow-[0_0_30px_-10px_rgba(217,192,138,0.5)]">{icon || <Inbox className="h-5 w-5" />}</div>
      <h3 className="mt-4 text-[15px] font-medium tracking-tight text-[#f3eee2]">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-[#a3a59a]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorStatePanel({ title, description, action, icon, compact = false }: StatePanelProps) {
  return (
    <div className={`lux-rise rounded-2xl border border-red-400/25 [background:radial-gradient(80%_120%_at_50%_0%,rgba(224,122,106,0.08),transparent_60%),#120f0e] text-center ${compact ? "p-5" : "p-8"}`}>
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-red-500/15 text-red-200">{icon || <AlertTriangle className="h-5 w-5" />}</div>
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-white/70">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function LoadingStatePanel({ title = "Loading", description = "Preparing workspace...", compact = false }: { title?: string; description?: string; compact?: boolean }) {
  return (
    <div className={`lux-fade rounded-2xl border border-gold-400/10 bg-[#0f110f] text-center ${compact ? "p-5" : "p-8"}`}>
      <Loader2 className="mx-auto h-5 w-5 animate-spin text-gold-400" />
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

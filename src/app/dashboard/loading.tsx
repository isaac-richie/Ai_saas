import { CinematicSkeleton } from "@/interface/components/ui/CinematicSkeleton"

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 py-2 md:py-3">
      <CinematicSkeleton className="h-52" />
      <div className="grid gap-4 md:grid-cols-3">
        <CinematicSkeleton className="h-28" />
        <CinematicSkeleton className="h-28" />
        <CinematicSkeleton className="h-28" />
      </div>
      <CinematicSkeleton className="h-72" />
    </div>
  )
}


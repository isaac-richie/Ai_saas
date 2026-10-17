import { CinematicSkeleton } from "@/interface/components/ui/CinematicSkeleton"

// Shown inside the auth layout the moment a visitor clicks through, so the studio art and
// header appear instantly while the form loads.
export default function AuthLoading() {
  return (
    <div className="w-full space-y-4" aria-busy="true" aria-label="Loading">
      <CinematicSkeleton className="h-10 w-2/3" />
      <CinematicSkeleton className="h-12" />
      <CinematicSkeleton className="h-12" />
      <CinematicSkeleton className="h-12" />
    </div>
  )
}

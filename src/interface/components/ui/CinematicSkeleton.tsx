"use client"

export function CinematicSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1012] ${className}`}>
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.07),transparent)] animate-[skeletonSweep_1.6s_linear_infinite]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.2),rgba(255,255,255,0.2)_1px,transparent_1px,transparent_3px)]" />
      <div className="h-full w-full bg-gradient-to-b from-white/[0.04] to-transparent" />
    </div>
  )
}


"use client"

import { useEffect, useRef } from "react"

/**
 * A start card's still, brought to life: the clip plays once over its poster and
 * rests on the last frame; hovering the card replays it. Reduced-motion users keep the still.
 */
export function CardClip({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("motion-reduce-user")
    if (reduced) return
    void video.play().catch(() => null)
    const card = video.closest("a")
    const replay = () => {
      if (!video.paused) return
      video.currentTime = 0
      void video.play().catch(() => null)
    }
    card?.addEventListener("mouseenter", replay)
    return () => card?.removeEventListener("mouseenter", replay)
  }, [])

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      playsInline
      preload="metadata"
      aria-hidden
      className="absolute inset-0 -z-20 h-full w-full object-cover"
    />
  )
}

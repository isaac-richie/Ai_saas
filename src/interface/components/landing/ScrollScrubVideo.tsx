"use client"

import { useEffect, useRef, useState } from "react"
import { Film } from "lucide-react"
import { motion, useScroll, useTransform, useMotionValueEvent, useReducedMotion } from "framer-motion"

/**
 * Cinematic scroll-scrubbed hero video. A tall wrapper pins the video while the
 * page scrolls; scroll progress drives the video's currentTime frame-by-frame.
 * Falls back to an ordinary autoplay loop when the user prefers reduced motion.
 */
export function ScrollScrubVideo() {
  const prefersReducedMotion = useReducedMotion()
  if (prefersReducedMotion) return <ScrubFallback />
  return <ScrubInner />
}

function ScrubFallback() {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c]">
      <div className="relative aspect-[16/9] w-full overflow-hidden lg:aspect-[21/9]">
        <video src="/landing.mp4" className="h-full w-full object-cover" autoPlay muted loop playsInline preload="metadata" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-transparent opacity-60" />
      </div>
    </div>
  )
}

function ScrubInner() {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const targetTimeRef = useRef(0)

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  })

  // Frame HUD readout (00–100%) that ticks as you scroll.
  const [percent, setPercent] = useState(0)
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setPercent(Math.round(v * 100))
    // Read duration live off the element — the loadedmetadata event can be
    // missed when the file is already cached, leaving a ref stuck at 0.
    const duration = videoRef.current?.duration || 0
    if (!duration || Number.isNaN(duration)) return
    // Leave a hair of headroom so we never hit the exact end (which can stall).
    targetTimeRef.current = Math.min(duration * v, duration - 0.05)
    if (rafRef.current === null) {
      const step = () => {
        const video = videoRef.current
        if (video) {
          const diff = targetTimeRef.current - video.currentTime
          if (Math.abs(diff) > 0.01) {
            video.currentTime += diff * 0.25
            rafRef.current = requestAnimationFrame(step)
            return
          }
          video.currentTime = targetTimeRef.current
        }
        rafRef.current = null
      }
      rafRef.current = requestAnimationFrame(step)
    }
  })

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Subtle scale/tint tied to progress for depth.
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.06, 1, 1.06])
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.75, 0.2, 0.75])

  // Nudge off the (often black) first frame so there's a visible poster.
  const onLoadedData = () => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    if (video.currentTime < 0.1) video.currentTime = 0.1
  }

  return (
    <div ref={wrapperRef} className="relative h-[240vh]">
      <div className="sticky top-0 flex h-screen items-center">
        <motion.div className="group relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
          <div className="relative aspect-[16/9] w-full overflow-hidden lg:aspect-[21/9]">
            <motion.video
              ref={videoRef}
              src="/landing.mp4"
              style={{ scale }}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="auto"
              onLoadedData={onLoadedData}
            />
            {/* Film-grade overlays */}
            <motion.div
              style={{ opacity: overlayOpacity }}
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-transparent"
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_40%,rgba(20,241,230,0.12),transparent_50%),radial-gradient(circle_at_75%_55%,rgba(255,138,31,0.14),transparent_50%)]" />

            {/* Viewfinder HUD */}
            <div className="pointer-events-none absolute left-4 top-4 hidden items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/70 backdrop-blur-sm md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              REC · SCRUB
            </div>
            <div className="pointer-events-none absolute right-4 top-4 hidden rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200 backdrop-blur-sm md:inline-flex">
              {String(percent).padStart(2, "0")}%
            </div>

            {/* Scrub progress line */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-[width] duration-75"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-4 text-[11px] text-white/40">
              <span className="flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5 text-cyan-300/70" />
                Scroll to scrub the timeline
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/35 sm:justify-end">
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5">Kling 2.5</span>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5">Seedance</span>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5">Sora 2</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

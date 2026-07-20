"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion"
import { MODELS, ModelCardBody } from "./models"
import { ModelShowcase } from "./ModelShowcase"

function ModelsFallback() {
  return (
    <div>
      <p className="mb-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
        <span className="h-px w-6 bg-gradient-to-r from-cyan-400/50 to-transparent" />
        AI Models
      </p>
      <h2 className="mb-3 text-2xl font-medium tracking-tight sm:text-3xl">Pick your engine.</h2>
      <p className="mb-10 max-w-xl text-sm text-white/40">
        Three world-class video models, one studio. Switch per shot based on what the scene demands.
      </p>
      <ModelShowcase />
    </div>
  )
}

/** Pinned, full-bleed horizontal scroll. Only mounted on wide viewports with
 *  motion enabled, so its scroll target ref is always hydrated. */
function PinnedModels() {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [maxScroll, setMaxScroll] = useState(0)

  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current
      if (!track) return
      setMaxScroll(Math.max(0, track.scrollWidth - window.innerWidth))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  })
  const x = useTransform(scrollYProgress, [0.05, 0.95], [0, -maxScroll])

  return (
    <div ref={wrapperRef} className="relative left-1/2 right-1/2 -mx-[50vw] h-[300vh] w-screen">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <motion.div ref={trackRef} style={{ x }} className="flex items-stretch gap-6 pl-[6vw] pr-[10vw]">
          {/* Intro panel */}
          <div className="flex w-[42vw] shrink-0 flex-col justify-center pr-6">
            <p className="mb-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
              <span className="h-px w-6 bg-gradient-to-r from-cyan-400/50 to-transparent" />
              AI Models
            </p>
            <h2 className="text-4xl font-medium tracking-tight lg:text-5xl">Pick your engine.</h2>
            <p className="mt-4 max-w-md text-sm text-white/40">
              Three world-class video models, one studio. Keep scrolling to move through the lineup, then switch per shot based on what the scene demands.
            </p>
            <p className="mt-6 text-[11px] uppercase tracking-[0.16em] text-white/25">Scroll →</p>
          </div>

          {MODELS.map((model) => (
            <article
              key={model.id}
              className={`group relative flex w-[62vw] shrink-0 flex-col overflow-hidden rounded-3xl border bg-gradient-to-b ${model.accent} to-transparent p-8 lg:w-[38vw] ${model.border}`}
            >
              <ModelCardBody model={model} />
            </article>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

export function HorizontalModels() {
  const prefersReducedMotion = useReducedMotion()
  const [enabled, setEnabled] = useState(false)

  // Horizontal scroll-jacking is only pleasant on wide viewports with motion on.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const update = () => setEnabled(mq.matches && !prefersReducedMotion)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [prefersReducedMotion])

  return enabled ? <PinnedModels /> : <ModelsFallback />
}

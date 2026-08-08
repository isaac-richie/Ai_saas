"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { ReactNode } from "react"
import { cn } from "@/core/utils"

/**
 * The renderer is loaded through this boundary, never imported statically —
 * otherwise three + r3f (>500KB) end up in the main chunk for every visitor,
 * including everyone who never mounts a canvas.
 */
const CanvasShell = dynamic(() => import("./CanvasShell").then((m) => m.CanvasShell), {
  ssr: false,
})

/**
 * Shared harness for every WebGL scene on the landing page.
 *
 * The 3D is strictly an enhancement layer — it must never be load-bearing.
 * This component enforces that contract:
 *
 *  - Mounts the canvas only once it scrolls near the viewport (IntersectionObserver)
 *  - Never mounts on coarse-pointer / narrow screens — mobile gets `fallback`
 *  - Never mounts under `prefers-reduced-motion`
 *  - Never mounts if the browser can't give us a WebGL context
 *  - Caps DPR so retina Macs don't quietly render 4x the pixels
 *  - Suspends the render loop when the tab is hidden or the scene scrolls away
 *
 * `fallback` renders underneath at all times, so the section is complete and
 * good-looking before (or entirely without) WebGL.
 */

function useWebGLEligible() {
  // `null` = undecided (SSR / first paint). Only `true` may mount a canvas.
  const [eligible, setEligible] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    // Deferred on purpose: creating a WebGL context is not free, and doing it
    // inline would land squarely in the critical first paint. The fallback is
    // already on screen, so the delay costs nothing visually.
    // setTimeout rather than rAF — rAF is paused entirely on hidden documents,
    // which would strand a page opened in a background tab.
    const timer = setTimeout(() => {
      if (cancelled) return

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      const coarse = window.matchMedia("(pointer: coarse)").matches
      const narrow = window.matchMedia("(max-width: 1023px)").matches

      if (reduced || coarse || narrow) {
        setEligible(false)
        return
      }

      // Probe for a real context rather than trusting `!!window.WebGLRenderingContext`,
      // which is true even when the GPU process is blocklisted.
      let ok = false
      try {
        const probe = document.createElement("canvas")
        const gl = probe.getContext("webgl2") || probe.getContext("webgl")
        ok = Boolean(gl)
        // Release immediately — some drivers cap the number of live contexts.
        const lose = (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")
        lose?.loseContext()
      } catch {
        ok = false
      }

      setEligible(ok)
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return eligible
}

/** True once `ref` has come within `margin` of the viewport. Latches on. */
function useNearViewport(ref: React.RefObject<HTMLElement | null>, margin = 200) {
  const [near, setNear] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || near) return

    let observer: IntersectionObserver | null = null
    let cancelled = false

    // Deferred so the layout read happens after paint rather than inside it.
    const timer = setTimeout(() => {
      if (cancelled) return

      // Geometric check first. IntersectionObserver does not deliver callbacks
      // while the document is hidden, so a page opened in a background tab
      // would otherwise never latch — and would then pop in on first reveal.
      // Measuring directly means the scene is already warm on arrival.
      const rect = node.getBoundingClientRect()
      const inView =
        rect.bottom >= -margin &&
        rect.top <= (window.innerHeight || 0) + margin &&
        rect.right >= -margin &&
        rect.left <= (window.innerWidth || 0) + margin

      if (inView) {
        setNear(true)
        return
      }

      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setNear(true)
            observer?.disconnect()
          }
        },
        { rootMargin: `${margin}px` }
      )
      observer.observe(node)
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
      observer?.disconnect()
    }
  }, [ref, near, margin])

  return near
}

/** True while the element is actually on screen and the tab is visible. */
function useShouldRender(ref: React.RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(true)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "100px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  return onScreen && tabVisible
}

export function StageCanvas({
  children,
  fallback,
  className = "",
  dpr = [1, 1.5],
}: {
  children: ReactNode
  /** Always-rendered static layer. The section must look finished without WebGL. */
  fallback: ReactNode
  className?: string
  dpr?: [number, number]
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const eligible = useWebGLEligible()
  const near = useNearViewport(hostRef)
  const active = useShouldRender(hostRef)

  const showCanvas = eligible === true && near

  // `cn` (tailwind-merge) matters here: the inner layers are `absolute inset-0`,
  // so the host must be positioned — but a caller passing its own `absolute`
  // collides with a hardcoded `relative` at equal specificity, and the winner is
  // decided by stylesheet order. Losing that race drops the host into normal
  // flow and pushes the entire section down the page.
  return (
    <div ref={hostRef} className={cn("relative", className)}>
      {/* Static layer — always present, never removed. The canvas composites over it. */}
      {fallback}

      {showCanvas && (
        <div className="absolute inset-0" aria-hidden="true">
          <CanvasShell dpr={dpr} active={active}>
            {children}
          </CanvasShell>
        </div>
      )}
    </div>
  )
}

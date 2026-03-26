"use client"

import { useEffect, useRef } from "react"

export function HeroEntrance() {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let mounted = true
    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const mod = await import("gsap")
        if (!mounted || !rootRef.current) return
        const gsap = mod.gsap

        const ctx = gsap.context(() => {
          gsap.set("[data-hero-line]", { opacity: 0, y: 24, filter: "blur(8px)" })
          gsap.set("[data-hero-cta]", { opacity: 0, y: 20, scale: 0.96 })
          gsap.set("[data-hero-stat]", { opacity: 0, y: 22 })

          const tl = gsap.timeline({ defaults: { ease: "power3.out" } })
          tl.to("[data-hero-line='line1']", { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55 })
            .to("[data-hero-line='line2']", { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.46 }, "-=0.22")
            .to("[data-hero-line='line3']", { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.52 }, "-=0.2")
            .to("[data-hero-cta]", { opacity: 1, y: 0, scale: 1, stagger: 0.08, duration: 0.42 }, "-=0.18")
            .to("[data-hero-stat]", { opacity: 1, y: 0, stagger: 0.08, duration: 0.42 }, "-=0.2")
        }, rootRef)

        cleanup = () => ctx.revert()
      } catch {
        // Progressive enhancement only
      }
    })()

    return () => {
      mounted = false
      if (cleanup) cleanup()
    }
  }, [])

  return <div ref={rootRef} className="pointer-events-none absolute inset-0 z-0" />
}


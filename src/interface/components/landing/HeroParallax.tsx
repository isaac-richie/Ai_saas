"use client"

import { useRef, useEffect } from "react"
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion"
import { gsap } from "gsap"

/**
 * Wraps the hero content and drives a fade + settle + slight zoom-out as the
 * viewer scrolls past it, so the hero dissolves into the page instead of just
 * scrolling off. No-ops under reduced-motion.
 *
 * Also animates headline lines and stat pills in on load with staggered entrance.
 */
export function HeroParallax({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (prefersReducedMotion || !ref.current) return

    const ctx = gsap.context(() => {
      const lines = ref.current?.querySelectorAll("[data-hero-line]")
      const ctas = ref.current?.querySelectorAll("[data-hero-cta]")
      const stats = ref.current?.querySelectorAll("[data-hero-stat]")

      if (lines) {
        gsap.fromTo(
          lines,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.7, stagger: 0.15, ease: "cubic.out" }
        )
      }

      if (ctas) {
        gsap.fromTo(
          ctas,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, delay: 0.3, ease: "cubic.out" }
        )
      }

      if (stats) {
        gsap.fromTo(
          stats,
          { opacity: 0, scale: 0.92 },
          { opacity: 1, scale: 1, duration: 0.6, stagger: 0.08, delay: 0.5, ease: "back.out(1.5)" }
        )
      }
    })

    return () => ctx.revert()
  }, [prefersReducedMotion])

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  })
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.93])
  const y = useTransform(scrollYProgress, [0, 1], [0, 90])

  if (prefersReducedMotion) {
    return (
      <div ref={ref} className="relative">
        {children}
      </div>
    )
  }

  return (
    <motion.div ref={ref} style={{ opacity, scale, y }} className="relative will-change-transform">
      {children}
    </motion.div>
  )
}

"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion"

/**
 * Wraps the hero content and drives a fade + settle + slight zoom-out as the
 * viewer scrolls past it, so the hero dissolves into the page instead of just
 * scrolling off. No-ops under reduced-motion.
 */
export function HeroParallax({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

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

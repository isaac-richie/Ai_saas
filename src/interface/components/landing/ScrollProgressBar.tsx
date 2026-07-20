"use client"

import { motion, useScroll, useSpring } from "framer-motion"

/**
 * Fixed neon progress bar tracking overall page scroll. Sits above all content.
 */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  })

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-500 shadow-[0_0_12px_rgba(56,189,248,0.7)]"
    />
  )
}

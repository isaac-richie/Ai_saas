"use client"

import { useRef } from "react"
import { motion } from "framer-motion"

type MagneticButtonProps = {
  children: React.ReactNode
  className?: string
}

export function MagneticButton({ children, className = "" }: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const x = event.clientX - rect.left - rect.width / 2
    const y = event.clientY - rect.top - rect.height / 2
    node.style.setProperty("--mag-x", `${x * 0.12}px`)
    node.style.setProperty("--mag-y", `${y * 0.14}px`)
  }

  const onLeave = () => {
    const node = ref.current
    if (!node) return
    node.style.setProperty("--mag-x", "0px")
    node.style.setProperty("--mag-y", "0px")
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: "var(--mag-x)", y: "var(--mag-y)" }}
      transition={{ type: "spring", stiffness: 240, damping: 18, mass: 0.5 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}


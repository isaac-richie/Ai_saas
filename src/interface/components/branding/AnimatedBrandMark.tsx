"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { cn } from "@/core/utils"

export function AnimatedBrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <motion.span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-xl border border-cyan-300/15 bg-black shadow-[0_0_28px_-12px_rgba(34,211,238,0.9)] ring-1 ring-white/10",
        className
      )}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      role="img"
      aria-label="Visiowave"
    >
      <Image
        src="/visiowave-icon.jpeg"
        alt=""
        fill
        sizes="48px"
        priority
        className="scale-[1.5] object-cover"
      />
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2),transparent_34%)]" />
    </motion.span>
  )
}

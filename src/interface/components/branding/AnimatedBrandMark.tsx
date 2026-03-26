"use client"

import { motion } from "framer-motion"

export function AnimatedBrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 120 120"
      className={className}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brandStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14F1E6" />
          <stop offset="55%" stopColor="#2FA6FF" />
          <stop offset="100%" stopColor="#FF8A1F" />
        </linearGradient>
      </defs>
      <motion.path
        d="M12 60 Q42 20 60 20 Q78 20 108 60 Q78 100 60 100 Q42 100 12 60 Z"
        fill="none"
        stroke="url(#brandStroke)"
        strokeWidth="5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
      <motion.path
        d="M26 60 H38 L46 45 L54 76 L62 34 L70 84 L78 44 L86 64 L94 60"
        fill="none"
        stroke="url(#brandStroke)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, delay: 0.25, ease: "easeOut" }}
      />
    </motion.svg>
  )
}


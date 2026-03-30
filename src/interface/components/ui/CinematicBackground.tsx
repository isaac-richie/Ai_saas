"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useEffect, useState } from "react"

export function CinematicBackground() {
  const [mounted, setMounted] = useState(false)
  const { scrollY } = useScroll()
  const y1 = useTransform(scrollY, [0, 500], [0, 100])
  const y2 = useTransform(scrollY, [0, 500], [0, -100])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 -z-50 overflow-hidden bg-[#05070A] pointer-events-none">
      {/* 1. Base Layer: Cinematic Environment (Blurred & Dimmed) */}
      <motion.div 
        style={{ y: y1 }}
        className="absolute inset-0 opacity-20 transition-opacity duration-1000 scale-110 blur-[80px]"
      >
        <img 
          src="/auth/city.png"
          alt="Cinematic Background Base"
          className="h-full w-full object-cover"
        />
      </motion.div>

      {/* 2. Gradient Overlay: Left-to-right dark gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 z-10" />

      {/* 3a. Atmospheric Effect: Film Grain */}
      <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay z-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* 3b. Atmospheric Effect: Volumetric Glow Streaks & Light Leaks */}
      <div className="absolute inset-0 opacity-40 z-20 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{
            x: ["-10%", "10%", "-10%"],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[-20%] h-[140%] w-[140%] opacity-50 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.1),transparent_70%)] blur-[100px]"
        />
        <motion.div 
          animate={{
             rotate: [0, 360],
          }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          className="absolute top-[10%] right-[-30%] h-[100%] w-[150%] opacity-30 bg-[conic-gradient(from_0deg,transparent,rgba(34,211,238,0.05),transparent)] blur-[80px]"
        />
      </div>

      {/* 3c. Floating Tactical Particles */}
      <div className="absolute inset-0 z-30 opacity-40">
        {[...Array(24)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-cyan-400"
            style={{
              left: `${Math.random() * 120 - 10}%`,
              top: `${Math.random() * 120 - 10}%`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
              boxShadow: '0 0 12px 1px rgba(34,211,238,0.8)'
            }}
            animate={{
              y: [0, -150, 0],
              x: [0, Math.random() * 100 - 50, 0],
              opacity: [0, 0.8, 0],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 8 + Math.random() * 12,
              repeat: Infinity,
              delay: Math.random() * 10,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>

      {/* 4. Motion: Subtle Mesh Overlay */}
      <motion.div 
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 opacity-20 z-0 bg-[radial-gradient(circle_at_70%_20%,rgba(53,166,255,0.1),transparent_50%),radial-gradient(circle_at_30%_80%,rgba(99,102,241,0.08),transparent_50%)]"
      />
    </div>
  )
}

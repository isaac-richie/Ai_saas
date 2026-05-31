"use client"

import { motion } from "framer-motion"
import { Film, Sparkles, Camera, Zap } from "lucide-react"

const fadeUpInitial = { opacity: 0, y: 28 }
const fadeUpAnimate = { opacity: 1, y: 0 }
const fadeUpTransition = { duration: 0.55, ease: "easeOut" as const }

export function ProductDemo() {
  return (
    <div className="space-y-6">
      {/* Hero Video — Full-width cinematic */}
      <motion.div
        initial={fadeUpInitial}
        whileInView={fadeUpAnimate}
        transition={fadeUpTransition}
        viewport={{ once: true, amount: 0.2 }}
        className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0c]"
      >
        <div className="relative aspect-[21/9] w-full overflow-hidden">
          <video
            src="/landing.mp4"
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          {/* Film-grade overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-transparent opacity-60" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_40%,rgba(20,241,230,0.12),transparent_50%),radial-gradient(circle_at_75%_55%,rgba(255,138,31,0.14),transparent_50%)]" />

          {/* Viewfinder HUD */}
          <div className="pointer-events-none absolute left-4 top-4 hidden items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/70 backdrop-blur-sm md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            REC
          </div>
          <div className="pointer-events-none absolute right-4 top-4 hidden rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200 backdrop-blur-sm md:inline-flex">
            Visiowave Studio
          </div>

          {/* Center crosshair */}
          <div className="pointer-events-none absolute inset-0 m-auto hidden h-10 w-10 rounded-full border border-white/15 md:block">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
            <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-white/15" />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-4 text-[11px] text-white/40">
            <span className="flex items-center gap-1.5">
              <Film className="h-3.5 w-3.5 text-cyan-300/70" />
              AI-Generated
            </span>
            <span className="hidden sm:inline">21:9 Cinematic</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/35">
            <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5">Kling 2.5</span>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5">Seedance</span>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5">Sora 2</span>
          </div>
        </div>
      </motion.div>

      {/* Two capability cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Fast Track */}
        <motion.article
          initial={fadeUpInitial}
          whileInView={fadeUpAnimate}
          transition={fadeUpTransition}
          viewport={{ once: true, amount: 0.2 }}
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-cyan-400/20"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/[0.06] blur-3xl" />

          <div className="relative z-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-300">
              <Zap className="h-3 w-3" />
              Fast Track
            </div>

            <h3 className="mb-2 text-lg font-semibold text-white/90">
              Text or image to video in seconds
            </h3>
            <p className="mb-5 text-[13px] leading-relaxed text-white/45">
              Type a prompt or upload a reference frame. Pick your model, set aspect ratio and style, hit generate. No project setup required.
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-3 text-[12px] text-white/55">
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[10px] text-cyan-300">1</span>
                Choose model + write prompt
              </div>
              <div className="flex items-center gap-3 text-[12px] text-white/55">
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[10px] text-cyan-300">2</span>
                Set aspect ratio, motion, style
              </div>
              <div className="flex items-center gap-3 text-[12px] text-white/55">
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[10px] text-cyan-300">3</span>
                Generate + save to gallery
              </div>
            </div>
          </div>
        </motion.article>

        {/* Shot Builder + Studio AD */}
        <motion.article
          initial={fadeUpInitial}
          whileInView={fadeUpAnimate}
          transition={fadeUpTransition}
          viewport={{ once: true, amount: 0.2 }}
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-orange-400/20"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-orange-400/[0.06] blur-3xl" />

          <div className="relative z-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-orange-300">
              <Sparkles className="h-3 w-3" />
              Studio Mode
            </div>

            <h3 className="mb-2 text-lg font-semibold text-white/90">
              Full cinematic control
            </h3>
            <p className="mb-5 text-[13px] leading-relaxed text-white/45">
              Build shots with real film vocabulary. The AI Director scores your prompt for production readiness and refines it automatically.
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-3 text-[12px] text-white/55">
                <Camera className="h-4 w-4 text-orange-300/70" />
                ARRI Alexa, RED, Zeiss, Cooke lenses
              </div>
              <div className="flex items-center gap-3 text-[12px] text-white/55">
                <Sparkles className="h-4 w-4 text-orange-300/70" />
                AI Director prompt refinement
              </div>
              <div className="flex items-center gap-3 text-[12px] text-white/55">
                <Film className="h-4 w-4 text-orange-300/70" />
                Scene-level continuity tracking
              </div>
            </div>
          </div>
        </motion.article>
      </div>
    </div>
  )
}

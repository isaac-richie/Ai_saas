"use client"

import { motion } from "framer-motion"
import {
  Film,
  Camera,
  WandSparkles,
  Layers,
  KeyRound,
  PlayCircle,
} from "lucide-react"

const features = [
  {
    icon: Film,
    title: "Multi-Model Video Studio",
    description:
      "Generate cinematic video with Kling 2.5, Seedance, or Sora 2. Switch models per shot — each engine brings a different look.",
    accent: "cyan",
  },
  {
    icon: Camera,
    title: "Cinematic Shot Builder",
    description:
      "ARRI cameras, Zeiss lenses, shot types, angles, movement, lighting moods — real film vocabulary baked into every prompt.",
    accent: "cyan",
  },
  {
    icon: WandSparkles,
    title: "AI Director (Studio AD)",
    description:
      "An AI assistant director generates production-ready prompt packets with quality scoring and iterative refinement.",
    accent: "orange",
  },
  {
    icon: Layers,
    title: "Project Organization",
    description:
      "Projects, scenes, shots — group your work the way real productions do. Keep continuity across your entire visual narrative.",
    accent: "cyan",
  },
  {
    icon: KeyRound,
    title: "Bring Your Own Keys",
    description:
      "Connect your own OpenAI or Kie.ai API keys. Pay your provider directly — no double GPU charges, no credit packs.",
    accent: "orange",
  },
  {
    icon: PlayCircle,
    title: "Gallery + Sequences",
    description:
      "Browse every generation across projects. Stitch shots into sequences, export finished video, track your creative history.",
    accent: "cyan",
  },
]

export function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {features.map((feature, index) => {
        const Icon = feature.icon
        const accentColor =
          feature.accent === "orange" ? "text-orange-300" : "text-cyan-300"
        const glowColor =
          feature.accent === "orange"
            ? "group-hover:border-orange-400/25 group-hover:shadow-[0_0_30px_-12px_rgba(255,138,31,0.15)]"
            : "group-hover:border-cyan-400/25 group-hover:shadow-[0_0_30px_-12px_rgba(34,211,238,0.15)]"

        return (
          <motion.article
            key={feature.title}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.08 }}
            className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:-translate-y-0.5 ${glowColor}`}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[0.02] blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-0" />

            <div className={`mb-4 inline-flex rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 ${accentColor}`}>
              <Icon className="h-5 w-5" />
            </div>

            <h3 className="mb-2 text-[15px] font-semibold text-white/90">
              {feature.title}
            </h3>
            <p className="text-[13px] leading-relaxed text-white/45">
              {feature.description}
            </p>
          </motion.article>
        )
      })}
    </div>
  )
}

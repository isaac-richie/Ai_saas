"use client"

import { Check, Clapperboard, Clock, Film, Images, Volume2 } from "lucide-react"
import type * as React from "react"
import type { PromptTemplate } from "@/core/config/fast-video-templates"
import { MOTION_PRESETS, STYLE_PRESETS } from "@/core/config/fast-video-presets"
import type { KieVideoModelFamily, KieVideoModelFamilyId } from "@/core/config/kie-video-models"
import { frameCapability } from "@/core/validation/shot-frames"
import { StyleSwatch } from "./preset-visuals"

/** Template cards: each fills the prompt and suggests a matching look. */
export function TemplateGallery({ templates, activeId, onApply }: {
  templates: PromptTemplate[]
  activeId: string | null
  onApply: (template: PromptTemplate) => void
}) {
  return (
    <section aria-label="Prompt templates" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#8f9086]">Start from a template</p>
        <p className="text-[10px] text-[#77796f]">Fills the prompt and look · all editable</p>
      </div>
      <div className="preset-rail -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
        {templates.map((template) => {
          const active = template.id === activeId
          const style = STYLE_PRESETS.find((preset) => preset.id === template.stylePresetId)
          const motion = MOTION_PRESETS.find((preset) => preset.id === template.motionPresetId)
          return (
            <button
              key={template.id}
              type="button"
              data-active={active}
              aria-pressed={active}
              title={template.prompt}
              onClick={() => onApply(template)}
              className={`preset-card group relative w-[176px] shrink-0 snap-start overflow-hidden rounded-xl border text-left transition-all duration-300 ${
                active
                  ? "border-gold-300/70 bg-gold-400/[0.07] shadow-[0_16px_32px_-20px_rgba(217,192,138,0.8)]"
                  : "border-gold-400/[0.12] bg-white/[0.02] hover:-translate-y-0.5 hover:border-gold-400/40"
              }`}
            >
              <span className="relative block h-[84px] overflow-hidden bg-obsidian-900">
                {style ? <StyleSwatch id={style.id} name={style.name} /> : <span className="grid h-full place-items-center"><Clapperboard className="h-5 w-5 text-gold-400/40" /></span>}
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-gold-100 backdrop-blur">{template.category}</span>
                {active ? (
                  <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-gold-300 text-[#1a160e]"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>
                ) : null}
                <span className="absolute bottom-1.5 left-2 right-2 truncate text-[12px] font-medium text-white">{template.label}</span>
              </span>
              <span className="block px-2.5 pb-2.5 pt-2">
                <span className="line-clamp-2 block text-[10px] leading-snug text-[#a3a59a]">{template.prompt}</span>
                <span className="mt-1.5 block truncate text-[9.5px] uppercase tracking-[0.12em] text-gold-300/60">{style?.name ?? "Any style"} · {motion?.name ?? "Any motion"}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

const MODEL_FACTS: Record<KieVideoModelFamilyId, { icon: React.ReactNode; text: string }[]> = {
  kling: [
    { icon: <Clock className="h-3 w-3" />, text: "Text-only shots: 5 or 10 s" },
    { icon: <Images className="h-3 w-3" />, text: "Multi-image references" },
  ],
  seedance: [
    { icon: <Clock className="h-3 w-3" />, text: "4 to 15 s" },
    { icon: <Volume2 className="h-3 w-3" />, text: "Generates audio" },
  ],
}

/** Model cards that state what each model accepts before you generate. */
export function ModelPicker({ families, value, onChange }: {
  families: KieVideoModelFamily[]
  value: KieVideoModelFamilyId
  onChange: (id: KieVideoModelFamilyId) => void
}) {
  return (
    <div role="radiogroup" aria-label="Video model" className="grid gap-2 sm:grid-cols-2">
      {families.map((family) => {
        const active = family.id === value
        const frames = frameCapability(family.id)
        return (
          <button
            key={family.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(family.id)}
            className={`lux-spotlight relative rounded-xl border px-3.5 py-3 text-left transition-all duration-300 ${
              active
                ? "border-gold-300/70 bg-[linear-gradient(180deg,rgba(217,192,138,0.12),rgba(217,192,138,0.03))] shadow-[0_14px_30px_-20px_rgba(217,192,138,0.8)]"
                : "border-gold-400/[0.12] bg-white/[0.02] hover:-translate-y-0.5 hover:border-gold-400/40"
            }`}
          >
            <span className="flex items-center justify-between">
              <span className={`text-[14px] font-medium ${active ? "text-gold-50" : "text-[#eeeae1]"}`}>{family.label}</span>
              <span className={`grid size-4 place-items-center rounded-full border ${active ? "border-gold-300 bg-gold-300 text-[#1a160e]" : "border-gold-400/30"}`}>
                {active ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
              </span>
            </span>
            <span className="mt-1 block text-[11px] leading-snug text-[#a3a59a]">{family.description}</span>
            <span className="mt-2.5 flex flex-wrap gap-1.5">
              {[...MODEL_FACTS[family.id], { icon: <Film className="h-3 w-3" />, text: frames.start ? "Start + End frames" : "No frame control" }].map((fact) => (
                <span key={fact.text} className="inline-flex items-center gap-1 rounded-full border border-gold-400/15 bg-black/20 px-2 py-0.5 text-[10px] text-[#c8c3b3]">
                  <span className="text-gold-400/80">{fact.icon}</span>{fact.text}
                </span>
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

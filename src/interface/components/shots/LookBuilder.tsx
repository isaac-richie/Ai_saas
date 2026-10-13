"use client"

import { useState } from "react"
import { Aperture, Camera, Check, Palette, Sparkles, X } from "lucide-react"
import type { PromptCategory } from "@/core/utils/prompts/builder"
import { AspectGlyph } from "@/interface/components/fast-video/PresetPicker"

export type LookOption = { id: string; key: string; label: string; descriptor: string }

const GROUPS: { id: string; label: string; icon: React.ReactNode; categories: PromptCategory[] }[] = [
  { id: "framing", label: "Framing", icon: <Aperture className="h-3.5 w-3.5" />, categories: ["shot", "angle", "aspectRatio"] },
  { id: "camera", label: "Camera", icon: <Camera className="h-3.5 w-3.5" />, categories: ["camera", "lens", "movement", "depthOfField"] },
  { id: "light", label: "Light & colour", icon: <Palette className="h-3.5 w-3.5" />, categories: ["lighting", "timeOfDay", "colorGrade"] },
  { id: "mood", label: "Mood", icon: <Sparkles className="h-3.5 w-3.5" />, categories: ["genreMood"] },
]

/** Reads "2.39:1 Anamorphic" or "16:9" style labels into a ratio the glyph can draw. */
function ratioFromLabel(label: string) {
  const match = label.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/)
  return match ? `${match[1]}:${match[2]}` : null
}

/**
 * Scene Builder's cinematography presets as grouped, tappable chips instead of
 * eleven dropdowns. Every category stays optional ("Any" clears it).
 */
export function LookBuilder({ options, values, labels, onChange }: {
  options: Partial<Record<PromptCategory, LookOption[]>>
  values: Partial<Record<PromptCategory, string | undefined>>
  labels: Record<PromptCategory, string>
  onChange: (category: PromptCategory, key: string | undefined) => void
}) {
  const [group, setGroup] = useState(GROUPS[0].id)
  const active = GROUPS.find((item) => item.id === group) ?? GROUPS[0]
  const chosen = GROUPS.flatMap((item) => item.categories).flatMap((category) => {
    const option = options[category]?.find((item) => item.key === values[category])
    return option ? [{ category, option }] : []
  })
  const countIn = (categories: PromptCategory[]) => categories.filter((category) => values[category]).length

  return (
    <section aria-label="Shot look" className="space-y-3">
      <div className="flex min-h-8 flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#8f9086]">Your look</span>
        {chosen.length === 0 ? <span className="lux-serif text-[13px] text-gold-300/80">Open: the prompt decides</span> : null}
        {chosen.map(({ category, option }) => (
          <button key={category} type="button" onClick={() => onChange(category, undefined)} title={`Remove ${labels[category].toLowerCase()}`}
            className="group inline-flex items-center gap-1 rounded-full border border-gold-300/40 bg-gold-400/10 py-0.5 pl-2.5 pr-1.5 text-[11px] text-gold-50 transition hover:border-gold-300/70">
            {option.label}<X className="h-3 w-3 text-gold-300/70 transition group-hover:text-gold-50" />
          </button>
        ))}
      </div>

      <div role="tablist" aria-label="Look categories" className="flex gap-1 rounded-xl border border-gold-400/[0.12] bg-black/20 p-1">
        {GROUPS.map((item) => {
          const selected = item.id === active.id
          const count = countIn(item.categories)
          return (
            <button key={item.id} type="button" role="tab" aria-selected={selected} onClick={() => setGroup(item.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11.5px] transition-all duration-300 ${selected ? "bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] font-semibold text-[#1a160e] shadow-[0_6px_16px_-10px_rgba(217,192,138,0.9)]" : "text-[#a3a59a] hover:text-gold-100"}`}>
              {item.icon}<span className="hidden sm:inline">{item.label}</span>
              {count ? <span className={`grid size-4 place-items-center rounded-full text-[9.5px] tabular-nums ${selected ? "bg-[#1a160e] text-gold-100" : "bg-gold-400/20 text-gold-100"}`}>{count}</span> : null}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" aria-label={active.label} className="lux-fade space-y-4" key={active.id}>
        {active.categories.map((category) => {
          const list = options[category] ?? []
          const current = values[category]
          return (
            <div key={category} className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">{labels[category]}</p>
              <div role="radiogroup" aria-label={labels[category]} className="flex flex-wrap gap-1.5">
                <LookChip label="Any" selected={!current} onSelect={() => onChange(category, undefined)} muted />
                {list.map((option) => (
                  <LookChip
                    key={option.id}
                    label={option.label}
                    description={option.descriptor}
                    selected={current === option.key}
                    onSelect={() => onChange(category, current === option.key ? undefined : option.key)}
                    icon={category === "aspectRatio" && ratioFromLabel(option.label) ? <AspectGlyph ratio={ratioFromLabel(option.label)!} active={current === option.key} /> : null}
                  />
                ))}
                {list.length === 0 ? <span className="text-[11px] text-[#77796f]">No options available.</span> : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function LookChip({ label, description, selected, onSelect, icon, muted }: {
  label: string
  description?: string
  selected: boolean
  onSelect: () => void
  icon?: React.ReactNode
  muted?: boolean
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} title={description} onClick={onSelect}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-all duration-300 ${
        selected
          ? "border-gold-300/70 bg-gold-400/15 text-gold-50 shadow-[0_0_18px_-8px_rgba(217,192,138,0.8)]"
          : muted
            ? "border-dashed border-gold-400/20 text-[#8f9086] hover:border-gold-400/45 hover:text-gold-100"
            : "border-gold-400/[0.14] bg-white/[0.02] text-[#d4cfc0] hover:-translate-y-px hover:border-gold-400/45 hover:text-gold-50"
      }`}>
      {selected && !muted ? <Check className="h-3 w-3 text-gold-300" strokeWidth={3} /> : icon}
      {label}
    </button>
  )
}

"use client"

import type * as React from "react"
import { Check } from "lucide-react"
import { KIE_VIDEO_MODEL_FAMILIES, type KieVideoModelFamilyId } from "@/core/config/kie-video-models"
import { MOTION_PRESETS, STYLE_PRESETS, type MotionPreset, type StylePreset } from "@/core/config/fast-video-presets"
import { PresetPicker } from "./PresetPicker"
import { MotionGlyph, PRESET_PREVIEW_VIDEOS, StyleSwatch } from "./preset-visuals"
import { ModelPicker } from "./StudioPickers"
import { QUICK_LOOKS } from "./fast-video-studio.model"

/** Everything one preset family's picker needs; owned by FastVideoStudio. */
export type PresetFamilyState<T> = {
  selectedId: string
  onSelect: (id: string) => void
  options: T[]
  totalCount: number
  search: string
  onSearch: (value: string) => void
  pinnedIds: string[]
  recentIds: string[]
  onTogglePin: (id: string) => void
  expanded: boolean
  onToggleExpanded: () => void
}

/** Shot Look: quick looks, style and motion presets, and the video model. */
export function ShotLookSection({ className, style, motion, modelFamilyId, onModelChange }: {
  className: string
  style: PresetFamilyState<StylePreset>
  motion: PresetFamilyState<MotionPreset>
  modelFamilyId: KieVideoModelFamilyId
  onModelChange: (id: KieVideoModelFamilyId) => void
}) {
  const stylePresetId = style.selectedId
  const motionPresetId = motion.selectedId
  const applyStylePreset = style.onSelect
  const applyMotionPreset = motion.onSelect
  return (
    <div className={className}>
      <label className="text-[11px] uppercase tracking-[0.12em] text-white/50 font-medium">Shot Look</label>
      <div role="radiogroup" aria-label="Shot look" className="lux-stagger grid grid-cols-2 gap-2">
        {QUICK_LOOKS.map((look, index) => {
          const active = stylePresetId === look.stylePresetId && motionPresetId === look.motionPresetId
          const style = STYLE_PRESETS.find((preset) => preset.id === look.stylePresetId)
          const motion = MOTION_PRESETS.find((preset) => preset.id === look.motionPresetId)
          return (
            <button
              key={look.id}
              type="button"
              role="radio"
              aria-checked={active}
              style={{ "--i": index } as React.CSSProperties}
              title={active ? "Click again to clear this look" : undefined}
              onClick={() => {
                // Looks are a shortcut, never a requirement: clicking the active look clears it.
                applyStylePreset(active ? "" : look.stylePresetId)
                applyMotionPreset(active ? "" : look.motionPresetId)
              }}
              data-active={active}
              className={`preset-card lux-sheen overflow-hidden rounded-xl border text-left transition-all duration-300 ${
                active
                  ? "border-[1.5px] border-[#E5A93C] bg-gold-400/[0.07] shadow-[0_12px_28px_-18px_rgba(229,169,60,0.8)]"
                  : "border-gold-400/[0.12] bg-white/[0.02] hover:-translate-y-0.5 hover:border-gold-400/35"
              }`}
            >
              <span className="grid h-10 grid-cols-2">
                <span className="overflow-hidden">{style ? <StyleSwatch id={style.id} /> : null}</span>
                <span className="overflow-hidden border-l border-black/40">{motion ? <MotionGlyph id={motion.id} /> : null}</span>
              </span>
              <span className="block px-3 pb-2.5 pt-2">
                <span className={`flex items-center gap-1.5 text-[12.5px] font-semibold leading-[1.25] ${active ? "text-gold-50" : "text-[#e8e2d2]"}`}>
                  {active ? <Check className="h-3 w-3 text-[#E5A93C]" strokeWidth={3} /> : null}{look.label}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[#B0B8C4]">{style?.name ?? "Any style"} · {motion?.name ?? "Any motion"}</span>
              </span>
            </button>
          )
        })}
      </div>
      <PresetPicker
        label="Style presets"
        noneLabel="No style"
        noneDescription="Your prompt alone sets the look."
        options={style.options.map((preset) => ({ id: preset.id, name: preset.name, description: preset.description, visual: <StyleSwatch id={preset.id} name={preset.name} />, previewVideo: PRESET_PREVIEW_VIDEOS[preset.id] }))}
        selectedId={style.selectedId}
        onSelect={style.onSelect}
        search={style.search}
        onSearch={style.onSearch}
        pinnedIds={style.pinnedIds}
        recentIds={style.recentIds}
        onTogglePin={style.onTogglePin}
        expanded={style.expanded}
        onToggleExpanded={style.onToggleExpanded}
        totalCount={style.totalCount}
      />
      <PresetPicker
        label="Motion presets"
        noneLabel="No motion"
        noneDescription="Camera movement comes from your prompt."
        options={motion.options.map((preset) => ({ id: preset.id, name: preset.name, description: preset.description, detail: preset.useCase, visual: <MotionGlyph id={preset.id} />, previewVideo: PRESET_PREVIEW_VIDEOS[preset.id] }))}
        selectedId={motion.selectedId}
        onSelect={motion.onSelect}
        search={motion.search}
        onSearch={motion.onSearch}
        pinnedIds={motion.pinnedIds}
        recentIds={motion.recentIds}
        onTogglePin={motion.onTogglePin}
        expanded={motion.expanded}
        onToggleExpanded={motion.onToggleExpanded}
        totalCount={motion.totalCount}
      />
      <ModelPicker families={KIE_VIDEO_MODEL_FAMILIES} value={modelFamilyId} onChange={onModelChange} />
    </div>
  )
}

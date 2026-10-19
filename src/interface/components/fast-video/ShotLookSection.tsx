"use client"

import type * as React from "react"
import { Check, ChevronDown, Move3d } from "lucide-react"
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

/**
 * Shot Look: the style rail up front; camera movement and quick looks (style + camera together)
 * fold into one row that shows the current pick, so the default view stays short.
 */
export function ShotLookSection({ className, style, motion, modelFamilyId, onModelChange, showModel = true }: {
  className: string
  style: PresetFamilyState<StylePreset>
  motion: PresetFamilyState<MotionPreset>
  modelFamilyId: KieVideoModelFamilyId
  onModelChange: (id: KieVideoModelFamilyId) => void
  /** Create keeps the model under "More options"; the default pick suits most ideas. */
  showModel?: boolean
}) {
  const stylePresetId = style.selectedId
  const motionPresetId = motion.selectedId
  const applyStylePreset = style.onSelect
  const applyMotionPreset = motion.onSelect
  return (
    <div className={className}>
      <PresetPicker
        label="Style"
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
      <details className="group/camera -mx-2 rounded-xl transition-colors open:bg-white/[0.02]">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-gold-300"><Move3d className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-[#ece6d6]">Camera movement</span>
            <span className={`block truncate text-[12.5px] ${motionPresetId ? "text-gold-200" : "text-[#9aa1ab]"}`}>{MOTION_PRESETS.find((preset) => preset.id === motionPresetId)?.name ?? "Comes from your idea"}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-[#9aa1ab] transition-transform duration-300 group-open/camera:rotate-180" />
        </summary>
        <div className="space-y-4 px-2 pb-3 pt-1">
          <PresetPicker
            label="Camera movement"
            hideLabel
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
          <p className="text-[12.5px] text-[#9aa1ab]">Or pick a quick look: style and camera together.</p>
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
                      : "border-line bg-white/[0.02] hover:-translate-y-0.5 hover:border-gold-400/35"
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
        </div>
      </details>
      {showModel ? <ModelPicker families={KIE_VIDEO_MODEL_FAMILIES} value={modelFamilyId} onChange={onModelChange} /> : null}
    </div>
  )
}

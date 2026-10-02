"use client"

import { Check, Search, Star, X } from "lucide-react"
import type * as React from "react"

export type PresetOption = {
  id: string
  name: string
  description?: string
  detail?: string
}

type PresetPickerProps = {
  label: string
  noneLabel: string
  noneDescription: string
  options: PresetOption[]
  selectedId: string
  onSelect: (id: string) => void
  search: string
  onSearch: (value: string) => void
  pinnedIds: string[]
  recentIds: string[]
  onTogglePin: (id: string) => void
  expanded: boolean
  onToggleExpanded: () => void
  totalCount: number
}

/**
 * Card-based preset chooser shared by every Fast Track preset family.
 * "None" is always the first card so presets are never mandatory.
 */
export function PresetPicker({
  label, noneLabel, noneDescription, options, selectedId, onSelect, search, onSearch,
  pinnedIds, recentIds, onTogglePin, expanded, onToggleExpanded, totalCount,
}: PresetPickerProps) {
  const selected = options.find((option) => option.id === selectedId)
  const hiddenCount = Math.max(0, totalCount - options.length)
  return (
    <section className="space-y-3 rounded-2xl border border-gold-400/[0.12] bg-white/[0.02] p-3" aria-label={label}>
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">{label}</p>
          <p className="truncate text-[13px] text-[#f3eee2]">
            {selected ? selected.name : <span className="lux-serif text-gold-300">{noneLabel}</span>}
          </p>
        </div>
        {(hiddenCount > 0 || expanded) && (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="shrink-0 rounded-full border border-gold-400/20 px-2.5 py-1 text-[10px] text-gold-200/90 transition hover:border-gold-400/45 hover:bg-gold-400/[0.08]"
          >
            {expanded ? "Show less" : `All ${totalCount}`}
          </button>
        )}
      </header>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gold-400/60" aria-hidden />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label.toLowerCase()}`}
          className="h-9 w-full rounded-xl border pl-8 pr-8 text-[12px]"
        />
        {search && (
          <button type="button" aria-label="Clear search" onClick={() => onSearch("")} className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-[#8f9086] hover:text-gold-100">
            <X className="h-3 w-3" />
          </button>
        )}
      </label>

      <div role="radiogroup" aria-label={label} className="lux-stagger grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PresetCard
          index={0}
          name={noneLabel}
          description={noneDescription}
          active={!selectedId}
          onSelect={() => onSelect("")}
        />
        {options.map((option, index) => (
          <PresetCard
            key={option.id}
            index={index + 1}
            name={option.name}
            description={option.description}
            detail={option.detail}
            active={selectedId === option.id}
            onSelect={() => onSelect(option.id)}
            pinned={pinnedIds.includes(option.id)}
            recent={recentIds.includes(option.id)}
            onTogglePin={() => onTogglePin(option.id)}
          />
        ))}
      </div>
      {options.length === 0 && (
        <p className="rounded-xl border border-dashed border-gold-400/15 px-3 py-4 text-center text-[11px] text-[#8f9086]">
          No {label.toLowerCase()} match “{search}”.
        </p>
      )}
    </section>
  )
}

function PresetCard({ index, name, description, detail, active, onSelect, pinned, recent, onTogglePin }: {
  index: number
  name: string
  description?: string
  detail?: string
  active: boolean
  onSelect: () => void
  pinned?: boolean
  recent?: boolean
  onTogglePin?: () => void
}) {
  return (
    <div
      style={{ "--i": Math.min(index, 10) } as React.CSSProperties}
      className={`lux-spotlight group relative rounded-xl border transition-all duration-300 ${
        active
          ? "border-gold-300/60 bg-[linear-gradient(180deg,rgba(217,192,138,0.14),rgba(217,192,138,0.04))] shadow-[0_0_0_1px_rgba(217,192,138,0.15),0_14px_30px_-20px_rgba(217,192,138,0.7)]"
          : "border-gold-400/[0.12] bg-white/[0.02] hover:-translate-y-0.5 hover:border-gold-400/35"
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onSelect}
        className="relative block w-full rounded-xl px-3 py-2.5 pr-9 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
      >
        <span className="flex items-center gap-1.5">
          <span className={`text-[12px] font-medium ${active ? "text-gold-50" : "text-[#e8e2d2]"}`}>{name}</span>
          {recent && !active ? <span className="size-1 rounded-full bg-gold-400/70" title="Recently used" aria-label="Recently used" /> : null}
        </span>
        {description ? <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-snug text-[#8f9086]">{description}</span> : null}
        {detail ? <span className="mt-1 block text-[9.5px] uppercase tracking-[0.14em] text-gold-300/60">{detail}</span> : null}
      </button>
      {active ? (
        <span className="pointer-events-none absolute right-2.5 top-2.5 grid size-4 place-items-center rounded-full bg-gold-300 text-[#1a160e]">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      ) : onTogglePin ? (
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
          title={pinned ? "Unpin" : "Pin to top"}
          className={`absolute right-2 top-2 grid size-6 place-items-center rounded-full transition ${
            pinned ? "text-gold-300" : "text-[#77796f] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-gold-200"
          }`}
        >
          <Star className="h-3.5 w-3.5" fill={pinned ? "currentColor" : "none"} />
        </button>
      ) : null}
    </div>
  )
}

/** Compact segmented choice used for aspect ratio and intensity presets. */
export function SegmentedPreset<T extends string>({ label, options, value, onChange, render }: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  render?: (option: T, active: boolean) => React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5 rounded-xl border border-gold-400/[0.12] bg-black/20 p-1">
        {options.map((option) => {
          const active = option === value
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option)}
              className={`flex min-w-[56px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] capitalize transition-all duration-300 ${
                active
                  ? "bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] font-semibold text-[#1a160e] shadow-[0_6px_18px_-10px_rgba(217,192,138,0.9)]"
                  : "text-[#a3a59a] hover:bg-gold-400/[0.08] hover:text-gold-100"
              }`}
            >
              {render ? render(option, active) : option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Tiny frame glyph that previews an aspect ratio's shape. */
export function AspectGlyph({ ratio, active }: { ratio: string; active: boolean }) {
  const [w, h] = ratio.split(":").map(Number)
  const scale = 14 / Math.max(w, h)
  return (
    <span
      aria-hidden
      className={`inline-block rounded-[2px] border ${active ? "border-[#1a160e]/70" : "border-current opacity-70"}`}
      style={{ width: Math.max(5, w * scale), height: Math.max(5, h * scale) }}
    />
  )
}

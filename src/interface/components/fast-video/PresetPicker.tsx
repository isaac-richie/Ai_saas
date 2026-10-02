"use client"

import { useState } from "react"
import type * as React from "react"
import { Check, Search, Star, X } from "lucide-react"
import { NoneTile } from "./preset-visuals"

export type PresetOption = {
  id: string
  name: string
  description?: string
  detail?: string
  visual?: React.ReactNode
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
 * Visual preset chooser shared by every Fast Track preset family. Collapsed it
 * is a snap-scrolling rail; expanded it is a browsable grid. "None" is always
 * first, so presets are never mandatory.
 */
export function PresetPicker({
  label, noneLabel, noneDescription, options, selectedId, onSelect, search, onSearch,
  pinnedIds, recentIds, onTogglePin, expanded, onToggleExpanded, totalCount,
}: PresetPickerProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const selected = options.find((option) => option.id === selectedId)
  const showSearch = searchOpen || Boolean(search)
  return (
    <section className="space-y-2.5" aria-label={label}>
      <header className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8f9086]">{label}</p>
          <p className="truncate text-[13px] text-[#f3eee2]">
            {selected ? selected.name : <span className="lux-serif text-gold-300">{noneLabel}</span>}
          </p>
        </div>
        {selectedId ? (
          <button type="button" onClick={() => onSelect("")} aria-label={`Clear ${label.toLowerCase()}`} title="Clear" className="grid size-7 place-items-center rounded-full border border-gold-400/15 text-[#8f9086] transition hover:border-gold-400/40 hover:text-gold-100">
            <X className="h-3 w-3" />
          </button>
        ) : null}
        <button type="button" onClick={() => setSearchOpen((open) => !open)} aria-pressed={showSearch} aria-label={`Search ${label.toLowerCase()}`} className={`grid size-7 place-items-center rounded-full border transition ${showSearch ? "border-gold-400/45 bg-gold-400/10 text-gold-100" : "border-gold-400/15 text-[#8f9086] hover:border-gold-400/40 hover:text-gold-100"}`}>
          <Search className="h-3 w-3" />
        </button>
        <button type="button" onClick={onToggleExpanded} aria-expanded={expanded} className="h-7 shrink-0 rounded-full border border-gold-400/15 px-2.5 text-[10px] text-gold-200/90 transition hover:border-gold-400/45 hover:bg-gold-400/[0.08]">
          {expanded ? "Rail view" : `Browse ${totalCount}`}
        </button>
      </header>

      {showSearch && (
        <label className="lux-rise relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gold-400/60" aria-hidden />
          <input
            autoFocus
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { onSearch(""); setSearchOpen(false) } }}
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
      )}

      <div
        role="radiogroup"
        aria-label={label}
        className={expanded
          ? "lux-stagger grid grid-cols-2 gap-2 sm:grid-cols-3"
          : "preset-rail -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"}
      >
        <PresetCard
          index={0}
          compact={!expanded}
          name={noneLabel}
          description={noneDescription}
          visual={<NoneTile />}
          active={!selectedId}
          onSelect={() => onSelect("")}
        />
        {options.map((option, index) => (
          <PresetCard
            key={option.id}
            index={index + 1}
            compact={!expanded}
            name={option.name}
            description={option.description}
            detail={option.detail}
            visual={option.visual}
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

function PresetCard({ index, compact, name, description, detail, visual, active, onSelect, pinned, recent, onTogglePin }: {
  index: number
  compact: boolean
  name: string
  description?: string
  detail?: string
  visual?: React.ReactNode
  active: boolean
  onSelect: () => void
  pinned?: boolean
  recent?: boolean
  onTogglePin?: () => void
}) {
  return (
    <div
      data-active={active}
      style={{ "--i": Math.min(index, 10) } as React.CSSProperties}
      className={`preset-card group relative overflow-hidden rounded-xl border transition-all duration-300 ${compact ? "w-[132px] shrink-0 snap-start" : ""} ${
        active
          ? "border-gold-300/70 bg-gold-400/[0.07] shadow-[0_0_0_1px_rgba(217,192,138,0.2),0_16px_32px_-20px_rgba(217,192,138,0.8)]"
          : "border-gold-400/[0.12] bg-white/[0.02] hover:-translate-y-0.5 hover:border-gold-400/40"
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active}
        title={description}
        onClick={onSelect}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400/60"
      >
        <span className="relative block h-14 overflow-hidden rounded-t-[11px] bg-obsidian-900">
          {visual}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </span>
        <span className="block px-2.5 pb-2.5 pt-2">
          <span className="flex items-center gap-1.5">
            <span className={`truncate text-[11.5px] font-medium ${active ? "text-gold-50" : "text-[#e8e2d2]"}`}>{name}</span>
            {recent && !active ? <span className="size-1 shrink-0 rounded-full bg-gold-400/70" title="Recently used" aria-label="Recently used" /> : null}
          </span>
          {description ? <span className={`mt-0.5 block text-[10px] leading-snug text-[#8f9086] ${compact ? "line-clamp-1" : "line-clamp-2"}`}>{description}</span> : null}
          {detail && !compact ? <span className="mt-1 block text-[9px] uppercase tracking-[0.14em] text-gold-300/60">{detail}</span> : null}
        </span>
      </button>
      {active ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-gold-300 text-[#1a160e] shadow-[0_0_10px_rgba(217,192,138,0.8)]">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      ) : onTogglePin ? (
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
          title={pinned ? "Unpin" : "Pin to front"}
          className={`absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/40 backdrop-blur-sm transition ${
            pinned ? "text-gold-300" : "text-white/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-gold-200"
          }`}
        >
          <Star className="h-3 w-3" fill={pinned ? "currentColor" : "none"} />
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

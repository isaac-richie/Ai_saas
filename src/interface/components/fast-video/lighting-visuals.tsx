"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type * as React from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Check, LayoutGrid, X } from "lucide-react"
import { LIGHTING_GROUP_GLYPHS, LightGlyph } from "@/interface/components/editor/glyphs"
import { LIGHTING_GROUPS, LIGHTING_PRESETS, findLightingPreset, type LightingGroup, type LightingPreset } from "@/core/config/lighting-presets"

type Fx = "slats" | "dapple" | "rays" | "haze" | "flicker" | "strobe" | "lightning" | "spot" | "beams" | "flare" | "screen"

/**
 * How each setup draws as a lit sphere: where the key sits (x, y in % of the sphere), its colour and
 * spread, the shadow tone (which also stands for the amount of fill), an optional second light, a
 * rim, and an effect. No images: every card is a tiny lighting diagram that costs nothing to load.
 */
type Recipe = {
  bg: string
  base: string
  key?: { x: number; y: number; color: string; size: number; hard?: boolean }
  second?: { x: number; y: number; color: string; size: number }
  rim?: { side: "l" | "r" | "all"; color: string }
  floor?: string
  fx?: Fx
  silhouette?: boolean
}

const R: Record<string, Recipe> = {
  light_rembrandt: { bg: "radial-gradient(120% 90% at 20% 10%, #1d160e, #070605)", base: "#0b0907", key: { x: 30, y: 25, color: "#f3dcb8", size: 55 } },
  light_butterfly: { bg: "radial-gradient(100% 80% at 50% 0%, #2a221b, #0a0807)", base: "#2a2420", key: { x: 50, y: 16, color: "#fbefe0", size: 62 }, second: { x: 50, y: 98, color: "rgba(255,240,220,0.35)", size: 40 } },
  light_loop: { bg: "radial-gradient(110% 90% at 30% 10%, #2a2119, #0c0a08)", base: "#3a2f27", key: { x: 36, y: 26, color: "#f6e2c6", size: 64 } },
  light_split: { bg: "linear-gradient(90deg, #1a1712, #060605)", base: "#050505", key: { x: 0, y: 50, color: "#f2ece2", size: 50, hard: true } },
  light_short: { bg: "radial-gradient(100% 90% at 85% 20%, #1b1712, #060505)", base: "#0a0908", key: { x: 74, y: 34, color: "#e8dcc8", size: 52 } },
  light_clamshell: { bg: "radial-gradient(100% 90% at 50% 0%, #4a4038, #1a1714)", base: "#8c7c70", key: { x: 50, y: 14, color: "#fff6ea", size: 78 }, second: { x: 50, y: 100, color: "rgba(255,245,235,0.55)", size: 45 } },
  light_high_key: { bg: "linear-gradient(180deg, #f6f3ee, #d9d4cb)", base: "#c9c2b8", key: { x: 45, y: 30, color: "#ffffff", size: 88 }, floor: "rgba(120,110,100,0.18)" },
  light_low_key: { bg: "#040404", base: "#020202", key: { x: 14, y: 36, color: "#e9e3d6", size: 40 } },
  light_chiaroscuro: { bg: "radial-gradient(90% 80% at 25% 15%, #22170c, #030201)", base: "#040302", key: { x: 28, y: 22, color: "#f0c27a", size: 48 } },
  light_noir_slats: { bg: "linear-gradient(160deg, #262626, #0b0b0b)", base: "#111111", key: { x: 24, y: 30, color: "#ececec", size: 72 }, fx: "slats" },
  light_silhouette: { bg: "linear-gradient(180deg, #fbe2b4 0%, #f0a65c 60%, #b8582c 100%)", base: "#0b0806", rim: { side: "all", color: "rgba(255,226,180,0.95)" }, silhouette: true, floor: "rgba(40,16,6,0.55)" },
  light_top: { bg: "#050505", base: "#050505", key: { x: 50, y: 0, color: "#f0ebe0", size: 46, hard: true }, floor: "rgba(240,235,224,0.32)", fx: "spot" },
  light_under: { bg: "radial-gradient(100% 70% at 50% 100%, #2a2216, #050505)", base: "#050505", key: { x: 50, y: 100, color: "#e8d7b8", size: 55 } },
  light_rim: { bg: "#050608", base: "#0a0b0d", key: { x: 40, y: 40, color: "rgba(200,200,210,0.18)", size: 60 }, rim: { side: "all", color: "#f6ead0" } },
  light_halo: { bg: "radial-gradient(90% 80% at 50% 28%, #f2c98a, #5a3a1c 55%, #1c1209)", base: "#6b4a30", key: { x: 50, y: 60, color: "rgba(255,226,190,0.45)", size: 70 }, rim: { side: "all", color: "#ffdca8" }, fx: "haze" },
  light_kicker: { bg: "#060608", base: "#070708", key: { x: 96, y: 46, color: "#ededed", size: 28, hard: true }, rim: { side: "r", color: "#f4f4f4" } },
  light_golden_hour: { bg: "linear-gradient(170deg, #f7c27a 0%, #c7743a 55%, #4a2614 100%)", base: "#4a2c18", key: { x: 16, y: 40, color: "#ffd38e", size: 72 }, fx: "flare" },
  light_blue_hour: { bg: "linear-gradient(180deg, #33498a 0%, #16204a 70%, #0b1028 100%)", base: "#1a2240", key: { x: 50, y: 28, color: "#a8bcec", size: 80 }, second: { x: 88, y: 72, color: "rgba(255,190,110,0.5)", size: 32 } },
  light_overcast: { bg: "linear-gradient(180deg, #a7afb4, #6e767c)", base: "#7d8287", key: { x: 50, y: 18, color: "#e8eaec", size: 96 }, floor: "rgba(40,44,48,0.25)" },
  light_noon_sun: { bg: "linear-gradient(180deg, #8fc3f2 0%, #f3dcae 70%, #e2b979 100%)", base: "#2a2116", key: { x: 50, y: 4, color: "#ffffff", size: 46, hard: true }, floor: "rgba(20,14,6,0.7)" },
  light_window: { bg: "linear-gradient(90deg, #ece7dc 0%, #ece7dc 16%, #5a5248 17%, #2a2622 60%, #151310 100%)", base: "#2b2622", key: { x: 6, y: 40, color: "#f3f0e9", size: 82 } },
  light_dappled: { bg: "linear-gradient(180deg, #3c4c26, #121a0c)", base: "#2a3018", key: { x: 40, y: 34, color: "#f6e7a8", size: 66 }, fx: "dapple" },
  light_moonlight: { bg: "radial-gradient(100% 90% at 80% 0%, #1a2742, #03060c 70%)", base: "#05080f", key: { x: 76, y: 14, color: "#b8c8e8", size: 56 } },
  light_candle: { bg: "radial-gradient(70% 55% at 50% 100%, #3a1d07, #0a0603 70%)", base: "#070402", key: { x: 50, y: 98, color: "#ffb04a", size: 62 }, fx: "flicker" },
  light_firelight: { bg: "radial-gradient(80% 60% at 15% 100%, #5a2206, #0c0502 70%)", base: "#0a0402", key: { x: 18, y: 82, color: "#ff8a2a", size: 72 }, fx: "flicker" },
  light_lamplit: { bg: "radial-gradient(60% 50% at 15% 35%, #4a3014, #1a120a 60%, #0c0805)", base: "#1c140c", key: { x: 18, y: 34, color: "#ffcf8a", size: 60 }, second: { x: 88, y: 64, color: "rgba(255,200,130,0.45)", size: 40 } },
  light_screen_glow: { bg: "#05070c", base: "#04060a", key: { x: 50, y: 64, color: "#a8c8ff", size: 56 }, fx: "screen" },
  light_neon: { bg: "linear-gradient(135deg, #2a0a2a, #12061a 50%, #061a24)", base: "#0d0614", key: { x: 12, y: 40, color: "#ff4fb8", size: 62 }, second: { x: 90, y: 42, color: "#3fe0ff", size: 58 } },
  light_headlights: { bg: "#050608", base: "#060708", key: { x: 50, y: 52, color: "#f4f6ff", size: 58 }, fx: "beams" },
  light_teal_orange: { bg: "linear-gradient(180deg, #0f3a40, #04161a)", base: "#0d3036", key: { x: 30, y: 30, color: "#ffae6a", size: 60 }, rim: { side: "r", color: "#5fd3d8" } },
  light_bicolor: { bg: "linear-gradient(90deg, #2a0508, #0a0410 50%, #050a2a)", base: "#08040c", key: { x: 0, y: 45, color: "#ff2a3a", size: 76 }, second: { x: 100, y: 45, color: "#2a5cff", size: 76 } },
  light_god_rays: { bg: "linear-gradient(180deg, #2a2218, #0e0b08)", base: "#1c1610", key: { x: 28, y: 10, color: "#ffe8b8", size: 66 }, fx: "rays" },
  light_haze: { bg: "radial-gradient(100% 80% at 50% 20%, #3a3b48, #101015)", base: "#2b2c36", key: { x: 50, y: 28, color: "#d8dcf0", size: 76 }, rim: { side: "all", color: "rgba(220,226,255,0.55)" }, fx: "haze" },
  light_spotlight: { bg: "#030303", base: "#050505", key: { x: 50, y: 14, color: "#fff7e6", size: 62 }, floor: "rgba(255,247,230,0.4)", fx: "spot" },
  light_strobe: { bg: "linear-gradient(160deg, #24082e, #12051a 60%, #04201c)", base: "#0c0410", key: { x: 28, y: 30, color: "#c44bff", size: 60 }, second: { x: 82, y: 62, color: "#2ef0c8", size: 50 }, fx: "strobe" },
  light_fluorescent: { bg: "linear-gradient(180deg, #d3dfcd, #8c9a88)", base: "#6d7a6a", key: { x: 50, y: 6, color: "#ecf7e5", size: 96 }, fx: "flicker" },
  light_lightning: { bg: "linear-gradient(180deg, #0d1322, #070a12)", base: "#04060a", key: { x: 72, y: 10, color: "#e8eeff", size: 64 }, fx: "lightning" },
}

const FALLBACK: Recipe = { bg: "#0c0c0c", base: "#1a1a1a", key: { x: 40, y: 30, color: "#e3cf9f", size: 60 } }

function sphereStyle(r: Recipe): React.CSSProperties {
  const layers: string[] = []
  if (r.second) layers.push(`radial-gradient(circle at ${r.second.x}% ${r.second.y}%, ${r.second.color} 0%, color-mix(in srgb, ${r.second.color} 45%, transparent) ${r.second.size * 0.4}%, transparent ${r.second.size}%)`)
  if (r.key) {
    const { x, y, color, size, hard } = r.key
    layers.push(hard
      ? `radial-gradient(circle at ${x}% ${y}%, ${color} 0%, ${color} ${size * 0.55}%, color-mix(in srgb, ${color} 30%, transparent) ${size * 0.68}%, transparent ${size * 0.75}%)`
      : `radial-gradient(circle at ${x}% ${y}%, ${color} 0%, color-mix(in srgb, ${color} 55%, transparent) ${size * 0.38}%, transparent ${size}%)`)
  }
  const shadows: string[] = ["0 10px 18px -8px rgba(0,0,0,0.85)"]
  if (r.rim?.side === "all") shadows.push(`inset 0 0 0 1.5px ${r.rim.color}`, `inset 0 0 10px 1px color-mix(in srgb, ${r.rim.color} 70%, transparent)`, `0 0 16px -2px ${r.rim.color}`)
  if (r.rim?.side === "r") shadows.push(`inset -6px 0 7px -3px ${r.rim.color}`, `6px 0 14px -6px ${r.rim.color}`)
  if (r.rim?.side === "l") shadows.push(`inset 6px 0 7px -3px ${r.rim.color}`, `-6px 0 14px -6px ${r.rim.color}`)
  return { background: [...layers, r.base].join(", "), boxShadow: shadows.join(", ") }
}

/** A tiny lighting diagram: the setup drawn as light falling on a sphere. */
export function LightingSwatch({ id, live = false, className = "" }: { id: string; live?: boolean; className?: string }) {
  const r = R[id] ?? FALLBACK
  return (
    <span aria-hidden data-live={live} className={`lt-swatch relative block overflow-hidden ${className}`} style={{ background: r.bg }}>
      {r.fx === "spot" && <span className="absolute inset-x-[18%] top-0 h-full bg-[radial-gradient(60%_100%_at_50%_0%,rgba(255,247,230,0.16),transparent_70%)]" />}
      {r.fx === "rays" && <span className="lt-fx-rays absolute inset-0" />}
      {r.fx === "beams" && <span className="lt-fx-beams absolute inset-0" />}
      {r.floor && <span className="absolute bottom-[8%] left-1/2 h-[9%] w-[50%] -translate-x-1/2 rounded-[50%] blur-[3px]" style={{ background: r.floor }} />}
      <span
        className={`lt-sphere absolute left-1/2 top-[47%] aspect-square h-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full ${r.fx === "flicker" ? "lt-fx-flicker" : ""} ${r.fx === "screen" ? "lt-fx-screen" : ""}`}
        style={sphereStyle(r)}
      />
      {r.fx === "slats" && <span className="lt-fx-slats absolute inset-0" />}
      {r.fx === "dapple" && <span className="lt-fx-dapple absolute inset-0" />}
      {r.fx === "haze" && <span className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_30%,rgba(255,250,240,0.22),transparent_70%)] mix-blend-screen" />}
      {r.fx === "flare" && <span className="absolute left-[8%] top-[30%] size-[22%] rounded-full bg-[radial-gradient(circle,rgba(255,240,200,0.9),rgba(255,200,120,0.25)_45%,transparent_70%)] mix-blend-screen" />}
      {r.fx === "strobe" && <span className="lt-fx-strobe absolute inset-0 bg-white mix-blend-overlay" />}
      {r.fx === "lightning" && <span className="lt-fx-lightning absolute inset-0 bg-[#dfe6ff] mix-blend-screen" />}
    </span>
  )
}

/** Where each setup's example photo lives: the same portrait relit for every setup. */
export const lightingPhotoUrl = (id: string) => `/lighting/${id}.webp`

/**
 * The setup's example photo, with its lit-sphere diagram as a small badge (where the light comes
 * from). Falls back to the full diagram when there is no photo yet, so a card is never empty.
 */
export function LightingPhoto({ id, live = false, badge = true, focus = "50% 50%", className = "" }: { id: string; live?: boolean; badge?: boolean; focus?: string; className?: string }) {
  const [missing, setMissing] = useState(false)
  if (missing) return <LightingSwatch id={id} live={live} className={className} />
  return (
    <span className={`relative block overflow-hidden bg-black ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lightingPhotoUrl(id)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setMissing(true)}
        className="preset-image absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: focus }}
      />
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(0,0,0,0.55))]" />
      {badge ? (
        <span className="absolute bottom-1.5 left-1.5 overflow-hidden rounded-full ring-1 ring-white/25 shadow-[0_4px_10px_rgba(0,0,0,0.6)]" title="Where the light comes from">
          <LightingSwatch id={id} live={live} className="size-6" />
        </span>
      ) : null}
    </span>
  )
}

type Preview = { preset: LightingPreset; rect: DOMRect }

const noSubscribe = () => () => {}
/** True once running in the browser, where portals can attach to the page. */
const useIsClient = () => useSyncExternalStore(noSubscribe, () => true, () => false)

/** A larger look at a setup, floating beside the card it came from. */
function PreviewCard({ preview }: { preview: Preview | null }) {
  const mounted = useIsClient()
  if (!mounted) return null
  let style: React.CSSProperties = {}
  if (preview) {
    const width = 272
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, preview.rect.left + preview.rect.width / 2 - width / 2))
    const above = preview.rect.top > 470
    style = above ? { left, top: preview.rect.top - 10, transform: "translateY(-100%)", width } : { left, top: preview.rect.bottom + 10, width }
  }
  return createPortal(
    <AnimatePresence>
      {preview ? (
        <motion.div
          key={preview.preset.id}
          role="tooltip"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.16 }}
          style={style}
          className="pointer-events-none fixed z-[90] overflow-hidden rounded-2xl border border-white/10 bg-obsidian-900/95 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl"
        >
          <LightingPhoto id={preview.preset.id} live className="aspect-[4/5] w-full" />
          <div className="space-y-1 p-3">
            <p className="text-[14px] font-semibold text-white">{preview.preset.name}</p>
            <p className="text-[11.5px] text-gold-200/90">{preview.preset.mood}</p>
            <p className="text-[12px] leading-snug text-[#c9c3b4]">{preview.preset.description}</p>
            <p className="text-[11.5px] text-[#8f97a1]">Best for {preview.preset.bestFor.toLowerCase()}.</p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

/** Every setup at a glance, grouped; choosing one closes the gallery. */
function LightingGallery({ open, value, onClose, onPick }: { open: boolean; value: string; onClose: () => void; onPick: (id: string) => void }) {
  const mounted = useIsClient()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])
  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div key="gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
          <motion.div
            role="dialog"
            aria-label="All lighting setups"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-obsidian-900 sm:rounded-3xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="text-[17px] font-medium text-white">Lighting setups</h2>
                <p className="text-xs text-[#8f97a1]">The same portrait under every setup. The dot shows where the light comes from.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-[#b0b8c4] hover:bg-white/5"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
              {LIGHTING_GROUPS.map((group) => (
                <section key={group.id} className="space-y-2.5">
                  <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gold-200">
                    {(() => { const Glyph = LIGHTING_GROUP_GLYPHS[group.id]; return Glyph ? <Glyph size={16} /> : null })()}
                    {group.label} <span className="normal-case tracking-normal text-[#7d858f]">· {group.hint}</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {LIGHTING_PRESETS.filter((preset) => preset.group === group.id).map((preset) => {
                      const active = preset.id === value
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onPick(active ? "" : preset.id)}
                          aria-pressed={active}
                          className={`lt-card relative overflow-hidden rounded-xl border text-left transition-all duration-300 ${active ? "border-[1.5px] border-[#E5A93C]" : "border-white/[0.08] hover:-translate-y-0.5 hover:border-gold-400/40"}`}
                        >
                          <LightingPhoto id={preset.id} live={active} className="aspect-[4/5] w-full" />
                          {active ? <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[#E5A93C] text-[#1a160e]"><Check className="size-3.5" strokeWidth={3} /></span> : null}
                          <span className="block p-2.5">
                            <span className="block truncate text-[13px] font-semibold text-[#ece6d6]">{preset.name}</span>
                            <span className="block truncate text-[11px] text-[#9aa1ab]">{preset.mood}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

/**
 * The lighting chooser: group filters, a rail of photo cards (the same portrait relit per setup),
 * a larger preview on hover or long-press, and a gallery of everything. Clicking the chosen card
 * again clears it, so lighting is never required.
 */
export function LightingPicker({ value, onChange, label = "Lighting", noneLabel = "From your idea", compact = false, wide = false, disabled = false }: {
  value: string
  onChange: (id: string) => void
  label?: string
  noneLabel?: string
  compact?: boolean
  /** Wide cards that match the Style rail beside them (Create, the film console). */
  wide?: boolean
  disabled?: boolean
}) {
  const [group, setGroup] = useState<LightingGroup | "all">("all")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const selected = findLightingPreset(value)
  const options = useMemo(() => (group === "all" ? LIGHTING_PRESETS : LIGHTING_PRESETS.filter((preset) => preset.group === group)), [group])
  const rail = useRef<HTMLDivElement>(null)

  // Keep the chosen setup in view in the rail (without moving the page).
  useEffect(() => {
    const el = rail.current
    const card = el?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (!el || !card) return
    // The rail is the card's positioning parent, so offsetLeft is already rail-relative.
    const left = card.offsetLeft
    if (left < el.scrollLeft || left + card.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: Math.max(0, left - 8), behavior: "smooth" })
    }
  }, [value, group])

  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])

  const showSoon = (preset: LightingPreset, target: HTMLElement, delay: number) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setPreview({ preset, rect: target.getBoundingClientRect() }), delay)
  }
  const hide = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setPreview(null)
  }

  return (
    <section className="space-y-2.5" aria-label={label}>
      <header className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-[13px]">
          <span className="font-medium text-[#ece6d6]">{label}</span>
          <span className={selected ? "text-gold-200" : "text-[#9aa1ab]"}> · {selected ? selected.name : noneLabel}</span>
        </div>
        {selected && !disabled ? (
          <button type="button" onClick={() => onChange("")} aria-label={`Clear ${label.toLowerCase()}`} title="Clear" className="grid size-8 place-items-center rounded-full border border-line text-[#9aa1ab] transition hover:border-line-strong hover:text-white">
            <X className="h-3 w-3" />
          </button>
        ) : null}
        <button type="button" disabled={disabled} onClick={() => setGalleryOpen(true)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-[12px] text-[#c9cdd3] transition hover:border-line-strong hover:text-white disabled:opacity-50">
          <LayoutGrid className="size-3.5" /> See all {LIGHTING_PRESETS.length}
        </button>
      </header>

      <div role="tablist" aria-label="Lighting groups" className="preset-rail -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {[{ id: "all" as const, label: "All", hint: "Every setup" }, ...LIGHTING_GROUPS].map((item) => {
          const Glyph = item.id === "all" ? null : LIGHTING_GROUP_GLYPHS[item.id]
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={group === item.id}
              title={item.hint}
              onClick={() => setGroup(item.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-[12px] transition-colors ${
                group === item.id ? "border-gold-300/60 bg-gold-400/[0.12] text-gold-50" : "border-white/[0.08] text-[#b0b8c4] hover:border-white/20 hover:text-white"
              }`}
            >
              {Glyph ? <Glyph size={14} strokeWidth={1.7} /> : null}
              {item.label}
            </button>
          )
        })}
      </div>

      <div ref={rail} role="radiogroup" aria-label={label} onScroll={hide} className="preset-rail relative -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1.5">
        {group === "all" ? (
          <button
            type="button"
            role="radio"
            aria-checked={!value}
            disabled={disabled}
            onClick={() => onChange("")}
            className={`relative flex shrink-0 snap-start flex-col overflow-hidden rounded-xl border text-left transition-all duration-300 disabled:opacity-50 ${
              wide ? "h-[188px] w-[140px]" : compact ? "w-[112px]" : "w-[124px]"
            } ${!value ? "border-[1.5px] border-[#E5A93C] bg-gold-400/[0.07]" : "border-dashed border-line-strong bg-white/[0.02] hover:border-gold-400/40"}`}
          >
            <span className={`relative grid w-full place-items-center bg-[radial-gradient(80%_80%_at_50%_30%,rgba(227,207,159,0.12),transparent_70%),#0c0d0c] text-gold-200/80 ${wide ? "h-[72px]" : "aspect-[4/5]"}`}>
              <span className="flex flex-col items-center gap-1.5">
                <LightGlyph size={wide ? 22 : 26} />
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[#8f97a1]">Auto</span>
              </span>
            </span>
            {!value ? <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-[#E5A93C] text-[#1a160e] shadow"><Check className="size-3" strokeWidth={3} /></span> : null}
            <span className="block px-2.5 pb-2.5 pt-2">
              <span className={`block text-[12.5px] font-semibold ${!value ? "text-gold-50" : "text-[#ece6d6]"}`}>{noneLabel}</span>
              {wide ? <span className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-[#B0B8C4]">The light comes from your words and references.</span> : null}
            </span>
          </button>
        ) : null}
        {options.map((preset) => {
          const active = preset.id === value
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${preset.name}: ${preset.description}`}
              disabled={disabled}
              onClick={() => {
                // A long-press only previews; it never selects.
                if (longPressed.current) { longPressed.current = false; return }
                hide()
                onChange(active ? "" : preset.id)
              }}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") showSoon(preset, e.currentTarget, 380) }}
              onPointerLeave={hide}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse") return
                const target = e.currentTarget
                longPressed.current = false
                if (hoverTimer.current) clearTimeout(hoverTimer.current)
                hoverTimer.current = setTimeout(() => { longPressed.current = true; setPreview({ preset, rect: target.getBoundingClientRect() }) }, 450)
              }}
              onPointerUp={(e) => { if (e.pointerType !== "mouse") { if (hoverTimer.current) clearTimeout(hoverTimer.current); if (longPressed.current) setTimeout(() => setPreview(null), 1200) } }}
              onContextMenu={(e) => e.preventDefault()}
              className={`lt-card group/lt relative shrink-0 snap-start overflow-hidden rounded-xl border text-left transition-all duration-300 disabled:opacity-50 ${wide ? "flex h-[188px] w-[140px] flex-col" : compact ? "w-[112px]" : "w-[124px]"} ${
                active
                  ? "border-[1.5px] border-[#E5A93C] bg-gold-400/[0.07] shadow-[0_12px_28px_-18px_rgba(229,169,60,0.8)]"
                  : "border-line bg-white/[0.02] hover:-translate-y-0.5 hover:border-gold-400/35"
              }`}
            >
              <LightingPhoto id={preset.id} live={active} focus={wide ? "50% 28%" : "50% 50%"} className={wide ? "h-[72px] w-full shrink-0" : "aspect-[4/5] w-full"} />
              {active && (
                <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-[#E5A93C] text-[#1a160e] shadow">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
              {wide ? (
                <span className="block px-2.5 pb-2.5 pt-2">
                  <span className={`block text-[12.5px] font-semibold leading-[1.25] ${active ? "text-gold-50" : "text-[#ece6d6]"}`}>{preset.name}</span>
                  <span className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-[#B0B8C4]">{preset.description}</span>
                  <span className="mt-1 block truncate text-[9.5px] font-medium uppercase tracking-[0.08em] text-[#D49B35]">{preset.mood}</span>
                </span>
              ) : (
                <span className="block px-2.5 pb-2 pt-1.5">
                  <span className={`block truncate text-[12.5px] font-semibold ${active ? "text-gold-50" : "text-[#e8e2d2]"}`}>{preset.name}</span>
                  <span className="block truncate text-[10.5px] text-[#9aa1ab]">{preset.mood}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selected ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-[#c9c3b4]">
          {selected.description} <span className="text-[#8f97a1]">Best for {selected.bestFor.toLowerCase()}.</span>
        </div>
      ) : null}

      <PreviewCard preview={preview} />
      <LightingGallery open={galleryOpen} value={value} onClose={() => setGalleryOpen(false)} onPick={(id) => { onChange(id); setGalleryOpen(false) }} />
    </section>
  )
}

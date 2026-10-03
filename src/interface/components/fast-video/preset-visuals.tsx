import Image from "next/image"
import type * as React from "react"

/** Colour story for each style preset, drawn as a soft three-stop swatch. */
const STYLE_SWATCHES: Record<string, [string, string, string]> = {
  style_golden_hour_film: ["#f6c27a", "#d98a4e", "#5b3a2a"],
  style_cyberpunk_neon: ["#ff4fd8", "#5b3bff", "#0ff0ff"],
  style_classic_noir_bw: ["#f2f2f2", "#7a7a7a", "#111111"],
  style_anime_action: ["#ff6b6b", "#ffd93d", "#4d96ff"],
  style_retro_70s: ["#e8b86d", "#c56e3b", "#6e7f5a"],
  style_hyperreal_studio: ["#f7f7f5", "#c9ccd1", "#4a4f57"],
  style_fantasy_ethereal: ["#f3d9ff", "#a7c7ff", "#6a5acd"],
  style_lofi_security: ["#9fb59a", "#5c6b58", "#1f2a1e"],
  style_post_apocalypse: ["#c9a46b", "#7d6347", "#3a2f25"],
  style_underwater_blue: ["#7fe0ff", "#1f78b4", "#062b4f"],
}

/** Example stills showing what each style tends to produce (public/presets). */
export const STYLE_PREVIEW_IMAGES: Record<string, string> = {
  style_golden_hour_film: "/presets/style_golden_hour_film.jpg",
  style_retro_70s: "/presets/style_retro_70s.jpg",
  style_classic_noir_bw: "/presets/style_classic_noir_bw.jpg",
  style_cyberpunk_neon: "/presets/style_cyberpunk_neon.jpg",
  style_anime_action: "/presets/style_anime_action.jpg",
  style_hyperreal_studio: "/presets/style_hyperreal_studio.jpg",
  style_fantasy_ethereal: "/presets/style_fantasy_ethereal.jpg",
  style_lofi_security: "/presets/style_lofi_security.jpg",
  style_post_apocalypse: "/presets/style_post_apocalypse.jpg",
  style_underwater_blue: "/presets/style_underwater_blue.jpg",
}

export function StyleSwatch({ id, name }: { id: string; name?: string }) {
  const [a, b, c] = STYLE_SWATCHES[id] ?? ["#e3cf9f", "#8a6c3e", "#1c1f1c"]
  const preview = STYLE_PREVIEW_IMAGES[id]
  if (preview) {
    return (
      <span className="preset-swatch relative block h-full w-full" style={{ "--sw-a": a, "--sw-b": b, "--sw-c": c } as React.CSSProperties}>
        <Image src={preview} alt={name ? `Example of the ${name} style` : ""} fill sizes="(max-width: 640px) 50vw, 220px" className="preset-image object-cover" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="preset-swatch block h-full w-full"
      style={{ "--sw-a": a, "--sw-b": b, "--sw-c": c } as React.CSSProperties}
    />
  )
}

type MotionKind = "pan" | "in" | "out" | "track" | "pushpull" | "tilt" | "static" | "shake" | "shake-hard" | "whip"
const MOTION_KINDS: Record<string, MotionKind> = {
  motion_slow_drone_pan: "pan",
  motion_dolly_in: "in",
  motion_dolly_out: "out",
  motion_fast_action_tracking: "track",
  motion_jaws_push_pull: "pushpull",
  motion_vertigo_tilt: "tilt",
  motion_static_tripod: "static",
  motion_handheld_gentle: "shake",
  motion_handheld_aggressive: "shake-hard",
  motion_whip_transition: "whip",
}

/** Tiny looping diagram of the camera move, so motion presets read at a glance. */
export function MotionGlyph({ id }: { id: string }) {
  const kind = MOTION_KINDS[id] ?? "static"
  return (
    <span aria-hidden className="motion-tile">
      <svg viewBox="0 0 64 36" className={`motion-glyph motion-glyph--${kind}`}>
        <g className="motion-glyph__frame">
          <rect x="20" y="10" width="24" height="16" rx="2.5" />
          {kind === "pushpull" ? <rect x="26" y="14" width="12" height="8" rx="1.5" className="motion-glyph__inner" /> : null}
        </g>
        <circle cx="32" cy="18" r="1.6" className="motion-glyph__dot" />
      </svg>
    </span>
  )
}

export function NoneTile() {
  return <span aria-hidden className="grid h-full w-full place-items-center rounded-[inherit] border border-dashed border-gold-400/25 text-[10px] uppercase tracking-[0.2em] text-gold-300/60">none</span>
}

import React from "react"
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion"
import { color, font } from "./theme"

/** Cinematic ease: slow in, slow out. */
export const ease = Easing.bezier(0.45, 0, 0.2, 1)
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1)

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const

/** Interpolate across keyframes with the cinematic ease. */
export function tween(frame: number, input: number[], output: number[], easing = ease) {
  return interpolate(frame, input, output, { ...clamp, easing })
}

/** Animated film grain. Re-seeded every 2 frames like real stock. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.075 }) => {
  const frame = useCurrentFrame()
  const seed = Math.floor(frame / 2)
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity }}>
      <svg width="100%" height="100%">
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  )
}

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.62 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(120% 95% at 50% 45%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
)

/** Slight lift of the champagne highlights, applied over the whole frame. */
export const Grade: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      mixBlendMode: "soft-light",
      background: "linear-gradient(180deg, rgba(217,192,138,0.10), rgba(11,12,11,0.0) 40%, rgba(11,12,11,0.25))",
    }}
  />
)

export type CameraKey = { at: number; scale: number; x?: number; y?: number; rotateX?: number; rotateY?: number }

/** Virtual camera over a still or video plate: push-ins, pans and a little 3D tilt. */
export const Camera: React.FC<{ keys: CameraKey[]; children: React.ReactNode; perspective?: number }> = ({ keys, children, perspective = 2400 }) => {
  const frame = useCurrentFrame()
  const at = keys.map((k) => k.at)
  const pick = (f: (k: CameraKey) => number) => (keys.length === 1 ? f(keys[0]) : tween(frame, at, keys.map(f)))
  const scale = pick((k) => k.scale)
  const x = pick((k) => k.x ?? 0)
  const y = pick((k) => k.y ?? 0)
  const rx = pick((k) => k.rotateX ?? 0)
  const ry = pick((k) => k.rotateY ?? 0)
  return (
    <AbsoluteFill style={{ perspective }}>
      <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) scale(${scale}) rotateX(${rx}deg) rotateY(${ry}deg)`, transformOrigin: "50% 50%" }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

export type Rect = { x: number; y: number; w: number; h: number; r?: number }

/**
 * Focus pull: everything outside `rect` is blurred and dimmed, the rect stays sharp.
 * `amount` 0..1 lets the pull rack in and out.
 */
export const Focus: React.FC<{ rect: Rect; amount: number; children: React.ReactNode }> = ({ rect, amount, children }) => {
  if (amount <= 0.001) return <AbsoluteFill>{children}</AbsoluteFill>
  const r = rect.r ?? 14
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: `blur(${6 * amount}px) brightness(${1 - 0.5 * amount}) saturate(${1 - 0.3 * amount})` }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(${rect.y}px calc(100% - ${rect.x + rect.w}px) calc(100% - ${rect.y + rect.h}px) ${rect.x}px round ${r}px)` }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** A gold light sweep travelling across a rect (button glints, card reveals). */
export const Sweep: React.FC<{ rect: Rect; start: number; duration?: number; strength?: number }> = ({ rect, start, duration = 16, strength = 0.75 }) => {
  const frame = useCurrentFrame()
  const t = tween(frame, [start, start + duration], [-0.4, 1.4], easeOut)
  if (frame < start || frame > start + duration) return null
  return (
    <div
      style={{
        position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, overflow: "hidden",
        borderRadius: rect.r ?? 999, mixBlendMode: "screen", pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute", top: "-50%", height: "200%", width: "35%", left: `${t * 100}%`,
          transform: "rotate(18deg)",
          background: `linear-gradient(90deg, transparent, rgba(255,240,205,${strength}), transparent)`,
          filter: "blur(6px)",
        }}
      />
    </div>
  )
}

export type CursorKey = { at: number; x: number; y: number }

/** Smooth, eased cursor with a press and gold ripple on click frames. */
export const Cursor: React.FC<{ path: CursorKey[]; clicks?: number[]; appear?: number; vanish?: number }> = ({ path, clicks = [], appear = 0, vanish = Infinity }) => {
  const frame = useCurrentFrame()
  if (frame < appear || frame > vanish) return null
  const at = path.map((p) => p.at)
  const x = path.length === 1 ? path[0].x : tween(frame, at, path.map((p) => p.x))
  const y = path.length === 1 ? path[0].y : tween(frame, at, path.map((p) => p.y))
  const press = clicks.reduce((s, c) => Math.max(s, interpolate(frame, [c - 3, c, c + 5], [0, 1, 0], clamp)), 0)
  const opacity = interpolate(frame, [appear, appear + 6, vanish - 6, vanish], [0, 1, 1, 0], clamp)
  return (
    <>
      {clicks.map((c) => {
        const t = interpolate(frame, [c, c + 16], [0, 1], clamp)
        if (frame < c || t >= 1) return null
        return (
          <div key={c} style={{
            position: "absolute", left: x - 34 * t - 6, top: y - 34 * t - 6, width: 12 + 68 * t, height: 12 + 68 * t,
            borderRadius: "50%", border: `2px solid ${color.gold}`, opacity: 1 - t, pointerEvents: "none",
          }} />
        )
      })}
      <svg width="34" height="34" viewBox="0 0 24 24" style={{
        position: "absolute", left: x, top: y, opacity,
        transform: `scale(${1 - press * 0.18})`, transformOrigin: "4px 3px",
        filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.55))",
      }}>
        <path d="M4 3 L4 19 L8.6 14.8 L11.6 21 L14.2 19.8 L11.3 13.8 L17.5 13.6 Z" fill="#fbf8f1" stroke="#0b0c0b" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </>
  )
}

/** Masked line-by-line title reveal with a gentle letter-spacing settle. */
export const Title: React.FC<{
  lines: { text: string; italic?: boolean; gold?: boolean }[]
  start: number
  stagger?: number
  size?: number
  align?: "left" | "center"
  out?: number
}> = ({ lines, start, stagger = 9, size = 120, align = "left", out }) => {
  const frame = useCurrentFrame()
  const fade = out === undefined ? 1 : interpolate(frame, [out, out + 10], [1, 0], clamp)
  return (
    <div style={{ fontFamily: font.serif, color: color.paper, fontSize: size, lineHeight: 1.02, textAlign: align, opacity: fade, letterSpacing: "-0.045em" }}>
      {lines.map((line, i) => {
        const s = start + i * stagger
        const y = tween(frame, [s, s + 22], [105, 0], easeOut)
        const track = tween(frame, [s, s + 40], [0.02, -0.045], easeOut)
        return (
          <div key={i} style={{ overflow: "hidden", paddingBottom: size * 0.08 }}>
            <div style={{
              transform: `translateY(${y}%)`, letterSpacing: `${track}em`,
              fontStyle: line.italic ? "italic" : "normal", color: line.gold ? color.gold : color.paper,
            }}>
              {line.text}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Small spaced caps label, like the site's eyebrows. */
export const Eyebrow: React.FC<{ text: string; start: number; style?: React.CSSProperties }> = ({ text, start, style }) => {
  const frame = useCurrentFrame()
  const o = tween(frame, [start, start + 14], [0, 1])
  const spacing = tween(frame, [start, start + 30], [0.42, 0.24], easeOut)
  return (
    <div style={{ fontFamily: font.sans, fontSize: 18, letterSpacing: `${spacing}em`, color: color.gold, opacity: o, ...style }}>
      {text}
    </div>
  )
}

/** Light leak: a soft warm bloom drifting across the frame for transitions. */
export const LightLeak: React.FC<{ start: number; duration?: number }> = ({ start, duration = 20 }) => {
  const frame = useCurrentFrame()
  const t = interpolate(frame, [start, start + duration], [0, 1], clamp)
  if (frame < start || frame > start + duration) return null
  const o = Math.sin(t * Math.PI) * 0.85
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: o }}>
      <AbsoluteFill style={{
        background: `radial-gradient(45% 70% at ${20 + t * 70}% ${40 + random(`leak-${start}`) * 20}%, rgba(255,214,150,0.9), rgba(217,140,80,0.35) 40%, transparent 70%)`,
        filter: "blur(30px)",
      }} />
    </AbsoluteFill>
  )
}

/**
 * Whip transition: the outgoing plate streaks sideways with motion blur and a warm flash.
 * Wrap the outgoing scene's content; `start` is when the whip begins.
 */
export const WhipOut: React.FC<{ start: number; duration?: number; direction?: 1 | -1; children: React.ReactNode }> = ({ start, duration = 8, direction = -1, children }) => {
  const frame = useCurrentFrame()
  const t = interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) })
  return (
    <AbsoluteFill style={{ transform: `translateX(${direction * t * 70}%)`, filter: `blur(${t * 40}px) brightness(${1 + t * 0.8})` }}>
      {children}
    </AbsoluteFill>
  )
}

export const WhipIn: React.FC<{ start: number; duration?: number; direction?: 1 | -1; children: React.ReactNode }> = ({ start, duration = 9, direction = -1, children }) => {
  const frame = useCurrentFrame()
  const t = interpolate(frame, [start, start + duration], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) })
  return (
    <AbsoluteFill style={{ transform: `translateX(${-direction * t * 60}%)`, filter: `blur(${t * 36}px) brightness(${1 + t * 0.6})` }}>
      {children}
    </AbsoluteFill>
  )
}

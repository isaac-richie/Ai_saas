import React from "react"
import { AbsoluteFill, Audio, Img, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { loadFont as loadSerif } from "@remotion/google-fonts/CormorantGaramond"
import { loadFont as loadSans } from "@remotion/google-fonts/Inter"
import type { Plan, Shot } from "./contract"
import { cameraAt } from "./moves"

const serif = loadSerif("normal", { weights: ["500", "600"], subsets: ["latin"] }).fontFamily
const sans = loadSans("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily

export type MotionAdProps = {
  plan: Plan
  /** @imageN → file (a path in public/ or a URL). */
  images: Record<string, string>
  logo?: string | null
  voice?: string | null
  /** Free tier: "Made with Visiowave" in the corner. */
  watermark?: boolean
  palette?: { ink: string; cream: string; gold: string }
}

export const PALETTE = { ink: "#10120f", cream: "#ebdfb8", gold: "#d5bf82" }
const TRANSITION_S = 0.5
const src = (p: string) => (/^(https?:|data:|blob:)/.test(p) ? p : staticFile(p))
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const
const smooth = (x: number) => { const e = Math.min(1, Math.max(0, x)); return e * e * (3 - 2 * e) }

/** One shot's picture under its camera move. Progress keeps running through the transitions, so it never stops moving. */
const ShotPicture: React.FC<{ shot: Shot; image?: string; t: number; extra?: { scale?: number; x?: number; blur?: number; bright?: number }; dim?: number }> = ({ shot, image, t, extra = {}, dim = 1 }) => {
  const { width, height } = useVideoConfig()
  const from = shot.start_s - TRANSITION_S / 2
  const to = shot.end_s + TRANSITION_S / 2
  const cam = cameraAt(shot.move, (t - from) / (to - from))
  const scale = cam.scale * (extra.scale ?? 1)
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: PALETTE.ink }}>
      {image && (
        <Img
          src={src(image)}
          style={{
            position: "absolute", inset: 0, width, height, objectFit: "cover",
            transform: `translate(${(cam.x + (extra.x ?? 0)) * width}px, ${cam.y * height}px) scale(${scale}) rotate(${cam.rotate}deg)`,
            filter: `blur(${extra.blur ?? 0}px) brightness(${(extra.bright ?? 1) * dim})`,
          }}
        />
      )}
    </AbsoluteFill>
  )
}

/** A drifting golden haze: the brand accent as light, so a still image always has movement in it. */
const Haze: React.FC<{ t: number; seed: number; color: string }> = ({ t, seed, color }) => {
  const x = 20 + 60 * random(`hx${seed}`) + Math.sin(t * 0.6 + seed) * 8
  const y = 30 + 40 * random(`hy${seed}`) + Math.cos(t * 0.5 + seed) * 6
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", opacity: 0.32, pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: `radial-gradient(40% 50% at ${x}% ${y}%, ${color}, transparent 70%)`, filter: "blur(40px)" }} />
    </AbsoluteFill>
  )
}

/** Sentence-case line: each word fades up from blur, then lifts away before the transition. */
const Line: React.FC<{ text: string; start: number; end: number; t: number; vertical: boolean; cream: string }> = ({ text, start, end, t, vertical, cream }) => {
  const { width } = useVideoConfig()
  if (!text) return null
  const words = text.split(/\s+/)
  const out = smooth((t - (end - 0.32)) / 0.28)
  const size = vertical ? width * 0.085 : width * 0.046
  return (
    <div style={{
      position: "absolute", left: vertical ? "8%" : "7%", right: vertical ? "8%" : "40%", bottom: vertical ? "22%" : "15%",
      fontFamily: serif, fontWeight: 500, fontSize: size, lineHeight: 1.05, color: cream, letterSpacing: "-0.01em",
      textAlign: vertical ? "center" : "left", textShadow: "0 4px 30px rgba(0,0,0,0.55)",
      opacity: 1 - out, filter: `blur(${out * 10}px)`, transform: `translateY(${-out * 20}px)`,
    }}>
      {words.map((w, i) => {
        const p = smooth((t - start - 0.18 - i * 0.09) / 0.5)
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, filter: `blur(${(1 - p) * 14}px)`, transform: `translateY(${(1 - p) * 0.25}em)` }}>{w}</span>
      })}
    </div>
  )
}

const EndCard: React.FC<{ plan: Plan; shot: Shot; image?: string; logo?: string | null; t: number; palette: typeof PALETTE }> = ({ plan, shot, image, logo, t, palette }) => {
  const { width, height } = useVideoConfig()
  const vertical = height > width
  const local = t - shot.start_s
  const appear = smooth((local - 0.2) / 0.8)
  const sweep = (local - 1.0) / 0.9
  const unit = Math.min(width, height)
  return (
    <AbsoluteFill>
      <ShotPicture shot={shot} image={image} t={t} dim={1 - 0.45 * appear} extra={{ blur: 6 * appear }} />
      <AbsoluteFill style={{ background: `radial-gradient(60% 60% at 50% 50%, rgba(16,18,15,${0.2 + 0.45 * appear}), rgba(16,18,15,${0.55 + 0.3 * appear}))` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", opacity: appear, transform: `scale(${1.04 - 0.04 * appear})` }}>
        <div style={{ position: "relative", overflow: "hidden" }}>
          {logo
            ? <Img src={src(logo)} style={{ height: unit * (vertical ? 0.14 : 0.16), objectFit: "contain", filter: "drop-shadow(0 6px 30px rgba(0,0,0,0.6))" }} />
            : <div style={{ fontFamily: serif, fontWeight: 600, fontSize: unit * 0.11, letterSpacing: "0.12em", color: palette.cream }}>{plan.end_card.brand}</div>}
          {sweep > 0 && sweep < 1 && (
            <div style={{ position: "absolute", top: "-20%", bottom: "-20%", left: `${-40 + sweep * 180}%`, width: "30%", transform: "skewX(-18deg)", background: "linear-gradient(90deg, transparent, rgba(255,244,214,0.55), transparent)", mixBlendMode: "screen" }} />
          )}
        </div>
        {plan.end_card.line && <div style={{ marginTop: unit * 0.035, fontFamily: serif, fontStyle: "italic", fontSize: unit * 0.045, color: palette.gold, opacity: smooth((local - 0.6) / 0.6) }}>{plan.end_card.line}</div>}
        {plan.end_card.url && <div style={{ marginTop: unit * 0.03, fontFamily: sans, fontSize: unit * 0.024, letterSpacing: "0.22em", color: palette.cream, opacity: smooth((local - 0.9) / 0.6) * 0.85 }}>{plan.end_card.url.toUpperCase()}</div>}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** The whole ad: shots in order, each turning into the next, the voice laid under, the finish on top. */
export const MotionAd: React.FC<MotionAdProps> = ({ plan, images, logo, voice, watermark, palette = PALETTE }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const t = frame / fps
  const vertical = height > width
  const shots = plan.shots
  const i = Math.max(0, shots.findIndex((s) => t < s.end_s))
  const shot = shots[i] ?? shots[shots.length - 1]
  const prev = shots[i - 1]
  const next = shots[i + 1]
  const img = (s?: Shot) => (s?.image_tag ? images[s.image_tag] : undefined)
  const isEnd = (s: Shot) => s.idx === shots.length

  // Inside a transition: near the end of this shot (into next) or the start (out of prev).
  const intoNext = next && shot.transition && t > shot.end_s - TRANSITION_S / 2
  const fromPrev = prev && prev.transition && t < shot.start_s + TRANSITION_S / 2
  const pair = intoNext ? { a: shot, b: next!, kind: shot.transition! } : fromPrev ? { a: prev!, b: shot, kind: prev!.transition! } : null
  const u = pair ? smooth((t - (pair.a.end_s - TRANSITION_S / 2)) / TRANSITION_S) : 0

  const picture = (s: Shot, extra?: Parameters<typeof ShotPicture>[0]["extra"]) =>
    isEnd(s) ? <EndCard plan={plan} shot={s} image={img(s)} logo={logo} t={t} palette={palette} /> : <ShotPicture shot={s} image={img(s)} t={t} extra={extra} />

  let content: React.ReactNode
  if (!pair) content = picture(shot)
  else if (pair.kind === "zoom_through") {
    content = (
      <>
        {picture(pair.a, { scale: 1 + 0.7 * u * u, blur: 22 * u, bright: 1 + 0.6 * u })}
        <AbsoluteFill style={{
          // A feathered iris: the next shot opens from the centre with a soft edge, not a hard circle.
          WebkitMaskImage: `radial-gradient(circle at 50% 50%, black ${Math.max(0, u * 95 - 14)}%, transparent ${u * 95}%)`,
          maskImage: `radial-gradient(circle at 50% 50%, black ${Math.max(0, u * 95 - 14)}%, transparent ${u * 95}%)`,
        }}>{picture(pair.b, { scale: 1.3 - 0.3 * u })}</AbsoluteFill>
      </>
    )
  } else if (pair.kind === "light_sweep") {
    const edge = 100 - u * 115
    content = (
      <>
        {picture(pair.a, { scale: 1 + 0.06 * u })}
        <AbsoluteFill style={{ clipPath: `polygon(${edge}% 0, 115% 0, 115% 100%, ${edge - 12}% 100%)` }}>{picture(pair.b)}</AbsoluteFill>
        <div style={{ position: "absolute", top: "-10%", bottom: "-10%", left: `${edge - 6}%`, width: "10%", transform: "skewX(-6.8deg)", background: `linear-gradient(90deg, transparent, rgba(255,240,205,0.75), transparent)`, mixBlendMode: "screen", filter: "blur(18px)" }} />
      </>
    )
  } else if (pair.kind === "whip") {
    content = (
      <>
        <AbsoluteFill style={{ transform: `translateX(${-u * 70}%)`, filter: `blur(${Math.sin(u * Math.PI) * 30}px)` }}>{picture(pair.a)}</AbsoluteFill>
        <AbsoluteFill style={{ transform: `translateX(${(1 - u) * 70}%)`, filter: `blur(${Math.sin(u * Math.PI) * 30}px)` }}>{picture(pair.b)}</AbsoluteFill>
      </>
    )
  } else {
    // Match cut: a hard cut on the boundary with a brief flash and a small snap-in.
    const after = t >= pair.a.end_s
    const flash = interpolate(Math.abs(t - pair.a.end_s), [0, 0.12], [0.55, 0], clamp)
    content = (
      <>
        {after ? picture(pair.b, { scale: 1 + 0.06 * (1 - u) }) : picture(pair.a)}
        <AbsoluteFill style={{ background: "rgb(255,246,226)", opacity: flash, mixBlendMode: "screen" }} />
      </>
    )
  }

  return (
    <AbsoluteFill style={{ backgroundColor: palette.ink }}>
      {content}
      <Haze t={t} seed={shot.idx} color={palette.gold} />
      {!isEnd(shot) && <Line key={shot.idx} text={shot.on_screen} start={shot.start_s} end={shot.end_s} t={t} vertical={vertical} cream={palette.cream} />}
      <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(120% 95% at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)` }} />
      {watermark && (
        <div style={{ position: "absolute", right: width * 0.025, bottom: height * 0.03, fontFamily: sans, fontSize: Math.min(width, height) * 0.02, letterSpacing: "0.12em", color: "rgba(235,223,184,0.7)" }}>
          MADE WITH VISIOWAVE
        </div>
      )}
      {voice && <Audio src={src(voice)} />}
    </AbsoluteFill>
  )
}

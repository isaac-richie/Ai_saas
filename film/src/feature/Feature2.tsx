import React from "react"
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, random, staticFile, useCurrentFrame } from "remotion"
import { Grade, Grain, LightLeak, Vignette, clamp, easeOut, tween } from "../fx"
import { color, font } from "../theme"

/**
 * Visiowave 40s brand film, master production doc v2. One man, live-action worlds,
 * an 8-style montage (1s each), his line in the studio, the end card on the final hit.
 * Shots: Nano Banana Pro keyframes from one character sheet, animated with Kling 3.0 pro.
 */
const s = (seconds: number) => Math.round(seconds * 30)
export const FEATURE2 = s(40)
const LOGO = 33.85 // the score's final hit

type Live = { clip: string; at: number; to: number; from?: number; push: [number, number]; x?: [number, number]; audio?: boolean }
const LIVE: Live[] = [
  { clip: "v2_k1_studio", at: 0, to: 5, push: [1.0, 1.06] },
  { clip: "v2_k2_desert", at: 5, to: 10, push: [1.04, 1.0], x: [-16, 16] },
  { clip: "v2_k3_snow", at: 10, to: 15, push: [1.08, 1.0] },
  { clip: "v2_k4_rain", at: 15, to: 20, push: [1.0, 1.08] },
  { clip: "v2_k13_return", at: 28, to: 33, push: [1.0, 1.04], audio: true },
]

const LiveShot: React.FC<{ shot: Live }> = ({ shot }) => {
  const frame = useCurrentFrame()
  const len = s(shot.to - shot.at)
  const scale = interpolate(frame, [0, len], shot.push, clamp)
  const x = interpolate(frame, [0, len], shot.x ?? [0, 0], clamp)
  return (
    <AbsoluteFill style={{ transform: `translateX(${x}px) scale(${scale})` }}>
      <OffthreadVideo src={staticFile(`film/${shot.clip}.mp4`)} startFrom={s(shot.from ?? 0)} muted={!shot.audio} volume={1} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  )
}

/* ---------------- The 8-style montage: each still moves the way its style moves. ---------------- */
type Style = "cyberpunk" | "origami" | "pixel" | "clay" | "ink" | "comic" | "3d" | "real"
const MONTAGE: { style: Style; file: string }[] = [
  { style: "cyberpunk", file: "v2_s1_cyberpunk" },
  { style: "origami", file: "v2_s2_origami" },
  { style: "pixel", file: "v2_s3_pixel" },
  { style: "clay", file: "v2_s4_clay" },
  { style: "ink", file: "v2_s5_ink" },
  { style: "comic", file: "v2_s6_comic" },
  { style: "3d", file: "v2_s7_3d" },
  { style: "real", file: "v2_s8_real" },
]

const StyleCut: React.FC<{ style: Style; file: string }> = ({ style, file }) => {
  const frame = useCurrentFrame()
  const t = frame / 30
  const img = (extra: React.CSSProperties = {}) => (
    <Img src={staticFile(`film/${file}.png`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...extra }} />
  )
  const enter = interpolate(frame, [0, 3], [1.06, 1], clamp)

  if (style === "cyberpunk") {
    // Neon glitch: RGB split and horizontal tears that settle.
    const amt = interpolate(frame, [0, 10, 30], [14, 3, 1], clamp) * (frame % 4 === 0 ? 1.8 : 1)
    const tear = frame % 5 === 0 ? (random(`t${frame}`) - 0.5) * 60 : 0
    return (
      <AbsoluteFill style={{ transform: `scale(${1.04 + t * 0.06})` }}>
        <AbsoluteFill style={{ transform: `translateX(${-amt}px)`, mixBlendMode: "screen", filter: "url(#none) saturate(1.4)", opacity: 0.9 }}>{img({ filter: "sepia(1) hue-rotate(250deg) saturate(4)" })}</AbsoluteFill>
        <AbsoluteFill style={{ transform: `translateX(${amt}px)`, mixBlendMode: "screen", opacity: 0.85 }}>{img({ filter: "sepia(1) hue-rotate(140deg) saturate(4)" })}</AbsoluteFill>
        <AbsoluteFill style={{ clipPath: "inset(42% 0 48% 0)", transform: `translateX(${tear}px)` }}>{img()}</AbsoluteFill>
      </AbsoluteFill>
    )
  }
  if (style === "origami") {
    // A folded-paper head tilt.
    const ry = tween(frame, [0, 30], [-9, 6], easeOut)
    const rz = tween(frame, [0, 30], [2, -1.5], easeOut)
    return <AbsoluteFill style={{ perspective: 1600 }}><AbsoluteFill style={{ transform: `rotateY(${ry}deg) rotateZ(${rz}deg) scale(${1.08 * enter})` }}>{img()}</AbsoluteFill></AbsoluteFill>
  }
  if (style === "pixel") {
    // Arcade sprite idle pulse: stepped zoom on the beat, crisp pixels.
    const step = Math.floor(frame / 7) % 2
    return <AbsoluteFill style={{ transform: `scale(${step ? 1.1 : 1.04})`, imageRendering: "pixelated" }}>{img({ imageRendering: "pixelated" })}</AbsoluteFill>
  }
  if (style === "clay") {
    // Stop-motion: 12 fps holds with tiny hand-moved offsets.
    const held = Math.floor(frame / 2.5)
    const dx = (random(`cx${held}`) - 0.5) * 8
    const dy = (random(`cy${held}`) - 0.5) * 6
    const rot = (random(`cr${held}`) - 0.5) * 0.8
    return <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${1.05 + held * 0.004})` }}>{img()}</AbsoluteFill>
  }
  if (style === "ink") {
    // Hand-drawn boil: lines wobble a few pixels at 8 fps.
    const held = Math.floor(frame / 4)
    const dx = (random(`ix${held}`) - 0.5) * 3
    const dy = (random(`iy${held}`) - 0.5) * 3
    return <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) scale(${1.04 + held * 0.005})`, filter: `contrast(${1.05 + 0.05 * (held % 2)})` }}>{img()}</AbsoluteFill>
  }
  if (style === "comic") {
    // Halftone punch-in on his face (frames out the speech bubble).
    const z = tween(frame, [0, 12], [1.25, 1.45], easeOut)
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: "72% 38%" }}>{img()}</AbsoluteFill>
        <AbsoluteFill style={{ mixBlendMode: "multiply", opacity: interpolate(frame, [0, 6, 30], [0.55, 0.25, 0.15], clamp), backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.85) 1.6px, transparent 1.8px)", backgroundSize: `${interpolate(frame, [0, 12], [26, 9], clamp)}px ${interpolate(frame, [0, 12], [26, 9], clamp)}px` }} />
      </AbsoluteFill>
    )
  }
  if (style === "3d") {
    // Animated-feature lighting shimmer sweeping across.
    const sweep = interpolate(frame, [0, 30], [-40, 140], clamp)
    return (
      <AbsoluteFill style={{ transform: `scale(${1.04 + t * 0.05})` }}>
        {img()}
        <AbsoluteFill style={{ mixBlendMode: "screen", background: `linear-gradient(105deg, transparent ${sweep - 25}%, rgba(255,230,180,0.45) ${sweep}%, transparent ${sweep + 25}%)` }} />
      </AbsoluteFill>
    )
  }
  // Photoreal return: a hard snap with a shutter flash.
  const flash = interpolate(frame, [0, 2, 8], [0.85, 0.5, 0], clamp)
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${1.02 + t * 0.04})` }}>{img()}</AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
    </AbsoluteFill>
  )
}

/* ---------------- End card ---------------- */
const EndCard: React.FC = () => {
  const frame = useCurrentFrame()
  const mark = tween(frame, [0, 16], [0, 1], easeOut)
  const glow = 0.6 + 0.25 * Math.sin(frame / 8)
  const line = interpolate(frame, [22, 40], [0, 1], clamp)
  const url = interpolate(frame, [48, 64], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink, alignItems: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(36% 40% at 50% 40%, rgba(120,140,255,0.10), transparent 70%)", opacity: mark }} />
      <div style={{ position: "absolute", top: 230, width: 210, height: 210, opacity: mark, transform: `scale(${1.25 - 0.25 * mark})`, filter: `drop-shadow(0 0 ${32 * glow}px rgba(120,140,255,0.55))` }}>
        <Img src={staticFile("visiowave-mark.png")} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", top: 520, fontFamily: font.serif, fontSize: 54, color: color.paper, opacity: line, transform: `translateY(${(1 - line) * 14}px)`, letterSpacing: "-0.02em" }}>
        Bringing imagination <em style={{ color: color.gold }}>to life.</em>
      </div>
      <div style={{ position: "absolute", top: 640, fontFamily: font.sans, fontSize: 22, letterSpacing: "0.42em", color: color.muted, opacity: url, marginRight: "-0.42em" }}>VISIOWAVEAI.COM</div>
    </AbsoluteFill>
  )
}

export const Feature2: React.FC = () => {
  const frame = useCurrentFrame()
  // Duck the score under his line (the clip speaks at ~2.5s–5s, film 30.5s–33s).
  const musicVolume = (f: number) => interpolate(f, [s(30.2), s(30.6), s(33.0), s(33.5)], [1, 0.32, 0.32, 1], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <Audio src={staticFile("film/v2_score_edit.m4a")} volume={musicVolume} />
      {LIVE.map((shot) => (
        <Sequence key={shot.clip} from={s(shot.at)} durationInFrames={s(shot.to - shot.at)}>
          <LiveShot shot={shot} />
        </Sequence>
      ))}
      {MONTAGE.map((cut, i) => (
        <Sequence key={cut.file} from={s(20 + i)} durationInFrames={s(1)}>
          <StyleCut style={cut.style} file={cut.file} />
        </Sequence>
      ))}
      {/* Hold his last frame until the logo hit. */}
      <Sequence from={s(33)} durationInFrames={s(LOGO) - s(33)}>
        <AbsoluteFill style={{ transform: `scale(${interpolate(frame, [s(33), s(LOGO)], [1.04, 1.06], clamp)})` }}>
          <Img src={staticFile("film/v2_k13_last.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={s(LOGO)}>
        <EndCard />
      </Sequence>

      {/* World changes breathe with a warm leak; the montage entry and the logo kick. */}
      {[5, 10, 15].map((t) => <LightLeak key={t} start={s(t) - 6} duration={14} />)}
      <AbsoluteFill style={{ backgroundColor: "#fff2d8", mixBlendMode: "screen", opacity: Math.max(
        interpolate(frame, [s(20) - 1, s(20), s(20) + 5], [0, 0.45, 0], clamp),
        interpolate(frame, [s(LOGO) - 1, s(LOGO), s(LOGO) + 6], [0, 0.5, 0], clamp),
      ) }} />
      <Grade />
      <Vignette strength={0.5} />
      <Grain opacity={0.065} />
      <AbsoluteFill style={{ pointerEvents: "none", boxShadow: `inset 0 ${Math.round(1080 * 0.06)}px 0 ${color.ink}, inset 0 -${Math.round(1080 * 0.06)}px 0 ${color.ink}`, opacity: frame < s(LOGO) ? 1 : 0 }} />
    </AbsoluteFill>
  )
}

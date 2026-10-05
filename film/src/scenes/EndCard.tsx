import React from "react"
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion"
import { Eyebrow, LightLeak, Sweep, Title, clamp, easeOut, tween } from "../fx"
import { BEAT, color, font } from "../theme"

/** Final beats: a fast montage of real outputs, then the sign-off. */
export const MONTAGE_CLIPS: { src: string; from: number }[] = [
  { src: "outputs/o01.mp4", from: 15 },
  { src: "outputs/o05.mp4", from: 20 },
  { src: "outputs/o07.mp4", from: 10 },
  { src: "outputs/o02.mp4", from: 30 },
  { src: "outputs/o06.mp4", from: 20 },
  { src: "outputs/o00.mp4", from: 20 },
]
export const MONTAGE = BEAT * 5
export const SIGN_OFF = BEAT * 6
export const END_CARD = MONTAGE + SIGN_OFF

/**
 * Most outputs are vertical ads, so the montage is a triptych: three 9:16 panels that
 * slide in on successive beats, then a second set replaces them.
 */
const Panel: React.FC<{ src: string; from: number; index: number; enter: number }> = ({ src, from, index, enter }) => {
  const frame = useCurrentFrame()
  const t = tween(frame, [enter, enter + 10], [0, 1], easeOut)
  const width = 1920 / 3
  return (
    <div style={{
      position: "absolute", top: 0, left: index * width, width, height: 1080, overflow: "hidden",
      clipPath: `inset(${(1 - t) * 50}% 0 ${(1 - t) * 50}% 0)`,
      borderLeft: index ? "2px solid #060706" : undefined,
    }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${1.14 - 0.08 * t})` }}>
        <OffthreadVideo src={staticFile(src)} startFrom={from} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    </div>
  )
}

const Montage: React.FC<{ clips: { src: string; from: number }[] }> = ({ clips }) => {
  const sets = [clips.slice(0, 3), clips.slice(3, 6)].filter((set) => set.length)
  const perSet = Math.floor(MONTAGE / Math.max(1, sets.length))
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      {sets.map((set, s) => (
        <Sequence key={s} from={s * perSet} durationInFrames={perSet}>
          {set.map((clip, i) => <Panel key={clip.src} src={clip.src} from={clip.from} index={i} enter={i * 4} />)}
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}

const SignOff: React.FC = () => {
  const frame = useCurrentFrame()
  const mark = tween(frame, [0, 26], [0, 1], easeOut)
  const glow = 0.55 + 0.25 * Math.sin(frame / 9)
  const button = { x: 960 - 130, y: 760, w: 260, h: 64, r: 999 }
  const buttonIn = tween(frame, [40, 58], [0, 1], easeOut)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink, alignItems: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(40% 45% at 50% 42%, rgba(217,192,138,0.10), transparent 70%)" }} />
      <div style={{
        position: "absolute", top: 170, width: 220, height: 220, opacity: mark,
        transform: `scale(${0.92 + 0.08 * mark})`,
        filter: `drop-shadow(0 0 ${28 * glow}px rgba(120,140,255,0.45))`,
        mixBlendMode: "screen",
      }}>
        <Img src={staticFile("visiowave-mark.png")} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", top: 410, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Eyebrow text="THE NEXT FRAME IS YOURS" start={10} style={{ marginBottom: 26, textAlign: "center" }} />
        <Title start={16} stagger={10} size={104} align="center" lines={[{ text: "Make something" }, { text: "worth feeling.", italic: true, gold: true }]} />
      </div>
      <div style={{
        position: "absolute", left: button.x, top: button.y, width: button.w, height: button.h, borderRadius: 999,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        background: `linear-gradient(90deg, ${color.gold}, #e9d6a6)`, color: "#14110a",
        fontFamily: font.sans, fontSize: 22, fontWeight: 600, letterSpacing: "0.01em",
        opacity: buttonIn, transform: `translateY(${(1 - buttonIn) * 18}px)`,
        boxShadow: "0 18px 40px -18px rgba(217,192,138,0.9)",
      }}>
        Enter the studio <span style={{ fontSize: 20 }}>↗</span>
      </div>
      <Sweep rect={button} start={64} duration={18} />
      <div style={{
        position: "absolute", top: 862, fontFamily: font.sans, fontSize: 20, letterSpacing: "0.32em", color: color.muted,
        opacity: interpolate(frame, [56, 72], [0, 1], clamp),
      }}>
        VISIOWAVEAI.COM
      </div>
    </AbsoluteFill>
  )
}

export const EndCard: React.FC<{ clips?: { src: string; from: number }[] }> = ({ clips = MONTAGE_CLIPS }) => {
  const frame = useCurrentFrame()
  const fadeOut = interpolate(frame, [END_CARD - 14, END_CARD], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink, opacity: fadeOut }}>
      <Sequence durationInFrames={MONTAGE}>
        <Montage clips={clips} />
      </Sequence>
      <Sequence from={MONTAGE} durationInFrames={SIGN_OFF}>
        <SignOff />
      </Sequence>
      <LightLeak start={MONTAGE - 8} duration={18} />
    </AbsoluteFill>
  )
}

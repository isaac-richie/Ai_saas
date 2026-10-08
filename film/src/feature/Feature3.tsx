import React from "react"
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion"
import { Grade, Grain, LightLeak, Vignette, clamp, easeOut, tween } from "../fx"
import { color, font } from "../theme"

/**
 * Visiowave 72s master cut (72s production plan). Every shot is Seedance 2 image-to-video
 * with its own native sound design; an original score runs underneath and ducks for his line.
 */
const s = (seconds: number) => Math.round(seconds * 30)
export const FEATURE3 = s(72)
const LOGO = 66.3 // the score's final swell

type Shot = { clip: string; at: number; to: number; push?: [number, number]; sfx?: number; whipIn?: boolean }
const SHOTS: Shot[] = [
  { clip: "sd01_studio", at: 0, to: 5, push: [1.0, 1.03], sfx: 1.0 },
  { clip: "sd02_desert", at: 5, to: 10, sfx: 1.0 },
  { clip: "sd03_snow", at: 10, to: 15, sfx: 1.0 },
  { clip: "sd04_rain", at: 15, to: 20, sfx: 1.0 },
  { clip: "sd05_cyber", at: 20, to: 25, sfx: 1.0 },
  { clip: "sd06_origami", at: 25, to: 30, sfx: 1.0 },
  { clip: "sd07_pixel", at: 30, to: 35, sfx: 1.0 },
  { clip: "sd08_clay", at: 35, to: 40, sfx: 1.0 },
  { clip: "sd09_ink", at: 40, to: 45, sfx: 1.0 },
  { clip: "sd10_comic", at: 45, to: 50, sfx: 1.0 },
  { clip: "sd11_bbq", at: 50, to: 55, sfx: 1.0 },
  { clip: "sd12_return", at: 55, to: 60, push: [1.04, 1.0], sfx: 1.0, whipIn: true },
  { clip: "sd13_dialogue", at: 60, to: 66, push: [1.0, 1.04], sfx: 1.0 },
]

const ShotClip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const frame = useCurrentFrame()
  const len = s(shot.to - shot.at)
  const [p0, p1] = shot.push ?? [1.02, 1.06]
  const scale = interpolate(frame, [0, len], [p0, p1], clamp)
  // Whip-pan snap into the studio: motion blur and lateral travel that settle in 8 frames.
  const whip = shot.whipIn ? interpolate(frame, [0, 8], [1, 0], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) }) : 0
  // Native sound fades in and out over a few frames so cuts never click.
  const volume = (f: number) => (shot.sfx ?? 0.8) * interpolate(f, [0, 3, len - 4, len], [0, 1, 1, 0], clamp)
  return (
    <AbsoluteFill style={{ transform: `translateX(${whip * -260}px) scale(${scale})`, filter: whip ? `blur(${whip * 30}px)` : undefined }}>
      <OffthreadVideo src={staticFile(`film/${shot.clip}.mp4`)} volume={volume} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  )
}

const EndCard: React.FC = () => {
  const frame = useCurrentFrame()
  const mark = tween(frame, [0, 18], [0, 1], easeOut)
  const glow = 0.6 + 0.25 * Math.sin(frame / 8)
  const line = interpolate(frame, [24, 44], [0, 1], clamp)
  const url = interpolate(frame, [56, 74], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink, alignItems: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(36% 40% at 50% 40%, rgba(120,140,255,0.11), transparent 70%)", opacity: mark }} />
      <div style={{ position: "absolute", top: 230, width: 210, height: 210, opacity: mark, transform: `scale(${1.25 - 0.25 * mark})`, filter: `drop-shadow(0 0 ${32 * glow}px rgba(120,140,255,0.55))` }}>
        <Img src={staticFile("visiowave-mark.png")} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", top: 520, fontFamily: font.serif, fontSize: 56, color: color.paper, opacity: line, transform: `translateY(${(1 - line) * 14}px)`, letterSpacing: "-0.02em" }}>
        Bringing imagination <em style={{ color: color.gold }}>to life.</em>
      </div>
      <div style={{ position: "absolute", top: 642, fontFamily: font.sans, fontSize: 22, letterSpacing: "0.42em", color: color.muted, opacity: url, marginRight: "-0.42em" }}>VISIOWAVEAI.COM</div>
    </AbsoluteFill>
  )
}

export const Feature3: React.FC = () => {
  const frame = useCurrentFrame()
  // Score sits under the native sound; it ducks for his line, then returns for the logo swell.
  const music = (f: number) => 0.5 * interpolate(f, [s(59.6), s(60.2), s(65.8), s(66.3)], [1, 0.28, 0.28, 1.25], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <Audio src={staticFile("film/v3_score_edit.m4a")} volume={music} />
      {SHOTS.map((shot) => (
        <Sequence key={shot.clip} from={s(shot.at)} durationInFrames={s(shot.to - shot.at)}>
          <ShotClip shot={shot} />
        </Sequence>
      ))}
      {/* Hold his last frame for the beat before the swell. */}
      <Sequence from={s(66)} durationInFrames={s(LOGO) - s(66)}>
        <Img src={staticFile("film/sd13_last.png")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.04)" }} />
      </Sequence>
      <Sequence from={s(LOGO)}>
        <EndCard />
      </Sequence>

      {/* Light leaks between worlds; a shutter flash on the snap back to the studio; a kick on the logo. */}
      {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((t) => <LightLeak key={t} start={s(t) - 6} duration={14} />)}
      <AbsoluteFill style={{ backgroundColor: "#fff", mixBlendMode: "screen", opacity: Math.max(
        interpolate(frame, [s(55) - 1, s(55), s(55) + 6], [0, 0.7, 0], clamp),
        interpolate(frame, [s(LOGO) - 1, s(LOGO), s(LOGO) + 7], [0, 0.45, 0], clamp),
      ) }} />
      <Grade />
      <Vignette strength={0.5} />
      <Grain opacity={0.06} />
      <AbsoluteFill style={{ pointerEvents: "none", boxShadow: `inset 0 ${Math.round(1080 * 0.06)}px 0 ${color.ink}, inset 0 -${Math.round(1080 * 0.06)}px 0 ${color.ink}`, opacity: frame < s(LOGO) ? 1 : 0 }} />
    </AbsoluteFill>
  )
}

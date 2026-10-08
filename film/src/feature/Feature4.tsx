import React from "react"
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion"
import { Grade, Grain, LightLeak, Title, Vignette, clamp, easeOut, tween } from "../fx"
import { color, font } from "../theme"

/**
 * Director's cut (~45s). The Seedance shots edited in the "Every Frame" manner: each world named by
 * the prompt that made it, titles on the musical beats, cuts on the score. No rain street, no cyberpunk.
 * Score: v3 take 1, spliced at 29.93s (music 49.04s) so its breath sits under his line and its swell is the logo.
 */
const s = (seconds: number) => Math.round(seconds * 30)
const SPLICE = 29.93
const LOGO = 39.4
export const FEATURE4 = s(45.5)

type Shot = { clip: string; at: number; to: number; from: number; push?: [number, number]; x?: [number, number]; whipIn?: boolean; volume?: number }
const STYLE = (12.2 + 0) // style section starts here; six stories share 12.2s → 29.93s
const per = (SPLICE - STYLE) / 6
const SHOTS: Shot[] = [
  { clip: "sd01_studio", at: 0, to: 5, from: 0, push: [1.0, 1.04] },
  { clip: "sd02_desert", at: 5, to: 8.6, from: 0.5, push: [1.02, 1.08], x: [-10, 10] },
  { clip: "sd03_snow", at: 8.6, to: 12.2, from: 0.5, push: [1.08, 1.02] },
  { clip: "sd06_origami", at: STYLE, to: STYLE + per, from: 2.0 },
  { clip: "sd07_pixel", at: STYLE + per, to: STYLE + per * 2, from: 1.6 },
  { clip: "sd08_clay", at: STYLE + per * 2, to: STYLE + per * 3, from: 0.6 },
  { clip: "sd09_ink", at: STYLE + per * 3, to: STYLE + per * 4, from: 0.6 },
  { clip: "sd10_comic", at: STYLE + per * 4, to: STYLE + per * 5, from: 1.0 },
  { clip: "sd11_bbq", at: STYLE + per * 5, to: SPLICE, from: 2.0 },
  { clip: "sd12_return", at: SPLICE, to: 34.0, from: 0.4, push: [1.04, 1.0], whipIn: true },
  { clip: "sd13_dialogue", at: 34.0, to: 38.2, from: 1.8, push: [1.0, 1.04], volume: 1.0 },
]

const PROMPTS: { text: string; shot: string }[] = [
  { text: "a dune at golden hour, wind in his coat", shot: "sd02_desert" },
  { text: "alone across a field of snow", shot: "sd03_snow" },
  { text: "an origami park: “Create not Destroy”", shot: "sd06_origami" },
  { text: "an 8-bit detective in a gothic library", shot: "sd07_pixel" },
  { text: "a claymation walk into a British pub", shot: "sd08_clay" },
  { text: "an ink-sketch music video", shot: "sd09_ink" },
  { text: "a comic-book hero takes off", shot: "sd10_comic" },
  { text: "a Pixar-style family barbecue", shot: "sd11_bbq" },
]

const ShotClip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const frame = useCurrentFrame()
  const len = s(shot.to - shot.at)
  const scale = interpolate(frame, [0, len], shot.push ?? [1.03, 1.08], clamp)
  const x = interpolate(frame, [0, len], shot.x ?? [0, 0], clamp)
  const whip = shot.whipIn ? interpolate(frame, [0, 8], [1, 0], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) }) : 0
  const volume = (f: number) => (shot.volume ?? 0.75) * interpolate(f, [0, 3, len - 4, len], [0, 1, 1, 0], clamp)
  return (
    <AbsoluteFill style={{ transform: `translateX(${x + whip * -260}px) scale(${scale})`, filter: whip ? `blur(${whip * 30}px)` : undefined }}>
      <OffthreadVideo src={staticFile(`film/${shot.clip}.mp4`)} startFrom={s(shot.from)} volume={volume} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  )
}

/** The words that made the world on screen, typed in the lower left. */
const PromptLine: React.FC<{ text: string; length: number }> = ({ text, length }) => {
  const frame = useCurrentFrame()
  const chars = Math.round(interpolate(frame, [3, Math.min(length - 14, 3 + text.length * 0.9)], [0, text.length], clamp))
  const o = interpolate(frame, [0, 4, length - 6, length], [0, 1, 1, 0], clamp)
  return (
    <div style={{
      position: "absolute", left: 110, bottom: 128, opacity: o,
      fontFamily: "'SF Mono', Menlo, monospace", fontSize: 32, color: "rgba(246,241,229,0.96)",
      padding: "13px 22px 13px 18px", borderRadius: 14,
      background: "rgba(8,9,8,0.45)", backdropFilter: "blur(10px)", border: "1px solid rgba(217,192,138,0.22)",
    }}>
      <span style={{ color: color.gold, marginRight: 14 }}>›</span>
      {text.slice(0, chars)}
      <span style={{ opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0, color: color.gold }}>▍</span>
    </div>
  )
}

const EndCard: React.FC = () => {
  const frame = useCurrentFrame()
  const mark = tween(frame, [0, 18], [0, 1], easeOut)
  const glow = 0.6 + 0.25 * Math.sin(frame / 8)
  const line = interpolate(frame, [22, 40], [0, 1], clamp)
  const url = interpolate(frame, [52, 70], [0, 1], clamp)
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

export const Feature4: React.FC = () => {
  const frame = useCurrentFrame()
  const music = (f: number) => 0.6 * interpolate(f, [s(34.2), s(34.5), s(38.0), s(LOGO)], [1, 0.3, 0.3, 1.2], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <Audio src={staticFile("film/v4_score_edit.m4a")} volume={music} />
      {SHOTS.map((shot) => (
        <Sequence key={shot.clip} from={s(shot.at)} durationInFrames={s(shot.to - shot.at)}>
          <ShotClip shot={shot} />
        </Sequence>
      ))}
      {PROMPTS.map((p) => {
        const shot = SHOTS.find((x) => x.clip === p.shot)!
        return (
          <Sequence key={p.shot} from={s(shot.at)} durationInFrames={s(shot.to - shot.at)}>
            <PromptLine text={p.text} length={s(shot.to - shot.at)} />
          </Sequence>
        )
      })}

      {/* Opening line over the studio. */}
      <Sequence from={s(0.6)} durationInFrames={s(4.2)}>
        <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 0 130px 120px" }}>
          <Title start={4} out={s(4.2) - 12} size={64} lines={[{ text: "Every frame starts" }, { text: "with a feeling.", italic: true, gold: true }]} />
        </AbsoluteFill>
      </Sequence>
      {/* The thesis as we snap back to the studio. */}
      <Sequence from={s(SPLICE)} durationInFrames={s(34.0 - SPLICE)}>
        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 140, background: "linear-gradient(90deg, rgba(6,7,6,0.7), rgba(6,7,6,0.1) 60%)" }}>
          <Title start={6} stagger={22} size={132} out={s(34.0 - SPLICE) - 10} lines={[{ text: "Your imagination." }, { text: "In motion.", italic: true, gold: true }]} />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s(38.2)} durationInFrames={s(LOGO) - s(38.2)}>
        <Img src={staticFile("film/sd13_last.png")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.04)" }} />
      </Sequence>
      <Sequence from={s(LOGO)}>
        <EndCard />
      </Sequence>

      {[5, 8.6, 12.2].map((t) => <LightLeak key={t} start={s(t) - 6} duration={14} />)}
      <AbsoluteFill style={{ backgroundColor: "#fff", mixBlendMode: "screen", opacity: Math.max(
        interpolate(frame, [s(SPLICE) - 1, s(SPLICE), s(SPLICE) + 6], [0, 0.65, 0], clamp),
        interpolate(frame, [s(LOGO) - 1, s(LOGO), s(LOGO) + 7], [0, 0.45, 0], clamp),
      ) }} />
      <Grade />
      <Vignette strength={0.5} />
      <Grain opacity={0.06} />
      <AbsoluteFill style={{ pointerEvents: "none", boxShadow: `inset 0 ${Math.round(1080 * 0.06)}px 0 ${color.ink}, inset 0 -${Math.round(1080 * 0.06)}px 0 ${color.ink}`, opacity: frame < s(LOGO) ? 1 : 0 }} />
    </AbsoluteFill>
  )
}

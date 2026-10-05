import React from "react"
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion"
import { Grade, Grain, LightLeak, Title, Vignette, clamp, easeOut, tween } from "../fx"
import { color, font } from "../theme"

/**
 * "Every frame starts with a feeling": a 39s brand film, every shot generated with Visiowave's
 * engines (Nano Banana Pro keyframes from one character sheet, animated with Kling 3.0),
 * cut to an original 100 BPM score. One bar = 72 frames; the final hit lands at 35.35s.
 */
const s = (seconds: number) => Math.round(seconds * 30)
export const FEATURE = s(39)

type Shot = { clip: string; at: number; to: number; from: number; push?: [number, number]; x?: [number, number]; rate?: number }

// Times are seconds on the score; `from` is where in the 5s clip to start.
const SHOTS: Shot[] = [
  { clip: "k01_eye", at: 0, to: 2.6, from: 0.6, push: [1.12, 1.0], rate: 0.6 },
  { clip: "k02_studio", at: 2.6, to: 5.3, from: 0.4, push: [1.0, 1.08] },
  { clip: "k03_hands", at: 5.3, to: 7.7, from: 0.8, push: [1.05, 1.12] },
  { clip: "k04_noir", at: 7.7, to: 10.1, from: 1.0, push: [1.08, 1.0] },
  { clip: "k05_desert", at: 10.1, to: 12.5, from: 0.8, push: [1.0, 1.08], x: [20, -20] },
  { clip: "k06_underwater", at: 12.5, to: 14.9, from: 1.0, push: [1.1, 1.02] },
  { clip: "k07_neon", at: 14.9, to: 17.3, from: 1.2, push: [1.0, 1.1] },
  { clip: "k08_snow", at: 17.3, to: 19.7, from: 1.4, push: [1.12, 1.02] },
  // Rapid montage on the beat (0.6s each).
  { clip: "k09_desert_close", at: 19.7, to: 20.3, from: 2.0 },
  { clip: "k04_noir", at: 20.3, to: 20.9, from: 3.4 },
  { clip: "k06_underwater", at: 20.9, to: 21.5, from: 3.0 },
  { clip: "k07_neon", at: 21.5, to: 22.1, from: 3.4 },
  { clip: "k05_desert", at: 22.1, to: 22.7, from: 3.2 },
  { clip: "k03_hands", at: 22.7, to: 23.3, from: 2.6 },
  { clip: "k08_snow", at: 23.3, to: 23.9, from: 3.4 },
  { clip: "k01_eye", at: 23.9, to: 24.5, from: 3.0 },
  // Climax after the breakdown: longer, bigger moments.
  { clip: "k09_desert_close", at: 26.9, to: 28.1, from: 0.6, push: [1.04, 1.12], rate: 0.75 },
  { clip: "k06_underwater", at: 28.1, to: 29.3, from: 2.2, push: [1.12, 1.04] },
  { clip: "k07_neon", at: 29.3, to: 30.5, from: 2.4, push: [1.06, 1.14] },
  { clip: "k04_noir", at: 30.5, to: 31.7, from: 2.6, push: [1.1, 1.0] },
  { clip: "k10_return", at: 31.7, to: 35.35, from: 0.4, push: [1.02, 1.12], rate: 0.8 },
]

/** The sentence that "made" each world, typed like a prompt. */
const PROMPTS: { text: string; at: number; to: number }[] = [
  { text: "a rain-soaked street at midnight", at: 7.8, to: 10.0 },
  { text: "a dune at golden hour, wind in her coat", at: 10.2, to: 12.4 },
  { text: "an underwater ballroom, chandeliers drifting", at: 12.6, to: 14.8 },
  { text: "a rooftop above a neon city", at: 15.0, to: 17.2 },
  { text: "alone in a field of snow", at: 17.4, to: 19.6 },
]

/** Keyframes not yet animated (out of credits): shown as living stills. Delete a name once its .mp4 exists. */
const STILLS = new Set(["k07_neon"])

/** Light trails crossing the frame, so a still city reads as alive. */
const NeonStreaks: React.FC<{ length: number; seed: number }> = ({ length, seed }) => {
  const frame = useCurrentFrame()
  const trails = [
    { y: 300, h: 3, speed: 1.0, hue: "255,60,120", delay: 0 },
    { y: 345, h: 2, speed: 1.4, hue: "60,220,255", delay: 10 },
    { y: 270, h: 2, speed: 0.8, hue: "255,90,90", delay: 22 },
  ]
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none" }}>
      {trails.map((t, i) => {
        const p = ((frame + t.delay + seed * 7) * t.speed * 48) % 3400 - 900
        return <div key={i} style={{ position: "absolute", top: t.y, left: p, width: 760, height: t.h, borderRadius: 4, background: `linear-gradient(90deg, transparent, rgba(${t.hue},0.95), rgba(255,255,255,0.9))`, filter: "blur(1.5px)", opacity: interpolate(frame, [0, 4, length - 4, length], [0, 1, 1, 0], clamp) }} />
      })}
      <AbsoluteFill style={{ background: "radial-gradient(40% 30% at 70% 30%, rgba(255,40,140,0.10), transparent 70%)", opacity: 0.6 + 0.4 * Math.sin(frame / 3) }} />
    </AbsoluteFill>
  )
}

const ShotClip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const frame = useCurrentFrame()
  const len = s(shot.to - shot.at)
  const [p0, p1] = shot.push ?? [1.06, 1.06]
  const [x0, x1] = shot.x ?? [0, 0]
  const scale = interpolate(frame, [0, len], [p0, p1], clamp)
  const x = interpolate(frame, [0, len], [x0, x1], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <AbsoluteFill style={{ transform: `translateX(${x}px) scale(${scale})` }}>
        {STILLS.has(shot.clip) ? (
          <Img src={staticFile(`film/${shot.clip}.png`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <OffthreadVideo src={staticFile(`film/${shot.clip}.mp4`)} startFrom={s(shot.from)} playbackRate={shot.rate ?? 1} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </AbsoluteFill>
      {STILLS.has(shot.clip) ? <NeonStreaks length={len} seed={shot.at} /> : null}
    </AbsoluteFill>
  )
}

/** A typed prompt line, lower left: the words that made the world on screen. */
const PromptLine: React.FC<{ text: string; length: number }> = ({ text, length }) => {
  const frame = useCurrentFrame()
  const chars = Math.round(interpolate(frame, [2, Math.min(length - 12, 2 + text.length * 1.1)], [0, text.length], clamp))
  const o = interpolate(frame, [0, 4, length - 6, length], [0, 1, 1, 0], clamp)
  const caret = Math.floor(frame / 8) % 2 === 0
  return (
    <div style={{
      position: "absolute", left: 110, bottom: 128, opacity: o,
      fontFamily: "'SF Mono', Menlo, monospace", fontSize: 34, color: "rgba(246,241,229,0.96)", letterSpacing: "0.005em",
      padding: "14px 22px 14px 18px", borderRadius: 14,
      background: "rgba(8,9,8,0.42)", backdropFilter: "blur(10px)", border: "1px solid rgba(217,192,138,0.22)",
      textShadow: "0 1px 10px rgba(0,0,0,0.5)",
    }}>
      <span style={{ color: color.gold, marginRight: 14 }}>›</span>
      {text.slice(0, chars)}
      <span style={{ opacity: caret ? 1 : 0, color: color.gold }}>▍</span>
    </div>
  )
}

/** End card: the mark lands on the final hit. */
const EndCard: React.FC = () => {
  const frame = useCurrentFrame()
  const mark = tween(frame, [0, 18], [0, 1], easeOut)
  const glow = 0.6 + 0.25 * Math.sin(frame / 8)
  const tag = interpolate(frame, [40, 60], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink, alignItems: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(38% 42% at 50% 40%, rgba(217,192,138,0.12), transparent 70%)", opacity: mark }} />
      <div style={{ position: "absolute", top: 206, width: 200, height: 200, opacity: mark, transform: `scale(${1.25 - 0.25 * mark})`, filter: `drop-shadow(0 0 ${30 * glow}px rgba(120,140,255,0.5))` }}>
        <Img src={staticFile("visiowave-mark.png")} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", top: 440, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: font.sans, fontSize: 30, letterSpacing: "0.5em", color: color.paper, opacity: mark, marginRight: "-0.5em" }}>VISIOWAVE</div>
        <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 26, color: color.gold, opacity: mark, marginTop: 8 }}>Studios</div>
      </div>
      <div style={{ position: "absolute", top: 640, display: "flex", flexDirection: "column", alignItems: "center", opacity: tag }}>
        <div style={{ fontFamily: font.serif, fontSize: 40, color: color.paper }}>Make something <em style={{ color: color.gold }}>worth feeling.</em></div>
        <div style={{ marginTop: 34, fontFamily: font.sans, fontSize: 20, letterSpacing: "0.32em", color: color.muted }}>VISIOWAVEAI.COM</div>
      </div>
    </AbsoluteFill>
  )
}

export const Feature: React.FC = () => {
  const frame = useCurrentFrame()
  // Breakdown (24.5s–26.9s): black, the line "Your imagination." in silence, "In motion." on the re-entry.
  const breakdown = frame >= s(24.5) && frame < s(26.9)
  const flash = (at: number) => interpolate(frame, [s(at) - 1, s(at), s(at) + 5], [0, 0.5, 0], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <Audio src={staticFile("film/score_edit.m4a")} />
      {SHOTS.map((shot, i) => (
        <Sequence key={i} from={s(shot.at)} durationInFrames={s(shot.to - shot.at)}>
          <ShotClip shot={shot} />
        </Sequence>
      ))}
      {PROMPTS.map((p, i) => (
        <Sequence key={`p${i}`} from={s(p.at)} durationInFrames={s(p.to - p.at)}>
          <PromptLine text={p.text} length={s(p.to - p.at)} />
        </Sequence>
      ))}

      {/* Opening line over the eye and studio. */}
      <Sequence from={s(0.5)} durationInFrames={s(4.6)}>
        <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 0 120px 120px" }}>
          <Title start={4} out={s(4.6) - 14} size={64} lines={[{ text: "Every frame starts" }, { text: "with a feeling.", italic: true, gold: true }]} />
        </AbsoluteFill>
      </Sequence>

      {breakdown ? <AbsoluteFill style={{ backgroundColor: color.ink }} /> : null}
      {/* "Your imagination." in the silence; "In motion." lands on the re-entry over the climax. */}
      <Sequence from={s(24.5)} durationInFrames={s(28.1 - 24.5)}>
        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 160 }}>
          <Title start={6} size={150} stagger={s(2.4) - 6} out={s(28.1 - 24.5) - 10} lines={[{ text: "Your imagination." }, { text: "In motion.", italic: true, gold: true }]} />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s(35.35)}>
        <EndCard />
      </Sequence>

      {/* Hits: exposure kicks on the big cuts, light leaks on world changes. */}
      <AbsoluteFill style={{ backgroundColor: "#fff2d8", mixBlendMode: "screen", opacity: Math.max(flash(5.3), flash(26.9), flash(35.35)) }} />
      {[7.7, 10.1, 12.5, 14.9, 17.3].map((t) => <LightLeak key={t} start={s(t) - 6} duration={14} />)}
      <Grade />
      <Vignette strength={0.55} />
      <Grain opacity={0.07} />
      {/* Letterbox for the scope feel. */}
      <AbsoluteFill style={{ pointerEvents: "none", boxShadow: `inset 0 ${Math.round(1080 * 0.06)}px 0 ${color.ink}, inset 0 -${Math.round(1080 * 0.06)}px 0 ${color.ink}`, opacity: frame < s(35.35) ? 1 : 0 }} />
    </AbsoluteFill>
  )
}

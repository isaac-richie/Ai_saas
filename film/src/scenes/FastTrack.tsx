import React from "react"
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion"
import layout from "../../public/captures/fast-track.json"
import { Cursor, Focus, LightLeak, Sweep, Title, clamp, easeOut, tween } from "../fx"
import { Plate, pageToFrame, useShot } from "../plate"
import { BEAT, color } from "../theme"

/** Element rects in plate-local px (the plate image starts at page y = plate.y). */
const P = layout.plate
const local = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y - P.y, w: r.w, h: r.h })
const prompt = local(layout.prompt)
const golden = local(layout.goldenHour)
const neon = local(layout.neonDrive)
const generate = local(layout.generate)
const monitor = local(layout.monitor)
const PAGE = { width: 1920, height: P.h }
const center = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

const StudioPlate: React.FC<{ shot: { cx: number; cy: number; scale: number }; children?: React.ReactNode }> = ({ shot, children }) => (
  <Plate src="captures/ft-plate.png" width={1920} height={P.h} shot={shot}>{children}</Plate>
)

/** Lower-left chapter line, e.g. "Describe it." */
export const Chapter: React.FC<{ text: string; start: number; out?: number }> = ({ text, start, out }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill style={{ background: "linear-gradient(0deg, rgba(6,7,6,0.82) 0%, rgba(6,7,6,0.0) 34%)" }} />
    <div style={{ position: "absolute", left: 120, bottom: 96 }}>
      <Title start={start} out={out} size={96} lines={[{ text, italic: true, gold: false }]} />
    </div>
  </AbsoluteFill>
)

/* ------------------------------------------------------------------ */
/* Describe it: the prompt types itself, the camera cranes to the look */
/* ------------------------------------------------------------------ */
export const DESCRIBE = BEAT * 6

export const Describe: React.FC = () => {
  const frame = useCurrentFrame()
  const p = center(prompt)
  const g = center(golden)
  const shot = useShot([
    { at: 0, cx: p.x + 120, cy: p.y + 10, scale: 2.6 },
    { at: 50, cx: p.x + 140, cy: p.y + 30, scale: 2.35 },
    { at: 78, cx: g.x - 40, cy: g.y - 30, scale: 2.2 },
    { at: DESCRIBE, cx: g.x, cy: g.y, scale: 2.6 },
  ], PAGE)
  // Six captured stages of the real prompt box, swapped like keystrokes.
  const stage = Math.min(layout.typing.length - 1, Math.max(-1, Math.floor((frame - 8) / 7)))
  const typingSrc = stage >= 0 ? layout.typing[stage].src : null
  const selected = frame >= 92
  const goldFrame = pageToFrame(shot, golden.x, golden.y)
  const goldRect = { x: goldFrame.x, y: goldFrame.y, w: golden.w * shot.scale, h: golden.h * shot.scale, r: 18 * shot.scale / 2 }
  const cursorTarget = pageToFrame(shot, g.x + 10, g.y - 10)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <Focus rect={goldRect} amount={interpolate(frame, [70, 86], [0, 0.7], clamp)}>
        <StudioPlate shot={shot}>
          {typingSrc ? (
            <Img src={staticFile(typingSrc)} style={{ position: "absolute", left: prompt.x - 4, top: prompt.y - 4, width: prompt.w + 8, height: prompt.h + 8 }} />
          ) : null}
          {selected ? (
            <Img src={staticFile("captures/ft-golden-selected.png")} style={{ position: "absolute", left: golden.x - 6, top: golden.y - 6, width: golden.w + 12, height: golden.h + 12 }} />
          ) : null}
        </StudioPlate>
      </Focus>
      <Sweep rect={goldRect} start={92} duration={14} />
      <Cursor appear={66} path={[{ at: 66, x: 1500, y: 860 }, { at: 88, x: cursorTarget.x, y: cursorTarget.y }, { at: DESCRIBE, x: cursorTarget.x, y: cursorTarget.y }]} clicks={[90]} />
      <Chapter text="Describe it." start={10} out={DESCRIBE - 30} />
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------ */
/* Choose the look: a preset card becomes the footage it produces      */
/* ------------------------------------------------------------------ */
export const LOOK = BEAT * 6

/**
 * The card's image grows out of the card until it fills the frame, and becomes the footage
 * that preset produced. The UI behind holds still and dims, so the morph reads clearly.
 */
const CardToFootage: React.FC<{ card: { x: number; y: number; w: number; h: number }; video: string; imageHeight: number; start: number; length: number }> = ({ card, video, imageHeight, start, length }) => {
  const frame = useCurrentFrame()
  if (frame < start || frame >= start + length) return null
  const c = center(card)
  const shot = { cx: c.x, cy: c.y, scale: 2.6 + 0.15 * interpolate(frame, [start, start + length], [0, 1], clamp) }
  const from = pageToFrame(shot, card.x, card.y)
  const t = tween(frame, [start + 6, start + 22], [0, 1], easeOut)
  const rect = {
    x: from.x * (1 - t), y: from.y * (1 - t),
    w: card.w * shot.scale + (1920 - card.w * shot.scale) * t,
    h: imageHeight * shot.scale + (1080 - imageHeight * shot.scale) * t,
  }
  const radius = 18 * (1 - t)
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: `brightness(${1 - 0.6 * t}) blur(${t * 8}px)` }}>
        <StudioPlate shot={shot} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: radius, overflow: "hidden", boxShadow: `0 30px 80px -30px rgba(0,0,0,${0.8 * (1 - t)})` }}>
        <OffthreadVideo src={staticFile(video)} startFrom={0} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.08 - 0.05 * t})` }} />
      </div>
    </AbsoluteFill>
  )
}

export const Look: React.FC = () => {
  const half = Math.floor(LOOK / 2)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <CardToFootage card={golden} imageHeight={golden.h * 0.48} video="outputs/preset_style_golden_hour_film.mp4" start={0} length={half} />
      <CardToFootage card={neon} imageHeight={neon.h * 0.5} video="outputs/preset_style_cyberpunk_neon.mp4" start={half} length={LOOK - half} />
      <LightLeak start={half - 6} duration={14} />
      <Chapter text="Choose the look." start={14} out={LOOK - 18} />
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------ */
/* Bring it to life: press Generate, the take lands in the monitor     */
/* ------------------------------------------------------------------ */
export const GENERATE = BEAT * 6

export const Generate: React.FC = () => {
  const frame = useCurrentFrame()
  const b = center(generate)
  const m = center(monitor)
  const shot = useShot([
    { at: 0, cx: b.x + 60, cy: b.y - 120, scale: 2.2 },
    { at: 30, cx: b.x, cy: b.y - 40, scale: 2.5 },
    { at: 44, cx: b.x, cy: b.y - 40, scale: 2.5 },
    { at: 62, cx: m.x, cy: m.y, scale: 1.55 },
    { at: GENERATE, cx: m.x, cy: m.y, scale: 2.05 },
  ], PAGE)
  const btn = pageToFrame(shot, generate.x, generate.y)
  const btnRect = { x: btn.x, y: btn.y, w: generate.w * shot.scale, h: generate.h * shot.scale, r: 14 * shot.scale }
  const target = pageToFrame(shot, b.x + 20, b.y + 4)
  // The monitor shows a render shimmer, then the finished take.
  const rendering = frame >= 50 && frame < 70
  const take = interpolate(frame, [66, 76], [0, 1], clamp)
  const whip = interpolate(frame, [44, 52, 60], [0, 1, 0], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <AbsoluteFill style={{ filter: `blur(${whip * 22}px)` }}>
        <Focus rect={btnRect} amount={interpolate(frame, [10, 26, 40, 46], [0, 0.75, 0.75, 0], clamp)}>
          <StudioPlate shot={shot}>
            <div style={{ position: "absolute", left: monitor.x, top: monitor.y, width: monitor.w, height: monitor.h, borderRadius: 14, overflow: "hidden" }}>
              {rendering ? <div className="shimmer" style={{ position: "absolute", inset: 0, background: `linear-gradient(110deg, transparent 30%, rgba(217,192,138,${0.12 + 0.1 * Math.sin(frame / 3)}) 50%, transparent 70%)` }} /> : null}
              <div style={{ position: "absolute", inset: 0, opacity: take }}>
                <OffthreadVideo src={staticFile("outputs/preset_style_golden_hour_film.mp4")} startFrom={8} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            </div>
          </StudioPlate>
        </Focus>
        <Sweep rect={btnRect} start={36} duration={12} />
      </AbsoluteFill>
      <Cursor appear={6} vanish={50} path={[{ at: 6, x: 1300, y: 900 }, { at: 32, x: target.x, y: target.y }, { at: 50, x: target.x, y: target.y }]} clicks={[36]} />
      <Chapter text="Bring it to life." start={64} />
    </AbsoluteFill>
  )
}

import React from "react"
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion"
import layout from "../../public/captures/scene-builder.json"
import { Cursor, Focus, Sweep, clamp, easeOut, tween } from "../fx"
import { Plate, pageToFrame, useShot } from "../plate"
import { BEAT, color } from "../theme"
import { Chapter } from "./FastTrack"

/**
 * Direct every frame: two image options, pick one, approve it, then
 * "Animate this image" turns the approved still into the shot.
 */
export const SCENE_BUILDER = BEAT * 8

type R = { x: number; y: number; w: number; h: number }
const TOP = layout.choose.clip.y
const local = (r: R | null) => (r ? { x: r.x, y: r.y - TOP, w: r.w, h: r.h } : { x: 0, y: 0, w: 0, h: 0 })
const center = (r: R) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const optionA = local(layout.choose.optionA)
const optionB = local(layout.choose.optionB)
const approve = local(layout.choose.approve)
const animate = local(layout.next.animate)
const approved = local(layout.next.approvedImage)
const video = local(layout.video.video)
const PAGE = { width: 1920, height: layout.choose.clip.height }

const PICK = 34
const APPROVE = 58
const ANIMATE = 92
const VIDEO = 104

export const SceneBuilder: React.FC = () => {
  const frame = useCurrentFrame()
  const options = { x: (optionA.x + optionB.x + optionB.w) / 2, y: center(optionA).y }
  const shot = useShot([
    { at: 0, cx: options.x, cy: options.y - 40, scale: 1.55 },
    { at: APPROVE, cx: options.x, cy: options.y + 30, scale: 1.6 },
    { at: APPROVE + 12, cx: (approved.x + animate.x + animate.w) / 2, cy: center(approved).y, scale: 1.65 },
    { at: VIDEO, cx: (approved.x + animate.x + animate.w) / 2, cy: center(approved).y, scale: 1.7 },
    { at: SCENE_BUILDER, cx: center(video).x, cy: center(video).y, scale: 2.6 },
  ], PAGE)
  const plate = frame >= VIDEO ? "scene-video" : frame >= APPROVE + 6 ? "scene-next" : frame >= PICK ? "scene-chosen" : "scene-choose"
  const plateHeight = plate === "scene-video" ? layout.video.clip.height : plate === "scene-next" ? layout.next.clip.height : layout.choose.clip.height

  const rectOf = (r: R, radius = 12) => {
    const p = pageToFrame(shot, r.x, r.y)
    return { x: p.x, y: p.y, w: r.w * shot.scale, h: r.h * shot.scale, r: radius }
  }
  const at = (r: R, dx = 0, dy = 0) => pageToFrame(shot, center(r).x + dx, center(r).y + dy)
  const a = at(optionA, 30, 20)
  const ap = at(approve, 20, 4)
  const an = at(animate, 40, 4)
  const focusRect = frame < APPROVE ? rectOf(optionA) : rectOf(animate, 999)
  const focus = interpolate(frame, [14, 28, APPROVE - 4, APPROVE + 8, ANIMATE - 14, ANIMATE, ANIMATE + 8], [0, 0.55, 0.55, 0, 0, 0.65, 0], clamp)
  const videoIn = tween(frame, [VIDEO, VIDEO + 10], [0, 1], easeOut)

  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <Focus rect={focusRect} amount={focus}>
        <Plate src={`captures/${plate}.png`} width={1920} height={plateHeight} shot={shot}>
          {frame >= VIDEO ? (
            <div style={{ position: "absolute", left: video.x, top: video.y, width: video.w, height: video.h, overflow: "hidden", borderRadius: 12, opacity: videoIn, background: "#000" }}>
              <OffthreadVideo src={staticFile("outputs/o06.mp4")} startFrom={40} muted style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 12%" }} />
            </div>
          ) : null}
        </Plate>
      </Focus>
      <Sweep rect={rectOf(approve, 999)} start={APPROVE - 6} duration={12} />
      <Sweep rect={rectOf(animate, 999)} start={ANIMATE - 4} duration={14} />
      <Cursor
        appear={8}
        vanish={VIDEO}
        path={[
          { at: 8, x: 1500, y: 960 }, { at: PICK - 4, x: a.x, y: a.y },
          { at: APPROVE - 8, x: ap.x, y: ap.y }, { at: APPROVE + 6, x: ap.x, y: ap.y },
          { at: ANIMATE - 6, x: an.x, y: an.y }, { at: VIDEO, x: an.x, y: an.y },
        ]}
        clicks={[PICK - 2, APPROVE - 4, ANIMATE - 2]}
      />
      <Chapter text="Direct every frame." start={APPROVE + 14} out={SCENE_BUILDER - 12} />
    </AbsoluteFill>
  )
}

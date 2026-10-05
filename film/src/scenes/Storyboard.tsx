import React from "react"
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion"
import layout from "../../public/captures/storyboard.json"
import { Cursor, Focus, Sweep, clamp, easeOut, tween } from "../fx"
import { Plate, pageToFrame, useShot } from "../plate"
import { BEAT, color } from "../theme"
import { Chapter } from "./FastTrack"

/**
 * Continue the story: shot 1 is approved, "Continue to next shot" creates shot 2,
 * and shot 2 visibly starts from the exact last frame of shot 1.
 */
export const STORYBOARD = BEAT * 9

const TOP = layout.clipA.y
type R = { x: number; y: number; w: number; h: number }
const local = (r: R) => ({ x: r.x, y: r.y - TOP, w: r.w, h: r.h })
const video1 = local(layout.video1)
const cont = local(layout.continue)
const shot1 = local(layout.shot1)
const shot2 = local(layout.shot2)
const start2 = local(layout.start2)
const thumb2 = local(layout.thumb2)
const banner2 = local(layout.banner2)
const generate2 = local(layout.generate2)
const center = (r: R) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const PAGE = { width: 1920, height: layout.clipB.height }
const SWITCH = 62

export const Storyboard: React.FC = () => {
  const frame = useCurrentFrame()
  const s1 = center(shot1)
  const s2 = center(shot2)
  const c = center(cont)
  const shot = useShot([
    { at: 0, cx: s1.x, cy: s1.y - 60, scale: 1.55 },
    { at: 40, cx: c.x, cy: c.y - 120, scale: 1.85 },
    { at: SWITCH, cx: c.x, cy: c.y - 120, scale: 1.85 },
    { at: 92, cx: (s1.x + s2.x) / 2, cy: s2.y - 80, scale: 1.18 },
    { at: 128, cx: s2.x, cy: center(start2).y + 40, scale: 1.75 },
    { at: STORYBOARD, cx: s2.x, cy: center(generate2).y - 160, scale: 1.75 },
  ], PAGE)
  const after = frame >= SWITCH
  const btn = pageToFrame(shot, cont.x, cont.y)
  const btnRect = { x: btn.x, y: btn.y, w: cont.w * shot.scale, h: cont.h * shot.scale, r: 12 * shot.scale }
  const startIn = tween(frame, [SWITCH + 8, SWITCH + 24], [0, 1], easeOut)
  const bannerPos = pageToFrame(shot, banner2.x, banner2.y)
  const bannerRect = { x: bannerPos.x, y: bannerPos.y, w: banner2.w * shot.scale, h: banner2.h * shot.scale, r: 14 }
  const target = pageToFrame(shot, c.x + 40, c.y + 4)
  const genTarget = pageToFrame(shot, center(generate2).x + 30, center(generate2).y + 4)
  const flash = interpolate(frame, [SWITCH - 2, SWITCH + 1, SWITCH + 8], [0, 0.55, 0], clamp)

  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <Focus rect={btnRect} amount={interpolate(frame, [28, 44, 56, SWITCH], [0, 0.7, 0.7, 0], clamp)}>
        <Plate src={after ? "captures/sb-b.png" : "captures/sb-a.png"} width={1920} height={after ? layout.clipB.height : layout.clipA.height} shot={shot}>
          {/* Shot 1 plays the real take. */}
          <div style={{ position: "absolute", left: video1.x, top: video1.y, width: video1.w, height: video1.h, overflow: "hidden", borderRadius: 10 }}>
            <OffthreadVideo src={staticFile("outputs/o05.mp4")} startFrom={36} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          {after ? (
            <>
              {/* Shot 2 opens on shot 1's last frame. */}
              <div style={{ position: "absolute", left: start2.x, top: start2.y, width: start2.w, height: start2.h, overflow: "hidden", borderRadius: 10, opacity: startIn }}>
                <Img src={staticFile("captures/sb-endframe.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.06 - 0.06 * startIn})` }} />
              </div>
              <Img src={staticFile("captures/sb-endframe.jpg")} style={{ position: "absolute", left: thumb2.x, top: thumb2.y, width: thumb2.w, height: thumb2.h, objectFit: "cover", borderRadius: 4, opacity: startIn }} />
            </>
          ) : null}
        </Plate>
      </Focus>
      <Sweep rect={btnRect} start={50} duration={12} />
      {after ? <Sweep rect={bannerRect} start={SWITCH + 26} duration={16} strength={0.5} /> : null}
      <AbsoluteFill style={{ backgroundColor: color.paper, opacity: flash }} />
      <Cursor appear={20} vanish={SWITCH + 4} path={[{ at: 20, x: 1500, y: 820 }, { at: 48, x: target.x, y: target.y }, { at: SWITCH + 4, x: target.x, y: target.y }]} clicks={[54]} />
      <Cursor appear={130} path={[{ at: 130, x: 1580, y: 980 }, { at: 150, x: genTarget.x, y: genTarget.y }, { at: STORYBOARD, x: genTarget.x, y: genTarget.y }]} clicks={[156]} />
      <Chapter text="Continue the story." start={SWITCH + 10} out={STORYBOARD - 16} />
    </AbsoluteFill>
  )
}

import React from "react"
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion"
import layout from "../../public/captures/landing.json"
import { Cursor, Focus, LightLeak, Sweep, clamp, tween } from "../fx"
import { Plate, pageToFrame, useShot } from "../plate"
import { color } from "../theme"

/**
 * 0:04 The door. The camera pulls back out of the film into the website it lives on,
 * the cursor finds "Enter the studio", the button glints, and the camera rushes through it.
 */
export const DOOR = 108
/** Where the cold open left the landing film, so the footage continues unbroken. */
export const FILM_FRAME_IN = 45 + 126 * 0.5

const reel = layout.landingHero.reel
const button = layout.landingHero.enterStudio
const buttonCenter = { x: button.x + button.w / 2, y: button.y + button.h / 2 }

export const Door: React.FC = () => {
  const frame = useCurrentFrame()
  const shot = useShot([
    { at: 0, cx: reel.x + reel.w / 2, cy: reel.y + reel.h / 2, scale: 1080 / reel.h },
    { at: 40, cx: 960, cy: 560, scale: 1.02 },
    { at: 78, cx: 1020, cy: 520, scale: 1.08 },
    { at: 86, cx: buttonCenter.x, cy: buttonCenter.y, scale: 1.4 },
    { at: DOOR, cx: buttonCenter.x, cy: buttonCenter.y, scale: 9 },
  ], { width: 1920, height: 1400 })
  const btn = pageToFrame(shot, button.x, button.y)
  const btnRect = { x: btn.x, y: btn.y, w: button.w * shot.scale, h: button.h * shot.scale, r: 999 }
  const focus = interpolate(frame, [56, 72, 92, 100], [0, 0.85, 0.85, 0], clamp)
  // Cursor lives in frame space; its target tracks the button under the moving camera.
  const target = pageToFrame(shot, buttonCenter.x + 18, buttonCenter.y + 6)
  const rush = interpolate(frame, [88, DOOR], [0, 1], clamp)

  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      <AbsoluteFill style={{ filter: `blur(${rush * 18}px) brightness(${1 + rush * 1.6})` }}>
        <Focus rect={btnRect} amount={focus}>
          <Plate src="captures/landing-top.png" width={1920} height={1400} shot={shot}>
            <div style={{ position: "absolute", left: reel.x, top: reel.y, width: reel.w, height: reel.h, overflow: "hidden", borderRadius: 4 }}>
              <OffthreadVideo src={staticFile("landing.mp4")} startFrom={Math.round(FILM_FRAME_IN)} playbackRate={0.5} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </Plate>
        </Focus>
        <Sweep rect={btnRect} start={70} duration={14} />
      </AbsoluteFill>
      <Cursor
        appear={44}
        vanish={90}
        path={[{ at: 44, x: 1180, y: 700 }, { at: 74, x: target.x, y: target.y }, { at: 90, x: target.x, y: target.y }]}
        clicks={[80]}
      />
      {/* Warm flash as we pass through the button into the studio. */}
      <AbsoluteFill style={{ backgroundColor: color.paper, opacity: tween(frame, [96, DOOR], [0, 0.9]) }} />
      <LightLeak start={0} duration={16} />
    </AbsoluteFill>
  )
}

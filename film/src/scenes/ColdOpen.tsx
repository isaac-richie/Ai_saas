import React from "react"
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion"
import { Camera, Eyebrow, Title, clamp } from "../fx"
import { color } from "../theme"

/**
 * 0:00 Cold open. The landing film plays under a slow push-in; the brand line
 * lands on the first hits. Cuts straight into the same footage playing on the website.
 */
export const COLD_OPEN = 126

export const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame()
  const lift = interpolate(frame, [0, 14], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
        <AbsoluteFill style={{ opacity: lift }}>
          <Camera keys={[{ at: 0, scale: 1.18, x: 40 }, { at: COLD_OPEN, scale: 1.0, x: 0 }]}>
            {/* Half-speed on the headlights: one held, slow-motion shot instead of quick cuts. */}
            <OffthreadVideo src={staticFile("landing.mp4")} startFrom={45} playbackRate={0.5} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Camera>
          {/* Grade the plate down so the type reads like a title card. */}
          <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(6,7,6,0.88) 0%, rgba(6,7,6,0.45) 48%, rgba(6,7,6,0.1) 100%)" }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ padding: "0 140px", justifyContent: "center" }}>
          <Eyebrow text="AN INDEPENDENT VISION. AN ENTIRE STUDIO." start={8} style={{ marginBottom: 34 }} />
          <Title
            start={20}
            stagger={14}
            size={150}
            lines={[{ text: "Your imagination." }, { text: "In motion.", italic: true, gold: true }]}
          />
        </AbsoluteFill>
    </AbsoluteFill>
  )
}

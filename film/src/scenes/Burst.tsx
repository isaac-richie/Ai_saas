import React from "react"
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion"
import { Camera, clamp } from "../fx"
import { BEAT, color } from "../theme"

/** A fast widescreen burst of real outputs, cut on half-beats, before the vertical triptych. */
const CUTS = [
  { src: "outputs/o13.mp4", from: 62 },
  { src: "outputs/o14.mp4", from: 225 },
  { src: "outputs/preset_style_underwater_blue.mp4", from: 12 },
  { src: "outputs/o13.mp4", from: 108 },
]
const PER = BEAT / 2 + 4
export const BURST = PER * CUTS.length

const Cut: React.FC<{ src: string; from: number; index: number }> = ({ src, from, index }) => {
  const frame = useCurrentFrame()
  // Each cut lands with a short exposure kick, like a hard edit on a hit.
  const kick = interpolate(frame, [0, 3], [0.45, 0], clamp)
  return (
    <AbsoluteFill>
      <Camera keys={[{ at: 0, scale: 1.16, x: index % 2 ? -40 : 40 }, { at: PER, scale: 1.05, x: 0 }]}>
        <OffthreadVideo src={staticFile(src)} startFrom={from} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Camera>
      <AbsoluteFill style={{ backgroundColor: "#fff3dc", opacity: kick, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  )
}

export const Burst: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: color.ink }}>
    {CUTS.map((cut, i) => (
      <Sequence key={i} from={i * PER} durationInFrames={PER}>
        <Cut {...cut} index={i} />
      </Sequence>
    ))}
  </AbsoluteFill>
)

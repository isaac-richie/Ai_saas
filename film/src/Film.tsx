import React from "react"
import { AbsoluteFill, Sequence } from "remotion"
import { Grade, Grain, Vignette } from "./fx"
import { COLD_OPEN, ColdOpen } from "./scenes/ColdOpen"
import { DOOR, Door } from "./scenes/Door"
import { END_CARD, EndCard } from "./scenes/EndCard"
import { color } from "./theme"

/** Scene order and lengths. Each scene's frames are local, starting at 0. */
export const SCENES = [
  { id: "cold-open", length: COLD_OPEN, Component: ColdOpen },
  { id: "door", length: DOOR, Component: Door },
  { id: "end-card", length: END_CARD, Component: EndCard },
] as const

export const FILM_LENGTH = SCENES.reduce((sum, scene) => sum + scene.length, 0)

export const Film: React.FC = () => {
  let start = 0
  return (
    <AbsoluteFill style={{ backgroundColor: color.ink }}>
      {SCENES.map(({ id, length, Component }) => {
        const from = start
        start += length
        return (
          <Sequence key={id} from={from} durationInFrames={length} name={id}>
            <Component />
          </Sequence>
        )
      })}
      {/* One finish over everything so UI and footage feel like the same film. */}
      <Grade />
      <Vignette />
      <Grain />
    </AbsoluteFill>
  )
}

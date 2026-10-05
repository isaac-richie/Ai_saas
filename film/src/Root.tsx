import React from "react"
import { Composition } from "remotion"
import { FILM_LENGTH, Film } from "./Film"
import { FPS, HEIGHT, WIDTH } from "./theme"

export const Root: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={FILM_LENGTH} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
)

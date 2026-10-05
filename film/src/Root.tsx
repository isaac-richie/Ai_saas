import React from "react"
import { Composition } from "remotion"
import { FILM_LENGTH, Film } from "./Film"
import { FPS, HEIGHT, WIDTH } from "./theme"
import { FEATURE, Feature } from "./feature/Feature"

export const Root: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={FILM_LENGTH} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Feature" component={Feature} durationInFrames={FEATURE} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
)

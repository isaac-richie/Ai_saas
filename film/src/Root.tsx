import React from "react"
import { Composition } from "remotion"
import { FILM_LENGTH, Film } from "./Film"
import { FPS, HEIGHT, WIDTH } from "./theme"
import { FEATURE, Feature } from "./feature/Feature"
import { FEATURE2, Feature2 } from "./feature/Feature2"
import { FEATURE3, Feature3 } from "./feature/Feature3"

export const Root: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={FILM_LENGTH} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Feature" component={Feature} durationInFrames={FEATURE} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Feature2" component={Feature2} durationInFrames={FEATURE2} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Feature3" component={Feature3} durationInFrames={FEATURE3} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
)

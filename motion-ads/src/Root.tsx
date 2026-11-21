import React from "react"
import { Composition, type CalculateMetadataFunction } from "remotion"
import { MotionAd, type MotionAdProps } from "./MotionAd"
import { FPS } from "./timing"
import goldenMist from "./fixtures/golden-mist.json"
import type { Plan } from "./contract"

const defaults: MotionAdProps = {
  plan: goldenMist as Plan,
  images: Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`@image${n}`, `assets/image${n}.jpg`])),
  logo: "assets/logo.svg",
  voice: null,
  watermark: true,
}

// The ad is as long as its plan (which the voice length sets).
const metadata: CalculateMetadataFunction<MotionAdProps> = ({ props }) => ({ durationInFrames: Math.round(props.plan.total_s * FPS) })

export const Root: React.FC = () => (
  <>
    <Composition id="MotionAd" component={MotionAd} fps={FPS} width={1920} height={1080} durationInFrames={300} defaultProps={defaults} calculateMetadata={metadata} />
    <Composition id="MotionAdVertical" component={MotionAd} fps={FPS} width={1080} height={1920} durationInFrames={300} defaultProps={defaults} calculateMetadata={metadata} />
  </>
)

"use client"

import dynamic from "next/dynamic"
import { StageCanvas } from "./three/StageCanvas"

/**
 * Hero backdrop: a real soundstage photograph, graded down hard, with WebGL
 * atmospherics drifting over it.
 *
 * The photograph does the heavy lifting — actual gear, actual lighting, actual
 * depth. The canvas only adds motion the still can't have: dust in the air and
 * a slow drift that tracks the pointer. Three.js is code-split and never
 * requested on phones or under reduced-motion, so the plate is the whole
 * experience there and still looks finished.
 *
 * Swap the plate by changing PLATE. All ship in /public as jpg + webp:
 *   1 warm loft studio — camera on tripod, spotlight cone, light stands
 *   2 crew soundstage — jib arm, big soft light, silhouetted crew
 *   3 teal slider — operator + camera on a slider, cool haze
 *   4 red cyc studio — soft light + stand (L), cinema camera + tripod (R),
 *     crew mid-frame; clean upper negative space for the headline  ← hero
 *   5 DP silhouette — operator cradling a cinema rig in warm haze; most
 *     premium mood, subject sits centre so copy needs room around it
 */
const PLATE = 4

const HeroAtmosphere = dynamic(
  () => import("./three/HeroAtmosphere").then((m) => m.HeroAtmosphere),
  { ssr: false }
)

function StudioPlate() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <picture>
        <source srcSet={`/studio-plate-${PLATE}.webp`} type="image/webp" />
        <img
          src={`/studio-plate-${PLATE}.jpg`}
          alt=""
          // This is the largest element in the viewport — tell the browser so.
          fetchPriority="high"
          decoding="async"
          className="h-full w-full scale-105 object-cover object-center"
        />
      </picture>

      {/* ── Grade stack ──
          The plate is a real photo, so it arrives far too bright and too neutral
          to sit under white display type. These layers push it down to the
          page's black point and pull it toward the brand's teal/amber. */}

      {/* Global density — the single biggest lever on text legibility. Kept
          just light enough that the rig and crew still read as a real set. */}
      <div className="absolute inset-0 bg-[#050505]/58" />

      {/* Cool grade in the shadows, warm bloom where the practicals are. */}
      <div className="absolute inset-0 mix-blend-color bg-gradient-to-br from-cyan-500/25 via-transparent to-amber-400/15" />

      {/* Centre scrim — sits directly behind the headline so the copy always
          has contrast regardless of what the photograph is doing underneath. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(78% 62% at 50% 34%, rgba(5,5,5,0.75) 0%, rgba(5,5,5,0.35) 48%, rgba(5,5,5,0) 78%)",
        }}
      />

      {/* Top falloff so the navbar always has something dark to sit on. */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#050505] via-[#050505]/70 to-transparent" />

      {/* Bottom falloff — dissolves the plate into the page background so there
          is never a visible seam where the hero ends. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#050505] via-[#050505]/85 to-transparent" />
    </div>
  )
}

export function HeroSoundstage() {
  return (
    <StageCanvas
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[115vh]"
      fallback={<StudioPlate />}
    >
      <HeroAtmosphere />
    </StageCanvas>
  )
}

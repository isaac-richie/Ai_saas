// Animates keyframes with Kling 3.0 (image-to-video). Usage: node gen/04-animate.mjs [mode] [only...]
import { credits, host, task } from "./kie.mjs"
const mode = process.argv[2] || "pro"
const only = process.argv.slice(3)
const MOTION = {
  k01_eye: "the eye slowly opens and the pupil adjusts, the screen glow flickers softly in the iris, extremely subtle movement, macro, slow",
  k02_studio: "slow push-in toward her as she leans closer to the glowing monitor, rain streaks run down the window, subtle and moody",
  k03_hands: "her fingers type fluidly on the keyboard, gentle rack focus, dust floating in the light, slow dolly",
  k04_noir: "she walks steadily toward the camera through the rain, steam drifts, neon reflections ripple on the wet street, slow tracking shot backward",
  k05_desert: "her trench coat whips and billows in strong wind, sand blows off the dune crest, sun flare shimmers, slow orbit around her",
  k06_underwater: "she drifts slowly through the water, coat and curls flowing, chandeliers sway gently, light rays shimmer, bubbles rise",
  k07_neon: "she turns her head toward the camera, flying vehicles streak past behind her, neon light flickers across her face, slow push-in",
  k08_snow: "she walks slowly away across the snowfield, snow falls gently, slow crane up revealing the vast white landscape",
  k09_desert_close: "wind lifts her curls, she slowly turns her gaze toward the sun, golden light glints on the gold clip and earring, very slow push-in",
  k10_return: "she leans back in her chair and a faint satisfied smile forms, monitor glow flickers on her face, slow push-in",
}
const before = await credits()
const jobs = Object.entries(MOTION).filter(([k]) => !only.length || only.includes(k))
await Promise.allSettled(jobs.map(async ([key, motion]) => {
  const image = await host(`${key}.png`)
  try {
    await task("kling-3.0/video", { prompt: `${motion}. Cinematic, photorealistic, the same woman throughout, natural motion, no text.`, image_urls: [image], duration: "5", aspect_ratio: "16:9", mode, multi_shots: false, sound: false }, `${key}.mp4`, { pollMs: 10000, maxPolls: 120 })
  } catch (e) { console.log("FAILED", key, e.message) }
}))
console.log("credits used:", before - (await credits()))

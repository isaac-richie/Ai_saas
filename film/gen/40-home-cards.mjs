// Brings the three Home start cards to life: each still becomes a short clip that plays once over its poster.
// Usage: node gen/40-home-cards.mjs [quick] [film] [videos]   (Kling 3.0 std, no sound, ~70 Kie credits each)
// Output: public/home/<key>.mp4 in the app, compressed for the web. The cards switch to video only when the file exists.
import fs from "node:fs"
import { execFileSync } from "node:child_process"
import { ASSETS, credits, host, task } from "./kie.mjs"

const APP_PUBLIC = new URL("../../public/", import.meta.url)
const CARDS = {
  quick: {
    still: "presets/style_cyberpunk_neon.jpg",
    prompt: "The man in the neon city slowly turns his head toward the camera and locks eyes with the viewer, a small confident smile, then lifts his hand and beckons with two fingers as if to say follow me, and turns to walk into the glowing street. Neon signs flicker, light haze drifts, subtle slow push-in.",
  },
  film: {
    still: "studio-plate-2.jpg",
    prompt: "On the film set, the crew moves with purpose: the boom operator raises the microphone, a large light flares on and blooms, the camera on its dolly glides slowly to the left, silhouettes take their marks. Slow, steady cinematic camera drift.",
  },
  videos: {
    still: "presets/style_golden_hour_film.jpg",
    prompt: "The warrior woman on the ridge at sunset slowly turns her head over her shoulder toward the camera, wind lifting her hair and cloak, the low sun flares and pulses behind her. Gentle slow orbit around her.",
  },
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CARDS)
const before = await credits()
console.log(`credits ${before}; cards: ${keys.join(", ")}`)
fs.mkdirSync(new URL("home/", APP_PUBLIC), { recursive: true })

await Promise.allSettled(keys.map(async (key) => {
  const { still, prompt } = CARDS[key]
  const local = `home_${key}${still.slice(still.lastIndexOf("."))}`
  fs.copyFileSync(new URL(still, APP_PUBLIC), new URL(local, ASSETS))
  try {
    await task("kling-3.0/video", {
      prompt: `${prompt} Cinematic, photorealistic, the same person and place throughout, natural motion, no text.`,
      image_urls: [await host(local)], duration: "5", aspect_ratio: "16:9", mode: "std", multi_shots: false, sound: false,
    }, `home_${key}.mp4`, { pollMs: 10000, maxPolls: 120 })
    // Web encode: 960px wide, no audio, fast start, small enough to autoplay on a phone.
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", new URL(`home_${key}.mp4`, ASSETS).pathname,
      "-vf", "scale=960:-2", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      new URL(`home/${key}.mp4`, APP_PUBLIC).pathname])
    console.log(`public/home/${key}.mp4 ready (${Math.round(fs.statSync(new URL(`home/${key}.mp4`, APP_PUBLIC)).size / 1024)} KB)`)
  } catch (e) { console.log("FAILED", key, e.message) }
}))
console.log("credits used:", before - (await credits()))

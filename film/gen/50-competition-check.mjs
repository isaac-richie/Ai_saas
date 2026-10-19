// End-to-end check of the three main paths with the exact request shapes the app sends.
// Usage: node gen/50-competition-check.mjs image|video|lipsync
import fs from "node:fs"
import { execFileSync } from "node:child_process"
import { ASSETS, credits, host, image, task, urls } from "./kie.mjs"

const step = process.argv[2]
const before = await credits()
const t0 = Date.now()
if (step === "image") {
  // App default: GPT Image 1.5, Nano Banana Pro fallback.
  await image("Photorealistic cinematic medium close-up of a young woman singer in her mid-20s with natural curly hair, gold hoop earrings and a black satin top, singing into a vintage studio microphone in a dark recording studio, warm amber key light from the side, soft haze, shallow depth of field, 35mm film still, no text.", [], "cc_singer.png", { aspect: "16:9", prefer: "gpt" })
}
if (step === "video") {
  const img = await host("cc_singer.png")
  await task("kling-3.0/video", { prompt: "She closes her eyes and sways gently as she sings into the microphone, the camera slowly pushes in, warm studio light flickers softly through the haze. Cinematic, photorealistic, natural motion, no text.", image_urls: [img], duration: "5", aspect_ratio: "16:9", mode: "pro", multi_shots: false, sound: true }, "cc_video.mp4", { pollMs: 10000, maxPolls: 120 })
}
if (step === "lipsync") {
  // 10 s of real sung vocal, cut like the app does (mono WAV, short fades).
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "136", "-t", "10", "-i", new URL("ncs/echo.mp3", ASSETS).pathname, "-ac", "1", "-af", "afade=t=in:d=0.01,afade=t=out:st=9.99:d=0.01", new URL("cc_vocal.wav", ASSETS).pathname])
  const img = urls()["cc_singer.png:hosted"] ?? await host("cc_singer.png")
  const audio = await host("cc_vocal.wav")
  await task("kling/ai-avatar-pro", { image_url: img, audio_url: audio, prompt: "She sings this line with feeling into the studio microphone, natural head movement and breathing, subtle smile between phrases." }, "cc_lipsync.mp4", { pollMs: 10000, maxPolls: 150 })
}
const after = await credits()
console.log(`${step}: ${Math.round((Date.now() - t0) / 1000)}s, credits used ${before - after}, left ${after}`)

// Animates the v2 live-action keyframes with Kling 3.0 pro. Usage: node gen/13-v2-animate.mjs [keys...]
import { credits, host, task } from "./kie.mjs"
const SHOTS = {
  v2_k1_studio: { sound: false, prompt: "Slow camera push-in over his shoulder toward the glowing monitor showing the Visiowave web interface. He slowly types on the keyboard. The soft screen glow reflects in his eyes as rain runs down the window in the dark studio." },
  v2_k2_desert: { sound: false, prompt: "Medium tracking shot of the man standing on the sand dune at golden hour. Strong wind blows his trench coat back smoothly, sand streams off the crest. The lens flare shifts as the camera drifts right, keeping him centered in golden light." },
  v2_k3_snow: { sound: false, prompt: "Wide tracking shot behind the man walking steadily away across the seamless white snowfield. Gentle snowfall drifts through the air, his footprints trailing behind him." },
  v2_k4_rain: { sound: false, prompt: "Close-up portrait in the rain-soaked street at night. Rain falls and water droplets run naturally down his cheeks and coat, he blinks slowly, steam rises in the background among neon city lights." },
  v2_k13_return: { sound: true, prompt: "Medium profile shot in the dark studio. The man leans back in his chair looking at the glowing monitor, a faint confident smile forms, and he says calmly in a warm deep voice: \"Visiowave Studios. Bringing imagination to life.\" Soft rain on the window, subtle chair creak." },
}
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS)
const before = await credits()
await Promise.allSettled(keys.map(async (key) => {
  const { sound, prompt } = SHOTS[key]
  try {
    await task("kling-3.0/video", { prompt: `${prompt} Cinematic, photorealistic, the same man throughout, natural motion, no text overlays.`, image_urls: [await host(`${key}.png`)], duration: "5", aspect_ratio: "16:9", mode: "pro", multi_shots: false, sound }, `${key}.mp4`, { pollMs: 10000, maxPolls: 120 })
  } catch (e) { console.log("FAILED", key, e.message) }
}))
console.log("credits used:", before - (await credits()))

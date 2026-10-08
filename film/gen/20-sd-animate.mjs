// Seedance 2 image-to-video with native audio. Usage: node gen/20-sd-animate.mjs <key> [<key>...]
import { credits, host, task } from "./kie.mjs"
import { SHOTS } from "./sd-shots.mjs"
const keys = process.argv.slice(2)
const before = await credits()
await Promise.allSettled(keys.map(async (key) => {
  const { image, last, prompt, duration = 5 } = SHOTS[key]
  try {
    await task("bytedance/seedance-2", {
      prompt, first_frame_url: await host(image), ...(last ? { last_frame_url: await host(last) } : {}), duration, aspect_ratio: "16:9", generate_audio: true,
    }, `${key}.mp4`, { pollMs: 10000, maxPolls: 150 })
  } catch (e) { console.log("FAILED", key, e.message) }
}))
console.log("credits used:", before - (await credits()), "left:", await credits())

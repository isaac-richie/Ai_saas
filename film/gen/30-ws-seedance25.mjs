// Seedance 2.5 on WaveSpeed. Usage: node gen/30-ws-seedance25.mjs [--res 1080p] [--turbo] <key> [<key>...]
// Outputs land beside the 2.0 renders as <key>_s25.mp4 so the two can be compared shot for shot.
import { host } from "./kie.mjs"
import { SHOTS } from "./sd-shots.mjs"
import { balance, seedance25 } from "./wavespeed.mjs"

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, name === "--turbo" ? 1 : 2)[1] ?? true }
const resolution = flag("--res") ?? "1080p"
const turbo = Boolean(flag("--turbo"))
const before = await balance()
console.log(`balance $${before}; ${resolution}${turbo ? " turbo" : ""}`)
await Promise.allSettled(args.map(async (key) => {
  const { image, last, prompt, duration = 5 } = SHOTS[key]
  try {
    await seedance25({ prompt, image: await host(image), last: last && (await host(last)), duration, resolution, turbo }, `${key}_s25.mp4`)
  } catch (e) { console.log("FAILED", key, e.message) }
}))
const after = await balance()
console.log(`spent $${(before - after).toFixed(2)}, left $${after}`)

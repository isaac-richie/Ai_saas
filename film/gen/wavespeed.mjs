// Minimal WaveSpeed client for film production, the twin of kie.mjs: submit a prediction, poll it, save the result.
// Needs WAVESPEED_API_KEY in the root .env. Docs: https://wavespeed.ai/docs/submit-task
import fs from "node:fs"
import { ASSETS, urls } from "./kie.mjs"

const env = Object.fromEntries(fs.readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] }))
const KEY = process.env.WAVESPEED_API_KEY ?? env.WAVESPEED_API_KEY
const API = "https://api.wavespeed.ai/api/v3"
const auth = () => {
  if (!KEY) throw new Error("WAVESPEED_API_KEY is missing from .env")
  return { Authorization: `Bearer ${KEY}` }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Account balance in US dollars. */
export async function balance() {
  const r = await (await fetch(`${API}/balance`, { headers: auth() })).json()
  return r.data?.balance
}

/** Runs a WaveSpeed model and saves the first output to public/film/<file>. Returns the output URL. */
export async function wsTask(model, input, file, { pollMs = 5000, maxPolls = 360 } = {}) {
  if (fs.existsSync(new URL(file, ASSETS)) && urls()[file]) { console.log(`${file}: cached`); return urls()[file] }
  const created = await (await fetch(`${API}/${model}`, { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify(input) })).json()
  const id = created?.data?.id
  if (!id) throw new Error(`${file}: submit failed ${JSON.stringify(created).slice(0, 300)}`)
  const t0 = Date.now()
  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollMs)
    let d
    try { d = (await (await fetch(`${API}/predictions/${id}/result`, { headers: auth() })).json()).data } catch { continue }
    if (d?.status === "completed") {
      const url = d.outputs[0]
      fs.writeFileSync(new URL(file, ASSETS), Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(240000) })).arrayBuffer()))
      const all = urls(); all[file] = url; fs.writeFileSync(new URL("urls.json", ASSETS), JSON.stringify(all, null, 2))
      console.log(`${file}: done in ${Math.round((Date.now() - t0) / 1000)}s`)
      return url
    }
    if (["failed", "cancelled", "timeout", "deleted"].includes(d?.status)) throw new Error(`${file}: ${d.status} ${d.error ?? ""}`)
  }
  throw new Error(`${file}: timed out`)
}

/** Seedance 2.5 image-to-video. Aspect ratio follows the keyframe; resolution 480p | 720p | 1080p | 4k. */
export const seedance25 = ({ prompt, image, last, duration = 5, resolution = "1080p", audio = true, turbo = false }, file) =>
  wsTask(`bytedance/seedance-2.5/image-to-video${turbo ? "-turbo" : ""}`, { prompt, image, ...(last ? { last_image: last } : {}), duration, resolution, generate_audio: audio }, file)

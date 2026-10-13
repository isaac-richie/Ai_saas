// Original instrumental score via Kie's Suno API.
import fs from "node:fs"
import { ASSETS, credits, headers } from "./kie.mjs"
const before = await credits()
const r = await fetch("https://api.kie.ai/api/v1/generate", { method: "POST", headers, body: JSON.stringify({
  customMode: true,
  instrumental: true,
  model: "V4_5",
  title: "Every Frame",
  style: "cinematic trailer score, intimate felt piano motif opening, deep sub pulse, ticking percussion, swelling strings, building tension, big braam hits, soaring emotional climax, clean final hit and ring-out, 100 bpm, modern film trailer, no vocals",
  prompt: "",
  callBackUrl: "https://example.com/kie-callback",
}) })
const created = await r.json()
console.log("create:", JSON.stringify(created).slice(0, 200))
const id = created.data?.taskId
if (!id) process.exit(1)
for (let i = 0; i < 80; i++) {
  await new Promise((res) => setTimeout(res, 10000))
  let s
  try { s = await (await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${id}`, { headers })).json() } catch { continue }
  const status = s.data?.status
  const tracks = s.data?.response?.sunoData || []
  if (status === "SUCCESS" || (tracks.length && tracks.every((t) => t.audioUrl))) {
    for (const [i, t] of tracks.entries()) {
      const buf = Buffer.from(await (await fetch(t.audioUrl)).arrayBuffer())
      fs.writeFileSync(new URL(`score_${i}.mp3`, ASSETS), buf)
      console.log(`score_${i}.mp3`, Math.round(t.duration), "s")
    }
    break
  }
  if (/FAIL|ERROR/i.test(status || "")) { console.log("failed", JSON.stringify(s.data).slice(0, 300)); break }
}
console.log("credits used:", before - (await credits()))

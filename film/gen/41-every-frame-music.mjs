// Original instrumental score for Every Frame v3 via Kie Suno (V5).
import fs from "node:fs"
import { ASSETS, credits, headers } from "./kie.mjs"
const before = await credits()
const r = await fetch("https://api.kie.ai/api/v1/generate", { method: "POST", headers, body: JSON.stringify({
  customMode: true,
  instrumental: true,
  model: "V5",
  title: "Every Frame",
  style: "emotional cinematic brand film score, 100 bpm, opens with a single intimate felt piano motif and soft breathy synth pad, warm cello and swelling strings enter for golden desert vistas, airy shimmering textures for a vast snowfield, gentle pulsing build with soft cinematic drums, then a sudden two-second silence, then a big heartfelt orchestral and synth swell with a deep sub boom, ending in a warm resolved chord and crystal bell ring-out, premium, hopeful, no vocals",
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
      fs.writeFileSync(new URL(`ef_score_${i}.mp3`, ASSETS), buf)
      console.log(`ef_score_${i}.mp3`, Math.round(t.duration), "s")
    }
    break
  }
  if (/FAIL|ERROR/i.test(status || "")) { console.log("failed", JSON.stringify(s.data).slice(0, 300)); break }
}
console.log("credits used:", before - (await credits()))

// Original instrumental score via Kie's Suno API.
import fs from "node:fs"
import { ASSETS, credits, headers } from "./kie.mjs"
const before = await credits()
const r = await fetch("https://api.kie.ai/api/v1/generate", { method: "POST", headers, body: JSON.stringify({
  customMode: true,
  instrumental: true,
  model: "V4_5",
  title: "Tool and Creator",
  style: "epic cinematic brand anthem, 120 bpm, starts with intimate felt piano and soft synth pad, builds steadily with pulsing strings and percussion, a long confident driving middle section full of momentum and wonder, then pulls back to a quiet reflective breath, then a final warm emotional swell with a deep sub boom and a crystal bell ring-out, no vocals",
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
      fs.writeFileSync(new URL(`v3_score_${i}.mp3`, ASSETS), buf)
      console.log(`v3_score_${i}.mp3`, Math.round(t.duration), "s")
    }
    break
  }
  if (/FAIL|ERROR/i.test(status || "")) { console.log("failed", JSON.stringify(s.data).slice(0, 300)); break }
}
console.log("credits used:", before - (await credits()))

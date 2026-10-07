// Original instrumental score via Kie's Suno API.
import fs from "node:fs"
import { ASSETS, credits, headers } from "./kie.mjs"
const before = await credits()
const r = await fetch("https://api.kie.ai/api/v1/generate", { method: "POST", headers, body: JSON.stringify({
  customMode: true,
  instrumental: true,
  model: "V4_5",
  title: "Imagination Engine",
  style: "cinematic hybrid trailer score, 120 bpm, opens with intimate felt piano and soft rain ambience, rising pulse and strings through the middle, an energetic rhythmic montage section with punchy percussion, a short breath, then a warm emotional resolve with a deep final sub hit and ring-out, no vocals",
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
      fs.writeFileSync(new URL(`v2_score_${i}.mp3`, ASSETS), buf)
      console.log(`v2_score_${i}.mp3`, Math.round(t.duration), "s")
    }
    break
  }
  if (/FAIL|ERROR/i.test(status || "")) { console.log("failed", JSON.stringify(s.data).slice(0, 300)); break }
}
console.log("credits used:", before - (await credits()))

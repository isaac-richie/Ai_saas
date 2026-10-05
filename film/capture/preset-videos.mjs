// Animates three preset example images with Kling 3.0 (image-to-video) for the presets scene.
import fs from "node:fs"
const env = Object.fromEntries(fs.readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] }))
const h = { Authorization: `Bearer ${env.KIE_AI_API_KEY}`, "Content-Type": "application/json" }
const jobs = [
  ["style_underwater_blue", "Slow cinematic push-in, the diver drifts forward, light rays shimmer, particles float, gentle current"],
  ["style_cyberpunk_neon", "Slow cinematic dolly, neon signs flicker, rain falls, the figure turns his head slightly, steam drifts"],
  ["style_golden_hour_film", "Slow cinematic push-in, warm sunset light flares, hair and clothes move in a soft breeze, dust in the air"],
]
const out = {}
await Promise.all(jobs.map(async ([id, prompt]) => {
  const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", { method: "POST", headers: h, body: JSON.stringify({
    model: "kling-3.0/video",
    input: { prompt, image_urls: [`https://kshtncjkhwhdveqwjxyy.supabase.co/storage/v1/object/public/renders/film/${id}.jpg`], duration: "5", aspect_ratio: "16:9", mode: "std", multi_shots: false, sound: false },
  }) })
  const j = await r.json()
  const task = j.data?.taskId
  if (!task) { console.log(id, "create failed", JSON.stringify(j).slice(0, 200)); return }
  for (let i = 0; i < 120; i++) {
    await new Promise((res) => setTimeout(res, 10_000))
    let s
    try { s = await (await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${task}`, { headers: h })).json() } catch { continue }
    if (s.data?.state === "success") {
      const url = JSON.parse(s.data.resultJson).resultUrls[0]
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      fs.writeFileSync(new URL(`../public/outputs/preset_${id}.mp4`, import.meta.url), buf)
      out[id] = url; console.log(id, "done", (buf.length / 1e6).toFixed(1) + "MB"); return
    }
    if (s.data?.state === "fail") { console.log(id, "failed", s.data.failMsg); return }
  }
  console.log(id, "timed out")
}))
console.log(JSON.stringify(out))

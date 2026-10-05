// Two Scene Builder image options (GPT Image 1.5, BB as reference), then the chosen one animated with Kling.
import fs from "node:fs"
const env = Object.fromEntries(fs.readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] }))
const h = { Authorization: `Bearer ${env.KIE_AI_API_KEY}`, "Content-Type": "application/json" }
const REF = "https://kshtncjkhwhdveqwjxyy.supabase.co/storage/v1/object/public/renders/film/lead_ref.jpg"
const OUT = new URL("../public/outputs/", import.meta.url)

async function run(model, input, file) {
  const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", { method: "POST", headers: h, body: JSON.stringify({ model, input }) })
  const j = await r.json()
  const task = j.data?.taskId
  if (!task) throw new Error(`${file}: ${JSON.stringify(j).slice(0, 200)}`)
  for (let i = 0; i < 90; i++) {
    await new Promise((res) => setTimeout(res, 8000))
    let s
    try { s = await (await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${task}`, { headers: h })).json() } catch { continue }
    if (s.data?.state === "success") {
      const url = JSON.parse(s.data.resultJson).resultUrls[0]
      fs.writeFileSync(new URL(file, OUT), Buffer.from(await (await fetch(url)).arrayBuffer()))
      console.log(file, "done"); return url
    }
    if (s.data?.state === "fail") throw new Error(`${file}: ${s.data.failMsg}`)
  }
  throw new Error(`${file}: timed out`)
}

const prompt = (extra) => `The same man from the reference (navy suit, open collar) stands on a grand London street lined with stone buildings, silver robots marching past him, overcast daylight, cinematic still, ${extra}`
// Same rule as the app: GPT Image first, Nano Banana Pro if a take fails.
const option = async (extra, file) => {
  if (fs.existsSync(new URL(file, OUT))) { console.log(file, "exists"); return JSON.parse(fs.readFileSync(new URL("scene-images.json", OUT)))[file] }
  try {
    return await run("gpt-image/1.5-image-to-image", { prompt: prompt(extra), input_urls: [REF], aspect_ratio: "3:2", quality: "high" }, file)
  } catch (error) {
    console.log(file, "GPT failed, falling back:", error.message)
    return run("nano-banana-pro", { prompt: prompt(extra), image_input: [REF], aspect_ratio: "16:9" }, file)
  }
}
const urls = fs.existsSync(new URL("scene-images.json", OUT)) ? JSON.parse(fs.readFileSync(new URL("scene-images.json", OUT))) : {}
const [a, b] = await Promise.all([
  option("he raises a white megaphone and shouts, low angle, 35mm", "scene_option_a.png"),
  option("he holds a white megaphone at his side and looks into the lens, medium wide, 50mm", "scene_option_b.png"),
])
Object.assign(urls, { "scene_option_a.png": a, "scene_option_b.png": b })
fs.writeFileSync(new URL("scene-images.json", OUT), JSON.stringify(urls, null, 2))
// Animate option A the way "Animate this image" does: Kling 3.0 from the approved image.
await run("kling-3.0/video", { prompt: "He raises the megaphone and shouts with conviction, robots stream past, slow push-in, cinematic", image_urls: [a], duration: "5", aspect_ratio: "16:9", mode: "std", multi_shots: false, sound: false }, "scene_option_a.mp4")

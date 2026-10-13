// Minimal Kie client for film production: create a task, poll it, download the result.
import fs from "node:fs"

const env = Object.fromEntries(fs.readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] }))
const env2 = { ...env, ...process.env }
export const headers = { Authorization: `Bearer ${env2.KIE_AI_API_KEY}`, "Content-Type": "application/json" }
export const SUPABASE = { url: env2.NEXT_PUBLIC_SUPABASE_URL, key: env2.SUPABASE_SERVICE_ROLE_KEY }
export const ASSETS = new URL("../public/film/", import.meta.url)
fs.mkdirSync(ASSETS, { recursive: true })

export async function credits() {
  const r = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers })
  return (await r.json()).data
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Runs a Kie market task and saves the first result to public/film/<file>. Returns the result URL. */
export async function task(model, input, file, { pollMs = 8000, maxPolls = 150 } = {}) {
  if (fs.existsSync(new URL(file, ASSETS))) {
    const known = urls()[file]
    if (known) { console.log(`${file}: cached`); return known }
  }
  let created
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", { method: "POST", headers, body: JSON.stringify({ model, input }) })
      created = await r.json()
      break
    } catch (e) { await sleep(3000) }
  }
  const id = created?.data?.taskId
  if (!id) throw new Error(`${file}: create failed ${JSON.stringify(created).slice(0, 200)}`)
  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollMs)
    let s
    try { s = await (await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${id}`, { headers })).json() } catch { continue }
    const state = s.data?.state
    if (state === "success") {
      const url = JSON.parse(s.data.resultJson).resultUrls[0]
      for (let a = 0; a < 3; a++) {
        try {
          fs.writeFileSync(new URL(file, ASSETS), Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(240000) })).arrayBuffer()))
          break
        } catch { await sleep(3000) }
      }
      remember(file, url)
      console.log(`${file}: done in ${Math.round((s.data.completeTime - s.data.createTime) / 1000)}s`)
      return url
    }
    if (state === "fail") throw new Error(`${file}: ${s.data.failMsg}`)
  }
  throw new Error(`${file}: timed out`)
}

/** Image with fallback: GPT Image 1.5 first, Nano Banana Pro if it fails. */
export async function image(prompt, refs, file, { aspect = "16:9", prefer = "nano" } = {}) {
  const nano = () => task("nano-banana-pro", { prompt, ...(refs.length ? { image_input: refs } : {}), aspect_ratio: aspect, resolution: "2K", output_format: "png" }, file)
  const gpt = () => task(refs.length ? "gpt-image/1.5-image-to-image" : "gpt-image/1.5-text-to-image", { prompt, ...(refs.length ? { input_urls: refs } : {}), aspect_ratio: aspect === "16:9" ? "3:2" : aspect, quality: "high" }, file)
  const order = prefer === "gpt" ? [gpt, nano] : [nano, gpt]
  try { return await order[0]() } catch (e) { console.log(`${file}: first engine failed (${e.message}), trying the other`); return order[1]() }
}

/** Publicly hosts a local asset so Kie can fetch it as a reference. */
export async function host(file) {
  const body = fs.readFileSync(new URL(file, ASSETS))
  const type = file.endsWith(".png") ? "image/png" : file.endsWith(".mp4") ? "video/mp4" : "image/jpeg"
  const r = await fetch(`${SUPABASE.url}/storage/v1/object/renders/film/feature/${file}`, { method: "POST", headers: { apikey: SUPABASE.key, Authorization: `Bearer ${SUPABASE.key}`, "Content-Type": type, "x-upsert": "true" }, body })
  if (!r.ok) throw new Error(`host ${file}: ${r.status}`)
  return `${SUPABASE.url}/storage/v1/object/public/renders/film/feature/${file}`
}

const URLS = new URL("urls.json", ASSETS)
export const urls = () => (fs.existsSync(URLS) ? JSON.parse(fs.readFileSync(URLS)) : {})
function remember(file, url) { const all = urls(); all[file] = url; fs.writeFileSync(URLS, JSON.stringify(all, null, 2)) }

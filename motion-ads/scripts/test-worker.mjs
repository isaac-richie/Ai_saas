// Render worker, end to end with real renders: a fake database and storage, the spike's images and voice
// served over HTTP. Slow (it renders), so it runs on its own: npm run test:worker
import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createJiti } from "jiti"
import { makeWorker } from "../worker-core.mjs"

const root = new URL("..", import.meta.url).pathname
const assets = path.join(root, "public/assets")
const FF = new URL("../../node_modules/ffmpeg-static/ffmpeg", import.meta.url).pathname
const jiti = createJiti(import.meta.url)
const { retime } = await jiti.import(`${root}src/timing.ts`)
const golden = JSON.parse(fs.readFileSync(`${root}src/fixtures/golden-mist.json`, "utf8"))
const U = "11111111-1111-4111-8111-111111111111", AD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

/** A tiny in-memory stand-in for the Supabase calls the worker makes. */
function fakeDb() {
  const t = { motion_ads: [], motion_ad_versions: [], motion_ad_assets: [], motion_ad_jobs: [] }
  const uploads = new Map(), settles = []
  const query = (table) => {
    const filters = []; let patch = null
    const rows = () => t[table].filter((r) => filters.every(([k, v]) => r[k] === v))
    const q = {
      select: () => q,
      eq: (k, v) => { filters.push([k, v]); return q },
      update: (p) => { patch = p; return q },
      single: async () => ({ data: rows()[0] ?? null, error: rows()[0] ? null : { message: "none" } }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve(patch ? (rows().forEach((r) => Object.assign(r, patch)), { error: null }) : { data: rows(), error: null }).then(res, rej),
    }
    return q
  }
  const db = {
    from: query,
    rpc: async (name, args) => {
      if (name === "settle_usage_quota") { settles.push(args); return { data: true, error: null } }
      const job = t.motion_ad_jobs.find((j) => j.state === "queued")
      if (!job) return { data: [], error: null }
      Object.assign(job, { state: "running", attempt: job.attempt + 1 })
      return { data: [{ ...job }], error: null }
    },
    storage: { from: (bucket) => ({
      upload: async (key, bytes) => { uploads.set(`${bucket}/${key}`, bytes); return { error: null } },
      download: async (key) => ({ data: new Blob([fs.readFileSync(path.join(assets, path.basename(key)))]), error: null }),
    }) },
  }
  return { db, t, uploads, settles }
}

let server, base
before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(assets, path.basename(decodeURIComponent(req.url.split("?")[0])))
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end() }
    const type = { ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".wav": "audio/wav", ".webp": "image/webp" }[path.extname(file)] ?? "application/octet-stream"
    res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": type, "Content-Length": fs.statSync(file).size }); fs.createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, r))
  base = `http://localhost:${server.address().port}`
})
after(() => server.close())

function seed(f, { withImages = true } = {}) {
  const plan = { ...golden, total_s: 10, shots: retime(golden.shots, 10) }
  f.t.motion_ads.push({ id: AD, user_id: U, state: "building", aspect: "16:9" })
  f.t.motion_ad_versions.push({ id: "v1", ad_id: AD, n: 1, plan, aspect: "16:9", watermark: true })
  if (withImages) for (let n = 1; n <= 6; n++) f.t.motion_ad_assets.push({ ad_id: AD, kind: "image", tag: `@image${n}`, storage_path: `${U}/motion-ads/${AD}/image${n}.jpg` })
  f.t.motion_ad_assets.push({ ad_id: AD, kind: "voice", storage_path: `${U}/motion-ads/${AD}/voice.wav`, mime: "audio/wav" })
  f.t.motion_ad_assets.push({ ad_id: AD, kind: "logo", storage_path: `${U}/motion-ads/${AD}/logo.svg` })
}
const probe = (bytes) => {
  const file = path.join(os.tmpdir(), `probe-${Date.now()}.mp4`); fs.writeFileSync(file, bytes)
  const out = spawnSync(FF, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr; fs.rmSync(file)
  const d = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(out)
  return { duration: d ? +d[3] + +d[2] * 60 : null, size: /, (\d{3,4})x(\d{3,4})/.exec(out)?.slice(1, 3).join("x"), audio: /Audio:/.test(out) }
}

describe("render worker", { timeout: 600_000 }, () => {
  it("a preview renders, is stored, and the ad becomes preview_ready", async () => {
    const f = fakeDb(); seed(f)
    f.t.motion_ad_jobs.push({ id: "j1", ad_id: AD, user_id: U, version_id: "v1", type: "preview", state: "queued", attempt: 0, resolution: "1080p" })
    const w = makeWorker({ db: f.db, publicUrl: (_b, p) => `${base}/${path.basename(p)}`, concurrency: 4 })
    assert.equal(await w.tick(), true)
    const [job] = f.t.motion_ad_jobs
    assert.equal(job.state, "done", job.error_message)
    assert.ok(job.compute_seconds > 0)
    assert.equal(f.t.motion_ads[0].state, "preview_ready")
    const key = `renders/${U}/motion-ads/${AD}/v1/preview.mp4`
    assert.equal(f.t.motion_ad_versions[0].preview_path, `${U}/motion-ads/${AD}/v1/preview.mp4`)
    const p = probe(f.uploads.get(key))
    assert.equal(p.size, "1920x1080"); assert.equal(p.audio, true)
    assert.ok(Math.abs(p.duration - 10) < 0.3, `preview is ${p.duration} s`)
    assert.equal(f.settles.length, 0, "previews charge nothing")
    assert.equal(await w.tick(), false, "nothing else queued")
  })

  it("a final renders the ad, a silent master and the audio stem, then charges the held credits", async () => {
    const f = fakeDb(); seed(f)
    f.t.motion_ads[0].state = "final_rendering"
    f.t.motion_ad_versions[0].watermark = false
    f.t.motion_ad_jobs.push({ id: "j2", ad_id: AD, user_id: U, version_id: "v1", type: "final", state: "queued", attempt: 0, resolution: "1080p", reservation_id: "res-1", units: 2 })
    const w = makeWorker({ db: f.db, publicUrl: (_b, p) => `${base}/${path.basename(p)}`, concurrency: 4 })
    await w.tick()
    assert.equal(f.t.motion_ad_jobs[0].state, "done", f.t.motion_ad_jobs[0].error_message)
    assert.equal(f.t.motion_ads[0].state, "done")
    const v = f.t.motion_ad_versions[0]
    assert.ok(v.final_path.endsWith("ad-1080p.mp4") && v.silent_path.endsWith("ad-1080p-silent.mp4") && v.stem_path.endsWith("audio-stem.wav"))
    assert.equal(probe(f.uploads.get(`renders/${v.final_path}`)).audio, true)
    assert.equal(probe(f.uploads.get(`renders/${v.silent_path}`)).audio, false, "the silent master has no sound")
    assert.equal(f.uploads.get(`renders/${v.stem_path}`).length, fs.statSync(path.join(assets, "voice.wav")).size, "the stem is the voice as uploaded")
    assert.deepEqual(f.settles, [{ p_user_id: U, p_reservation_id: "res-1", p_commit: true }])
  })

  it("a failing final retries once, then fails, refunds and says so", async () => {
    const f = fakeDb(); seed(f, { withImages: false })
    f.t.motion_ads[0].state = "final_rendering"
    f.t.motion_ad_jobs.push({ id: "j3", ad_id: AD, user_id: U, version_id: "v1", type: "final", state: "queued", attempt: 0, resolution: "4k", reservation_id: "res-2", units: 4 })
    const w = makeWorker({ db: f.db, publicUrl: (_b, p) => `${base}/${path.basename(p)}` })
    await w.tick()
    assert.equal(f.t.motion_ad_jobs[0].state, "queued", "first failure is retried")
    assert.equal(f.settles.length, 0, "nothing settled yet")
    await w.tick()
    const job = f.t.motion_ad_jobs[0]
    assert.equal(job.state, "failed")
    assert.match(job.error_message, /Shot 1 has no image/)
    assert.deepEqual(f.settles, [{ p_user_id: U, p_reservation_id: "res-2", p_commit: false }], "credits refunded")
    assert.equal(f.t.motion_ads[0].state, "failed")
    assert.equal(f.t.motion_ads[0].failed_from, "final_rendering")
    assert.match(f.t.motion_ads[0].notice, /generations were returned/)
  })
})

// The render worker's logic, with its database, storage URLs and logger passed in (so it can be tested
// against a fake database and a local file server). worker.mjs wires it to Supabase.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"

const ROOT = path.dirname(new URL(import.meta.url).pathname)
export const LEASE_S = 15 * 60
export const MAX_ATTEMPTS = 2

export function makeWorker({ db, publicUrl, log = () => {}, concurrency }) {
  let serveUrl
  async function templates() {
    serveUrl ??= await bundle({ entryPoint: path.join(ROOT, "src/index.ts") })
    return serveUrl
  }

  async function upload(key, file, contentType) {
    const { error } = await db.storage.from("renders").upload(key, fs.readFileSync(file), { contentType, upsert: true })
    if (error) throw new Error(`Upload failed: ${error.message}`)
    return key
  }

  async function settle(userId, reservationId, commit) {
    if (!reservationId) return
    const { error } = await db.rpc("settle_usage_quota", { p_user_id: userId, p_reservation_id: reservationId, p_commit: commit })
    if (error) log("settle failed", reservationId, error.message)
  }

  /** The files and settings a job renders from. */
  async function load(job) {
    const [{ data: ad }, { data: version }, { data: assets }] = await Promise.all([
      db.from("motion_ads").select("*").eq("id", job.ad_id).single(),
      db.from("motion_ad_versions").select("*").eq("id", job.version_id).single(),
      db.from("motion_ad_assets").select("*").eq("ad_id", job.ad_id),
    ])
    if (!ad || !version) throw new Error("The ad or its version is missing.")
    const images = Object.fromEntries((assets ?? []).filter((a) => a.kind === "image").map((a) => [a.tag, publicUrl("elements", a.storage_path)]))
    const voice = (assets ?? []).find((a) => a.kind === "voice")
    const logo = (assets ?? []).find((a) => a.kind === "logo")
    for (const shot of version.plan.shots) if (!shot.image_tag || !images[shot.image_tag]) throw new Error(`Shot ${shot.idx} has no image.`)
    return { ad, version, voice, props: {
      plan: version.plan,
      images,
      logo: logo ? publicUrl("elements", logo.storage_path) : null,
      voice: voice ? publicUrl("elements", voice.storage_path) : null,
      // Previews always carry the mark; finals only on the Free tier.
      watermark: job.type === "preview" ? true : version.watermark,
    } }
  }

  async function render(job) {
    const started = Date.now()
    const { ad, version, voice, props } = await load(job)
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "motion-ad-"))
    const base = `${ad.user_id}/motion-ads/${ad.id}/v${version.n}`
    try {
      const url = await templates()
      const id = version.aspect === "9:16" ? "MotionAdVertical" : "MotionAd"
      const composition = await selectComposition({ serveUrl: url, id, inputProps: props })
      const out = (name) => path.join(work, name)
      const common = { composition, serveUrl: url, codec: "h264", inputProps: props, concurrency: Math.min(os.cpus().length, concurrency ?? Math.max(1, Math.min(4, os.cpus().length - 1))) }
      const paths = {}
      if (job.type === "preview") {
        await renderMedia({ ...common, outputLocation: out("preview.mp4"), crf: 23, scale: 1 })
        paths.preview_path = await upload(`${base}/preview.mp4`, out("preview.mp4"), "video/mp4")
      } else {
        const scale = job.resolution === "4k" ? 2 : 1
        await renderMedia({ ...common, outputLocation: out("ad.mp4"), crf: 18, scale })
        await renderMedia({ ...common, outputLocation: out("silent.mp4"), crf: 18, scale, muted: true })
        paths.final_path = await upload(`${base}/ad-${job.resolution}.mp4`, out("ad.mp4"), "video/mp4")
        paths.silent_path = await upload(`${base}/ad-${job.resolution}-silent.mp4`, out("silent.mp4"), "video/mp4")
        if (voice) {
          // The audio stem is the voice file as uploaded, so it can go into the Editor unchanged.
          const { data: blob, error } = await db.storage.from("elements").download(voice.storage_path)
          if (error || !blob) throw new Error("Couldn't read the voice file for the audio stem.")
          const ext = voice.storage_path.split(".").pop()
          fs.writeFileSync(out(`stem.${ext}`), Buffer.from(await blob.arrayBuffer()))
          paths.stem_path = await upload(`${base}/audio-stem.${ext}`, out(`stem.${ext}`), voice.mime)
        }
      }
      await db.from("motion_ad_versions").update(paths).eq("id", version.id)
      const seconds = (Date.now() - started) / 1000
      await db.from("motion_ad_jobs").update({ state: "done", finished_at: new Date().toISOString(), compute_seconds: seconds, claimed_until: null, error_message: null }).eq("id", job.id)
      if (job.type === "final") await settle(ad.user_id, job.reservation_id, true)
      await db.from("motion_ads").update({ state: job.type === "final" ? "done" : "preview_ready", failed_from: null, updated_at: new Date().toISOString() }).eq("id", ad.id)
      log("done", job.type, job.id, `${seconds.toFixed(1)} s`)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  }

  async function fail(job, cause) {
    const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 480)
    log("job failed", job.id, `attempt ${job.attempt}`, message)
    if (job.attempt < MAX_ATTEMPTS) {
      // One automatic retry.
      await db.from("motion_ad_jobs").update({ state: "queued", claimed_until: null, error_message: message }).eq("id", job.id)
      return
    }
    await db.from("motion_ad_jobs").update({ state: "failed", finished_at: new Date().toISOString(), claimed_until: null, error_message: message }).eq("id", job.id)
    if (job.type === "final") await settle(job.user_id, job.reservation_id, false)
    await db.from("motion_ads").update({
      state: "failed", failed_from: job.type === "final" ? "final_rendering" : "building",
      notice: job.type === "final" ? "The final render failed. Your generations were returned; try again." : "The preview couldn't be built. Nothing was charged; try again.",
      updated_at: new Date().toISOString(),
    }).eq("id", job.ad_id)
  }

  async function tick() {
    const { data, error } = await db.rpc("claim_motion_ad_job", { p_lease_seconds: LEASE_S })
    if (error) { log("claim failed", error.message); return false }
    const job = Array.isArray(data) ? data[0] : data
    if (!job) return false
    log("claimed", job.type, job.id, `attempt ${job.attempt}`)
    try { await render(job) } catch (cause) { await fail(job, cause) }
    return true
  }

  return { tick, render, fail }
}

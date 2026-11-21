// Phase 0 spike: Golden Mist end to end. Validates the plan, re-times it from the voice, checks image
// sizes, then renders stills, a 1080p preview, a 4K final, a 9:16 version, a silent master and the
// audio stem, measuring wall time, peak memory and file size for each. Results: out/results.json.
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import { createJiti } from "jiti"

const root = new URL("..", import.meta.url).pathname
const jiti = createJiti(import.meta.url)
const { validatePlan } = await jiti.import(`${root}src/contract.ts`)
const { applyVoice, voiceProblem, FPS } = await jiti.import(`${root}src/timing.ts`)
const { imageWarnings } = await jiti.import(`${root}src/moves.ts`)
const FF = new URL("../../node_modules/ffmpeg-static/ffmpeg", import.meta.url).pathname
const OUT = `${root}out/`
fs.mkdirSync(`${OUT}stills`, { recursive: true })
const results = { machine: `${os.cpus()[0].model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`, steps: {} }
const log = (...a) => console.log("•", ...a)

/** Media facts from ffmpeg's banner: duration (s) and the first video size. */
function probe(file) {
  const r = spawnSync(FF, ["-hide_banner", "-i", file], { encoding: "utf8" })
  const text = r.stderr
  const d = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(text)
  const v = /Stream .*Video: .*?, (\d{2,5})x(\d{2,5})/.exec(text)
  return {
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null,
    width: v ? +v[1] : null, height: v ? +v[2] : null,
    audio: /Stream .*Audio:/.test(text),
  }
}

/** Run a command under /usr/bin/time -l: wall seconds and peak memory (largest single process). */
function measured(label, cmd, args) {
  const t0 = Date.now()
  const r = spawnSync("/usr/bin/time", ["-l", cmd, ...args], { cwd: root, encoding: "utf8", env: { ...process.env } })
  const seconds = (Date.now() - t0) / 1000
  const rss = /(\d+)\s+maximum resident set size/.exec(r.stderr)
  if (r.status !== 0) { console.error(r.stdout.slice(-2000), r.stderr.slice(-3000)); throw new Error(`${label} failed`) }
  const peakMB = rss ? Math.round(+rss[1] / 2 ** 20) : null
  log(label, `${seconds.toFixed(1)} s`, peakMB ? `peak ${peakMB} MB` : "")
  return { seconds: +seconds.toFixed(1), peakMB }
}

// 1. The draft plan from the brief must validate as-is.
const draft = JSON.parse(fs.readFileSync(`${root}src/fixtures/golden-mist.json`, "utf8"))
const draftCheck = validatePlan(draft)
results.steps.draftPlanValid = draftCheck.ok ? true : draftCheck.errors
log("draft plan", draftCheck.ok ? "valid" : draftCheck.errors)

// 2. The voice length wins: re-time every shot from it.
const voice = probe(`${root}public/assets/voice.wav`)
const vp = voiceProblem(voice.duration)
if (vp) throw new Error(vp)
const { plan, note } = applyVoice(draftCheck.plan, voice.duration, 15, FPS)
const final = validatePlan(plan, { voiceS: Math.round(voice.duration * FPS) / FPS })
results.steps.voice = { seconds: voice.duration, note, retimedPlanValid: final.ok ? true : final.errors, shots: plan.shots.map((s) => [s.idx, s.start_s, s.end_s]) }
log("voice", voice.duration, "s;", note ?? "matches the Length setting")
if (!final.ok) throw new Error(final.errors.join("\n"))

// 3. Image sizes against how close each shot's camera gets.
const images = plan.shots.map((s) => {
  const f = probe(`${root}public/assets/image${s.idx}.jpg`)
  return { tag: s.image_tag, width: f.width, height: f.height }
})
results.steps.imageWarnings = {
  at1080p: imageWarnings(plan.shots, images, { width: 1920, height: 1080 }),
  at4k: imageWarnings(plan.shots, images, { width: 3840, height: 2160 }),
  smallImageTest: imageWarnings([{ ...plan.shots[1], image_tag: "@image2" }], [{ tag: "@image2", width: 640, height: 800 }], { width: 3840, height: 2160 }),
}
log("image warnings at 4K:", results.steps.imageWarnings.at4k.length, "| small image test:", results.steps.imageWarnings.smallImageTest.map((w) => w.message).join(" "))

// 4. Props for the render (voice on, Free-tier watermark on).
const props = { plan, images: Object.fromEntries(plan.shots.map((s) => [s.image_tag, `assets/image${s.idx}.jpg`])), logo: "assets/logo.svg", voice: "assets/voice.wav", watermark: true }
fs.writeFileSync(`${OUT}props.json`, JSON.stringify(props, null, 2))
const npx = "npx"
const P = ["--props", `${OUT}props.json`]

// 5. Bundle once, then stills at every transition (just before, on, just after).
results.steps.bundle = measured("bundle", npx, ["remotion", "bundle", "src/index.ts", "--out-dir", `${OUT}bundle`])
const stillTimes = plan.shots.slice(0, -1).flatMap((s) => [s.end_s - 0.2, s.end_s, s.end_s + 0.2]).concat([plan.total_s - 0.5])
const t0 = Date.now()
for (const t of stillTimes) {
  const frame = Math.min(Math.round(t * FPS), Math.round(plan.total_s * FPS) - 1)
  execFileSync(npx, ["remotion", "still", `${OUT}bundle`, "MotionAd", `${OUT}stills/t${String(frame).padStart(4, "0")}.png`, `--frame=${frame}`, "--scale=0.5", ...P], { cwd: root, stdio: "ignore" })
}
results.steps.stills = { count: stillTimes.length, seconds: +((Date.now() - t0) / 1000).toFixed(1) }
execFileSync(FF, ["-y", "-loglevel", "error", "-pattern_type", "glob", "-i", `${OUT}stills/t*.png`, "-vf", "scale=480:270,tile=4x4:padding=6:color=0x222222", "-frames:v", "1", `${OUT}contact-sheet.png`])
log("stills", stillTimes.length, `${results.steps.stills.seconds} s`)

// 6. Renders.
const render = (label, comp, file, extra = []) => {
  const m = measured(label, npx, ["remotion", "render", `${OUT}bundle`, comp, `${OUT}${file}`, ...P, "--crf=18", ...extra])
  const f = probe(`${OUT}${file}`)
  return { ...m, file, width: f.width, height: f.height, duration: f.duration, audio: f.audio, MB: +(fs.statSync(`${OUT}${file}`).size / 2 ** 20).toFixed(1) }
}
results.steps.preview1080 = render("preview 1080p", "MotionAd", "golden-mist-preview-1080p.mp4")
results.steps.final4k = render("final 4K", "MotionAd", "golden-mist-4k.mp4", ["--scale=2", "--concurrency=4"])
results.steps.silentMaster4k = render("silent master 4K", "MotionAd", "golden-mist-4k-silent.mp4", ["--scale=2", "--concurrency=4", "--muted"])
results.steps.vertical1080 = render("vertical 9:16", "MotionAdVertical", "golden-mist-9x16.mp4")
fs.copyFileSync(`${root}public/assets/voice.wav`, `${OUT}golden-mist-audio-stem.wav`)

// 7. Checks from the brief: length matches the voice within a frame; sizes as ordered; audio present.
const frame = 1 / FPS
const checks = {
  previewLengthMatchesVoice: Math.abs(results.steps.preview1080.duration - voice.duration) <= frame + 0.02,
  final4kIs3840x2160: results.steps.final4k.width === 3840 && results.steps.final4k.height === 2160,
  final4kHasAudio: results.steps.final4k.audio,
  silentMasterHasNoAudio: !results.steps.silentMaster4k.audio,
  verticalIs1080x1920: results.steps.vertical1080.width === 1080 && results.steps.vertical1080.height === 1920,
}
results.checks = checks
fs.writeFileSync(`${OUT}results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify({ checks, preview: results.steps.preview1080, final4k: results.steps.final4k, vertical: results.steps.vertical1080 }, null, 2))

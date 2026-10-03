import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const transpile = (code) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message)

const framesModule = { exports: {} }
vm.runInNewContext(transpile(read("../src/core/validation/shot-frames.ts")), { module: framesModule, exports: framesModule.exports, require: createRequire(import.meta.url) })
const { shotFramesSchema, frameIssues, frameDirective, frameCapability, validateOwnedFrames, hasShotFrames, EMPTY_SHOT_FRAMES } = framesModule.exports

const user = "123e4567-e89b-42d3-a456-426614174000"
const frame = (n, extra = {}) => ({
  id: `123e4567-e89b-42d3-a456-4266141743${String(n).padStart(2, "0")}`,
  assetPath: `${user}/123e4567-e89b-42d3-a456-4266141744${String(n).padStart(2, "0")}.jpg`,
  name: `frame-${n}.jpg`, sourceType: "upload", influence: "medium", ...extra,
})

// ─── Contract ─────────────────────────────────────────────────────────────
test("frames are optional: none, start only, end only and both all parse", () => {
  for (const value of [EMPTY_SHOT_FRAMES, { start: frame(1) }, { end: frame(2) }, { start: frame(1), end: frame(2), transitionDirection: "turns to camera" }]) {
    assert.equal(shotFramesSchema.safeParse(value).success, true, JSON.stringify(value))
  }
  assert.equal(hasShotFrames(EMPTY_SHOT_FRAMES), false)
  assert.equal(hasShotFrames({ end: frame(2) }), true)
})

test("invalid frames are rejected before anything is charged", () => {
  const bad = [
    { start: { ...frame(1), assetPath: "https://evil.example/a.jpg" } },
    { start: { ...frame(1), assetPath: `${user}/123e4567-e89b-42d3-a456-426614174401.mp3` } },
    { start: { ...frame(1), sourceType: "url" } },
    { start: { ...frame(1), influence: "max" } },
    { start: frame(1), end: frame(1) },
    { start: frame(1), transitionDirection: "x".repeat(301) },
  ]
  for (const value of bad) assert.equal(shotFramesSchema.safeParse(value).success, false, JSON.stringify(value).slice(0, 80))
})

test("frames from another account are refused", () => {
  const other = "923e4567-e89b-42d3-a456-426614174000"
  assert.throws(() => validateOwnedFrames({ start: { ...frame(1), assetPath: `${other}/123e4567-e89b-42d3-a456-426614174401.jpg` } }, user), /another account/)
  assert.equal(validateOwnedFrames({ start: frame(1), end: frame(2) }, user).end.id, frame(2).id)
  same(validateOwnedFrames(undefined, user), EMPTY_SHOT_FRAMES)
})

// ─── Model capability (verified against Kie docs) ─────────────────────────
test("Kling and Seedance accept start, and start + end", () => {
  for (const family of ["kling", "seedance"]) {
    assert.equal(frameIssues({ start: frame(1) }, family).length, 0, `${family} start only`)
    assert.equal(frameIssues({ start: frame(1), end: frame(2) }, family).length, 0, `${family} start + end`)
    assert.equal(frameIssues(EMPTY_SHOT_FRAMES, family).length, 0, `${family} no frames`)
  }
})

test("an End Frame alone is explained, not silently sent", () => {
  for (const family of ["kling", "seedance"]) {
    const issues = frameIssues({ end: frame(2) }, family)
    assert.equal(issues.length, 1)
    assert.match(issues[0], /Add a Start Frame or remove the End Frame/)
    assert.equal(frameCapability(family).endRequiresStart, true)
  }
})

test("an unsupported model blocks only frames, never references", () => {
  const capability = frameCapability("unknown-model")
  assert.equal(capability.start, false)
  assert.match(capability.note, /references still apply/)
  assert.ok(frameIssues({ start: frame(1) }, "unknown-model").length > 0)
  assert.equal(frameIssues(EMPTY_SHOT_FRAMES, "unknown-model").length, 0, "no frames means nothing to block")
})

test("influence and transition become an explicit director directive", () => {
  assert.equal(frameDirective(EMPTY_SHOT_FRAMES), "")
  assert.match(frameDirective({ start: frame(1, { influence: "high" }) }), /open exactly on the start frame/)
  assert.match(frameDirective({ start: frame(1, { influence: "low" }) }), /loosely open/)
  const both = frameDirective({ start: frame(1), end: frame(2, { influence: "high" }), transitionDirection: "  slowly turns   toward camera " })
  assert.match(both, /^open on the start frame; land exactly on the end frame, matching its composition and details; transition: slowly turns toward camera$/)
})

// ─── Provider mapping ────────────────────────────────────────────────────
const kieModule = { exports: {} }
vm.runInNewContext(transpile(read("../src/infrastructure/ai/providers/kie.provider.ts")), {
  module: kieModule, exports: kieModule.exports,
  require: (id) => {
    if (id === "../base.provider") return { BaseProvider: class { constructor(config) { this.config = config } } }
    if (id === "./kie.models") return { DEFAULT_KIE_IMAGE_MODEL: "x", DEFAULT_KIE_VIDEO_MODEL_I2V: "kling-3.0/video", DEFAULT_KIE_VIDEO_MODEL_T2V: "t2v", inferKieOutputType: () => "video" }
    if (id === "@/core/utils/ai/error-normalization") return { normalizeGenerationError: (message) => message }
    throw new Error(`Unexpected import: ${id}`)
  },
})
const provider = new kieModule.exports.KieProvider({ apiKey: "test" })
const base = { prompt: "A shot", output_type: "video", duration_seconds: 5 }

test("Kling 3.0 sends [start, end] in image_urls", () => {
  const input = provider.buildMarketInput({ ...base, image_prompt: "https://s/start.jpg", end_image_prompt: "https://s/end.jpg" }, "kling-3.0/video")
  same(input.image_urls, ["https://s/start.jpg", "https://s/end.jpg"])
  assert.equal(input.multi_shots, false, "Kie allows a last frame only in single-shot mode")
})

test("Seedance 2 sends first_frame_url and last_frame_url", () => {
  const input = provider.buildMarketInput({ ...base, image_prompt: "https://s/start.jpg", end_image_prompt: "https://s/end.jpg" }, "bytedance/seedance-2")
  assert.equal(input.first_frame_url, "https://s/start.jpg")
  assert.equal(input.last_frame_url, "https://s/end.jpg")
  assert.equal(input.reference_image_urls, undefined, "frames never mix with Seedance multimodal references")
})

test("start-only requests are unchanged and an end frame is never sent alone", () => {
  same(provider.buildMarketInput({ ...base, image_prompt: "https://s/start.jpg" }, "kling-3.0/video").image_urls, ["https://s/start.jpg"])
  assert.equal(provider.buildMarketInput({ ...base, image_prompt: "https://s/start.jpg" }, "bytedance/seedance-2").last_frame_url, undefined)
  const endOnly = provider.buildMarketInput({ ...base, end_image_prompt: "https://s/end.jpg" }, "bytedance/seedance-2")
  assert.equal(endOnly.last_frame_url, undefined)
  assert.equal(provider.buildMarketInput({ ...base, end_image_prompt: "https://s/end.jpg" }, "kling-3.0/video").image_urls, undefined)
})

// ─── Generation, credits and persistence ─────────────────────────────────
const action = read("../src/core/actions/fast-video.ts")

test("frames are validated and capability-checked before the allowance is reserved", () => {
  const generate = action.slice(action.indexOf("export async function generateFastVideo"), action.indexOf("export async function pollFastVideoStatus"))
  const reserve = generate.indexOf("reserveUsageQuota(")
  for (const step of ["validateOwnedFrames(", "frameIssues(frames, family.id)", "createSignedUrl(assetPath", "image-to-video model"]) {
    const at = generate.indexOf(step)
    assert.ok(at > 0 && at < reserve, `${step} must run before credits are reserved`)
  }
  assert.match(generate, /nothing was charged/)
  assert.match(generate, /end_image_prompt: endFramePrompt/)
})

test("frame IDs are recorded separately from media references", () => {
  assert.match(action, /startFrameId: shotFrames\?\.start\?\.id \|\| null/)
  assert.match(action, /endFrameId: shotFrames\?\.end\?\.id \|\| null/)
  assert.match(action, /media_references: mediaReferences,\s+\.\.\.\(hasShotFrames\(shotFrames\) \? \{ shot_frames: shotFrames \} : \{\}\)/)
  assert.match(action, /from\("shot_frame_refs"\)\.insert\(rows\)/)
  assert.match(action, /start_frame_ref_id: idFor\("start"\)/)
  assert.match(action, /apply migration 0034/, "a missing migration degrades gracefully instead of failing the save")
})

test("Save / Load setup carries frames and keeps references working without the migration", () => {
  const route = read("../src/app/api/media/references/library/route.ts")
  assert.match(route, /frames: shotFramesSchema\.optional\(\)\.nullable\(\)/)
  assert.match(route, /frames from another account/)
  assert.match(route, /MISSING_COLUMN\.includes\(result\.error\.code\) && body\.frames/)
  const sync = read("../src/interface/components/fast-video/ReferenceLibrarySync.tsx")
  assert.match(sync, /onLoadFrames\(remoteFrames\.data\)/)
  assert.match(sync, /\.\.\.\(frames \? \{ frames \} : \{\}\)/)
})

test("migration 0034 is additive", () => {
  const sql = read("../src/infrastructure/supabase/migrations/0034_shot_frame_refs.sql")
  assert.match(sql, /create table if not exists public\.shot_frame_refs/)
  assert.match(sql, /frame_type text not null check \(frame_type in \('start', 'end'\)\)/)
  assert.match(sql, /source_type text not null check \(source_type in \('upload', 'gallery', 'capture', 'previous_shot'\)\)/)
  for (const column of ["start_frame_ref_id", "end_frame_ref_id", "transition_direction", "capability_snapshot", "cost_estimate", "actual_cost"]) assert.match(sql, new RegExp(`add column if not exists ${column}`))
  assert.match(sql, /add column if not exists shot_frames jsonb/)
  assert.doesNotMatch(sql, /\bdrop table\b|\bdrop column\b|reference_assets\s*=|delete from/i, "never removes existing reference data")
  assert.match(sql, /enable row level security/)
})

// ─── UI is additive ──────────────────────────────────────────────────────
test("Start / End Frame panel sits beside media references without replacing them", () => {
  const studio = read("../src/interface/components/fast-video/FastVideoStudio.tsx")
  const manager = studio.indexOf("<MediaReferenceManager")
  const frames = studio.indexOf("<ShotFramesPanel")
  const sync = studio.indexOf("<ReferenceLibrarySync")
  assert.ok(manager > 0 && manager < frames && frames < sync, "order: references, then frames, then Save/Load setup")
  assert.match(studio, /useImageToVideo: Boolean\(referenceImageUrl\) \|\| Boolean\(generationFrames\?\.start\)/)
  const panel = read("../src/interface/components/fast-video/ShotFramesPanel.tsx")
  assert.doesNotMatch(panel, /MediaReference\[\]|onChangeReferences|setReferenceLibrary/, "the panel never touches the reference list")
  for (const label of ["Add", "Capture", "Select", "Transition direction", "Use last frame of current clip as next Start Frame"]) assert.match(panel, new RegExp(label))
  assert.match(panel, /Add a Start Frame first\./)
  assert.match(panel, /aria-label=\{`\$\{label\} influence`\}/)
})

test("frames persist across refresh", () => {
  const studio = read("../src/interface/components/fast-video/FastVideoStudio.tsx")
  assert.match(studio, /shotFramesSchema\.safeParse\(parsed\.shotFrames\)/)
  const saved = studio.slice(studio.indexOf("FAST_VIDEO_STORAGE_KEY,\n"), studio.indexOf("// Ignore write failure"))
  assert.match(saved, /shotFrames,/)
})

// ─── Preset images ───────────────────────────────────────────────────────
test("every preset example image exists and stays lightweight", () => {
  const visuals = read("../src/interface/components/fast-video/preset-visuals.tsx")
  const paths = [...visuals.matchAll(/"(\/presets\/[a-z0-9_]+\.jpg)"/g)].map((match) => match[1])
  assert.equal(paths.length, 10, "every style preset has an example image")
  for (const path of paths) {
    const file = new URL(`../public${path}`, import.meta.url)
    assert.ok(existsSync(file), `${path} is missing`)
    assert.ok(statSync(file).size < 80 * 1024, `${path} should stay under 80 KB`)
  }
})

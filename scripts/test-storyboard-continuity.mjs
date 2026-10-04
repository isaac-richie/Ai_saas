import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const source = read("../src/interface/components/fast-video/storyboard-continuity.ts")
const loaded = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports })
const { shotReview, referenceChips, continueFromShot, insertAfter, approvedForRender } = loaded.exports
const plain = (value) => JSON.parse(JSON.stringify(value))

const ref = (over) => ({ id: over.id, name: `${over.id}.jpg`, mediaType: "image", role: "character", locked: true, applied: true, target: "provider", ...over })
const frame = { id: "f-end", assetPath: "u/a.jpg", name: "end.jpg", sourceType: "capture", sourceShotId: "s1", sourceTimestampMs: 4900, sourceLabel: "Street", influence: "medium" }
const shot = (over = {}) => ({ id: "s1", sourceClipId: "task-1", url: "https://x/v.mp4", subject: "Street chaos", prompt: "p", durationSeconds: 5, modelFamilyId: "kling", sceneGroup: "Scene A", note: "", status: "ready", createdAt: "", mediaReferences: [], ...over })

test("legacy shots get a sensible review state", () => {
  assert.equal(shotReview({ url: "" }), "draft")
  assert.equal(shotReview({ url: "u" }), "review")
  assert.equal(shotReview({ url: "u", approvedTakeId: "t" }), "approved")
  assert.equal(shotReview({ url: "u", review: "failed" }), "failed")
})

test("chips are honest about what reaches the model", () => {
  const chips = plain(referenceChips([
    ref({ id: "street", role: "location", locked: false }),
    ref({ id: "alex" }),
    ref({ id: "earbuds", role: "product", target: "director" }),
    ref({ id: "old", role: "style", applied: false }),
  ]))
  assert.deepEqual(chips.map((c) => c.id), ["alex", "earbuds", "street", "old"], "character, product, location, then others")
  assert.deepEqual(chips.map((c) => c.binding), ["sent", "guide", "sent", "off"])
  assert.equal(chips[0].label, "alex", "file extension is hidden")
})

test("Continue needs an approved take with a saved end frame", () => {
  assert.equal(continueFromShot(shot({ review: "review", endFrame: frame }), { itemId: "n", frameId: "f2" }, "t").ok, false)
  assert.equal(continueFromShot(shot({ review: "approved", endFrame: null }), { itemId: "n", frameId: "f2" }, "t").ok, false)
})

test("Continue starts the next shot from the approved end frame and keeps only locked references", () => {
  const previous = shot({ review: "approved", endFrame: frame, mediaReferences: [ref({ id: "alex" }), ref({ id: "street", role: "location", locked: false })] })
  const result = plain(continueFromShot(previous, { itemId: "s2", frameId: "f-start" }, "now"))
  assert.equal(result.ok, true)
  const next = result.item
  assert.equal(next.startFrame.assetPath, frame.assetPath, "same image")
  assert.equal(next.startFrame.id, "f-start", "separate frame record")
  assert.equal(next.startFrame.sourceType, "previous_shot")
  assert.equal(next.previousItemId, "s1")
  assert.equal(next.review, "draft")
  assert.equal(next.url, "")
  assert.deepEqual(next.mediaReferences.map((r) => r.id), ["alex"])
  assert.equal(next.sceneGroup, "Scene A")
})

test("continued shots are inserted right after their source, and only approved shots render in order", () => {
  const items = [shot({ id: "a" }), shot({ id: "b" })]
  assert.deepEqual(plain(insertAfter(items, "a", shot({ id: "c" })).map((i) => i.id)), ["a", "c", "b"])
  const renderable = approvedForRender([
    shot({ id: "1", review: "approved" }),
    shot({ id: "2", review: "review" }),
    shot({ id: "3", review: "approved", sourceClipId: null }),
    shot({ id: "4", approvedTakeId: "t" }),
  ])
  assert.deepEqual(plain(renderable.map((i) => i.id)), ["1", "4"])
})

test("storyboard continuity persists and degrades on older databases", () => {
  const sql = read("../src/infrastructure/supabase/migrations/0038_storyboard_continuity.sql")
  for (const column of ["direction", "review_status", "start_frame", "end_frame", "previous_item_id"]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`))
  }
  const action = read("../src/core/actions/fast-video-storyboard.ts")
  assert.match(action, /ownedFrame\(item\.startFrame, userId\)/, "frames must belong to the signed-in user")
  assert.match(action, /for \(const column of OPTIONAL_COLUMN_GROUPS\[index\]\) delete copy\[column\]/)
  const panel = read("../src/interface/components/fast-video/StoryboardPanel.tsx")
  for (const label of ["Generate shot", "Approve take", "Continue to next shot", "Regenerate this shot", "More options", "Start new scene instead", "Unlock for this shot"]) {
    assert.ok(panel.includes(label), label)
  }
  assert.ok(read("../src/interface/components/fast-video/StoryboardExportPanel.tsx").includes("Render approved shots"))
})

import { createRequire } from "node:module"
const directionModule = { exports: {} }
vm.runInNewContext(
  ts.transpileModule(read("../src/core/validation/storyboard-direction.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module: directionModule, exports: directionModule.exports, require: createRequire(import.meta.url) },
)
const { needsEnhancement, generationPrompt, referenceClassificationSchema, enhanceDirectionRequestSchema } = directionModule.exports

test("a short direction is enhanced once and reused until it changes", () => {
  assert.equal(needsEnhancement({ direction: "puts the earbud in" }), true)
  assert.equal(needsEnhancement({ direction: "puts the earbud in", enhancedPrompt: "FULL", enhancedFrom: "puts the earbud in" }), false)
  assert.equal(needsEnhancement({ direction: "takes it out", enhancedPrompt: "FULL", enhancedFrom: "puts the earbud in" }), true)
  assert.equal(needsEnhancement({ direction: "anything", autoEnhance: false }), false, "switch off sends words as written")
  assert.equal(needsEnhancement({ direction: "  " }), false)
  assert.equal(generationPrompt({ direction: "puts the earbud in", enhancedPrompt: "FULL", enhancedFrom: "puts the earbud in" }), "FULL")
  assert.equal(generationPrompt({ direction: "takes it out", enhancedPrompt: "FULL", enhancedFrom: "puts the earbud in" }), "takes it out", "stale enhancement is never sent")
  assert.equal(generationPrompt({ direction: "x y", enhancedPrompt: "FULL", enhancedFrom: "x y", autoEnhance: false }), "x y")
  assert.equal(generationPrompt({ direction: "", prompt: "legacy prompt" }), "legacy prompt")
})

test("dropped-image tags and enhance requests are bounded", () => {
  assert.equal(referenceClassificationSchema.safeParse({ role: "character", label: "Man", description: "Short dark hair, pearl necklace" }).success, true)
  assert.equal(referenceClassificationSchema.safeParse({ role: "celebrity", label: "x", description: "y" }).success, false)
  assert.equal(enhanceDirectionRequestSchema.safeParse({ direction: "x".repeat(1201) }).success, false)
  assert.equal(enhanceDirectionRequestSchema.safeParse({ direction: "ok go", references: Array(7).fill({ role: "character", name: "a" }) }).success, false)
})

test("storyboard AI routes require sign-in, own the image and never identify people", () => {
  const classify = read("../src/app/api/storyboard/classify-reference/route.ts")
  assert.match(classify, /if \(!user\) return NextResponse\.json\(\{ error: "Please sign in\." \}, \{ status: 401 \}\)/)
  assert.match(classify, /startsWith\(`\$\{user\.id\}\/`\)/)
  assert.match(classify, /Never identify a real person/)
  const enhance = read("../src/app/api/storyboard/enhance-direction/route.ts")
  assert.match(enhance, /status: 401/)
  assert.match(enhance, /never add story beats, dialogue, people or products they did not ask for/)
  const studio = read("../src/interface/components/fast-video/FastVideoStudio.tsx")
  assert.match(studio, /toast\.message\("Using your direction as written"/, "enhancement failure falls back")
  assert.match(read("../src/infrastructure/supabase/migrations/0039_storyboard_enhanced_prompt.sql"), /add column if not exists auto_enhance boolean not null default true/)
})

test('spec follow-ups: character prompt, shared references, drift review', () => {
  const continuity = read("../src/interface/components/fast-video/storyboard-continuity.ts")
  assert.match(continuity, /export function needsCharacter/)
  assert.match(continuity, /export function laterShotsUsing/)
  const panel = read("../src/interface/components/fast-video/StoryboardPanel.tsx")
  for (const label of ["this and later shots", "Flag drift", "Looks consistent", "Sent with the last generation"]) assert.ok(panel.includes(label), label)
  const studio = read("../src/interface/components/fast-video/FastVideoStudio.tsx")
  assert.match(studio, /"Who should appear in this shot\?"/)
  assert.match(studio, /driftReview: null,/, "a new take resets the drift check")
  assert.match(read("../src/infrastructure/supabase/migrations/0041_storyboard_drift_review.sql"), /add column if not exists drift_review text/)
  const flow = read("../src/interface/components/shots/ShotFlowPanel.tsx")
  assert.match(flow, /captureVideoFrame\(`\/api\/media\/proxy\?url=\$\{encodeURIComponent\(video\.output_url\)\}`, "end"\)/, "continues from the video's last frame")
  assert.match(read("../src/interface/components/shots/ShotBuilder.tsx"), /OpenAI images can&apos;t use your reference images/)
})

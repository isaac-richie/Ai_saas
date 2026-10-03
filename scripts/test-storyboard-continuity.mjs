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
  assert.match(action, /for \(const column of CONTINUITY_COLUMNS\) delete copy\[column\]/)
  const panel = read("../src/interface/components/fast-video/StoryboardPanel.tsx")
  for (const label of ["Generate shot", "Approve take", "Continue to next shot", "Regenerate this shot", "More options", "Start new scene instead", "Unlock for this shot"]) {
    assert.ok(panel.includes(label), label)
  }
  assert.ok(read("../src/interface/components/fast-video/StoryboardExportPanel.tsx").includes("Render approved shots"))
})

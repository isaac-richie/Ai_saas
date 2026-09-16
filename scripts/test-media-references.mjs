import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"

// Exercise the shared TypeScript contract without adding a test-only runtime dependency.
const source = readFileSync(new URL("../src/core/validation/media-reference.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { module, exports: module.exports, require: createRequire(import.meta.url) })
const { mediaReferenceSchema, mediaReferencesSchema, referenceLibrarySchema, referenceCompatibility, referenceConflicts, referenceIsInContext, referencePrompt, referencePromptFits, validateOwnedReferences } = module.exports
const user = "123e4567-e89b-42d3-a456-426614174000"
const project = "123e4567-e89b-42d3-a456-426614174001"
const scene = "123e4567-e89b-42d3-a456-426614174002"
const base = {
  id: "123e4567-e89b-42d3-a456-426614174003", assetPath: `${user}/123e4567-e89b-42d3-a456-426614174004.png`,
  name: "Wardrobe.png", mediaType: "image", role: "wardrobe", priority: "primary", influence: "high",
  scope: "shot", locked: false, projectId: project, sceneId: scene, target: "director", applied: true,
  trimStart: 0, volume: 1, analysis: { guidance: "Preserve the red linen coat.", observations: [], warnings: [], limitations: "Not pixel exact.", transcript: null },
}
test("accepts image, motion video and speech audio references", () => {
  assert.equal(mediaReferenceSchema.safeParse(base).success, true)
  for (const mediaType of ["video", "audio"]) {
    assert.equal(mediaReferenceSchema.safeParse({ ...base, mediaType, role: mediaType === "video" ? "camera movement" : "dialogue", duration: 12, trimStart: 2, trimEnd: 8 }).success, true)
  }
})
test("rejects roles from the wrong modality", () => {
  assert.equal(mediaReferenceSchema.safeParse({ ...base, role: "voiceover" }).success, false)
})
test("rejects inverted, overflowing and missing trims", () => {
  const video = { ...base, mediaType: "video", role: "pacing", duration: 10 }
  for (const trim of [{ trimStart: 8, trimEnd: 4 }, { trimStart: 0, trimEnd: 11 }, { trimStart: 0 }, { trimStart: NaN, trimEnd: 2 }]) {
    assert.equal(mediaReferenceSchema.safeParse({ ...video, ...trim }).success, false)
  }
})
test("rejects unsupported paths, traversal and another user's asset", () => {
  assert.throws(() => validateOwnedReferences([{ ...base, assetPath: `${user}/../secret` }], user))
  assert.throws(() => validateOwnedReferences([base], project))
  assert.equal(validateOwnedReferences([base], user).length, 1)
})
test("requires context for scene and project scopes", () => {
  assert.equal(mediaReferenceSchema.safeParse({ ...base, scope: "scene", sceneId: null }).success, false)
  assert.equal(mediaReferenceSchema.safeParse({ ...base, scope: "project", projectId: null }).success, false)
})
test("project references cross scenes but never projects", () => {
  assert.equal(referenceIsInContext({ ...base, scope: "project" }, project, null), true)
  assert.equal(referenceIsInContext({ ...base, scope: "project" }, user, scene), false)
  assert.equal(referenceIsInContext(base, project, null), false)
})
test("enforces six-reference limit", () => {
  assert.equal(mediaReferencesSchema.safeParse(Array(7).fill(base)).success, false)
})
test("rejects duplicate reference IDs in shots and cloud libraries", () => {
  assert.equal(mediaReferencesSchema.safeParse([base, base]).success, false)
  assert.equal(referenceLibrarySchema.safeParse([base, base]).success, false)
})
test("cloud library accepts several scenes but caps total size", () => {
  const many = Array.from({ length: 121 }, (_, index) => ({ ...base, id: `123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}` }))
  assert.equal(referenceLibrarySchema.safeParse(many.slice(0, 7)).success, true)
  assert.equal(referenceLibrarySchema.safeParse(many).success, false)
})
test("never silently passes unsupported media to video provider", () => {
  for (const mediaType of ["audio", "video"]) {
    assert.ok(referenceCompatibility([{ ...base, target: "provider", mediaType }]).length)
  }
  assert.equal(referenceCompatibility([{ ...base, target: "provider" }]).length, 0)
  assert.ok(referenceCompatibility([{ ...base, target: "provider" }, { ...base, target: "provider" }]).length)
})
test("requires director analysis; unapplied references do not affect generation", () => {
  assert.ok(referenceCompatibility([{ ...base, analysis: undefined }]).length)
  assert.equal(referenceCompatibility([{ ...base, applied: false, analysis: undefined }]).length, 0)
  assert.equal(referencePrompt([{ ...base, applied: false }]), "")
})
test("warns about competing primary roles", () => {
  assert.equal(referenceConflicts([base, base]).length, 1)
  assert.equal(referenceConflicts([base, { ...base, priority: "supporting" }]).length, 0)
})
test("guidance is ordered, role-specific and does not mutate snapshots", () => {
  const refs = [{ ...base, priority: "supporting", role: "lighting" }, base]
  const before = JSON.stringify(refs)
  assert.ok(referencePrompt(refs).startsWith("wardrobe ONLY"))
  assert.equal(JSON.stringify(refs), before)
  assert.equal(referencePrompt([{ ...base, target: "provider" }]), "")
})
test("rejects prompt overflow rather than silently dropping reference or duration instructions", () => {
  assert.equal(referencePromptFits("A slow tracking shot", [base]), true)
  assert.equal(referencePromptFits("x".repeat(1100), [base]), false)
})

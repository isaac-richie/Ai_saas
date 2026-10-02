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
const { mediaReferenceSchema, mediaReferencesSchema, referenceLibrarySchema, referenceCompatibility, referenceConflicts, referenceIsInContext, referencePrompt, referencePromptBudget, referencePromptFits, validateOwnedReferences } = module.exports
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
test("analysis is optional: unanalysed images apply, are labelled honestly, and unapplied references stay inert", () => {
  const unanalysed = { ...base, analysis: undefined, analysisUnavailable: true }
  assert.equal(mediaReferenceSchema.safeParse(unanalysed).success, true)
  assert.equal(referenceCompatibility([unanalysed]).length, 0, "no analysis or manual text is required")
  assert.match(referencePrompt([unanalysed]), /^wardrobe\/primary\/high \(unanalysed\): image not analysed; no visual details inferred/)
  assert.equal(referenceCompatibility([{ ...base, analysis: undefined, manualGuidance: "Keep the red coat." }]).length, 0)
  assert.match(referencePrompt([{ ...base, analysis: undefined, manualGuidance: "Keep the red coat." }]), /\(manual\): Keep the red coat\./)
  assert.equal(referenceCompatibility([{ ...base, applied: false, analysis: undefined }]).length, 0)
  assert.equal(referencePrompt([{ ...base, applied: false }]), "")
})
test("continuing without analysis routes each media type to where it can actually help", () => {
  const { continueWithoutAnalysisTarget } = module.exports
  const image = { ...base, applied: false, analysis: undefined }
  assert.equal(continueWithoutAnalysisTarget(image, [image]), "provider", "a free starting frame is used by the unanalysed image")
  const frame = { ...base, id: "123e4567-e89b-42d3-a456-426614174099", target: "provider", applied: true }
  assert.equal(continueWithoutAnalysisTarget(image, [frame, image]), "director", "never displace an existing starting frame")
  assert.equal(continueWithoutAnalysisTarget(image, [{ ...frame, applied: false }, image]), "provider", "unapplied frames do not hold the slot")
  assert.equal(continueWithoutAnalysisTarget({ ...image, target: "provider" }, [frame, image]), "provider", "a user-chosen direct image stays direct")
  for (const mediaType of ["video", "audio"]) assert.equal(continueWithoutAnalysisTarget({ ...image, mediaType }, [image]), "director")
  const applied = { ...image, applied: true, target: continueWithoutAnalysisTarget(image, [image]) }
  assert.equal(referenceCompatibility([applied]).length, 0)
  assert.equal(referencePrompt([applied]), "", "a starting-frame image adds no text to the prompt budget")
  const second = { ...image, id: "123e4567-e89b-42d3-a456-426614174098" }
  const secondApplied = { ...second, applied: true, target: continueWithoutAnalysisTarget(second, [applied, second]) }
  assert.equal(referenceCompatibility([applied, secondApplied]).length, 0, "two unanalysed images never trip the one-direct-image rule")
})
test("every unanalysed media type continues with a role-specific, budget-safe fallback", () => {
  const cases = [["image", "wardrobe"], ["video", "camera movement"], ["audio", "voiceover"], ["audio", "dialogue"], ["audio", "music"], ["audio", "effects"], ["audio", "ambience"], ["audio", "timing"]]
  const refs = cases.slice(0, 6).map(([mediaType, role], index) => ({ ...base, id: `123e4567-e89b-42d3-a456-4266141741${10 + index}`, mediaType, role, analysis: undefined, analysisUnavailable: true, priority: "secondary", ...(mediaType === "image" ? {} : { duration: 9, trimStart: 0, trimEnd: 9 }) }))
  assert.equal(referenceCompatibility(refs).length, 0)
  const prompt = referencePrompt(refs)
  assert.equal(prompt.split("; ").length >= 6, true)
  assert.doesNotMatch(prompt, /undefined/)
  assert.equal(referencePromptFits("A courier walks through rain at dusk.", refs), true, "six unanalysed references still fit the adapter budget")
})
test("warns about competing primary roles", () => {
  assert.equal(referenceConflicts([base, base]).length, 1)
  assert.equal(referenceConflicts([base, { ...base, priority: "supporting" }]).length, 0)
})
test("guidance is ordered, role-specific and does not mutate snapshots", () => {
  const refs = [{ ...base, priority: "supporting", role: "lighting" }, base]
  const before = JSON.stringify(refs)
  assert.ok(referencePrompt(refs).startsWith("wardrobe/primary/high:"))
  assert.equal(JSON.stringify(refs), before)
  assert.equal(referencePrompt([{ ...base, target: "provider" }]), "")
})
test("manual fallback guidance reaches the generation prompt and is identified as manual", () => {
  const manual = { ...base, mediaType: "audio", role: "voiceover", duration: 9, trimStart: 0, trimEnd: 9, analysis: undefined, analysisUnavailable: true, manualGuidance: "Use a calm, reassuring narration; do not sync lips." }
  assert.equal(mediaReferenceSchema.safeParse(manual).success, true)
  assert.equal(referenceCompatibility([manual]).length, 0)
  const prompt = referencePrompt([manual])
  assert.match(prompt, /\(manual\)/)
  assert.match(prompt, /Use a calm, reassuring narration/)
  assert.equal(referencePrompt([{ ...manual, applied: false }]), "")
})
test("continue-without-analysis accepts audio and video with conservative role-specific prompt fallbacks", () => {
  const audio = { ...base, mediaType: "audio", role: "voiceover", duration: 9, trimStart: 0, trimEnd: 9, analysis: undefined, manualGuidance: undefined }
  const video = { ...base, mediaType: "video", role: "camera movement", duration: 9, trimStart: 0, trimEnd: 9, analysis: undefined, manualGuidance: undefined }
  assert.equal(referenceCompatibility([audio]).length, 0)
  assert.equal(referenceCompatibility([video]).length, 0)
  assert.match(referencePrompt([audio]), /no transcript or voice identity inferred/)
  assert.match(referencePrompt([video]), /follow only written shot direction/)
})
test("rejects prompt overflow rather than silently dropping reference or duration instructions", () => {
  assert.equal(referencePromptFits("A slow tracking shot", [base]), true)
  assert.equal(referencePromptFits("x".repeat(1100), [base]), false)
  const budget = referencePromptBudget("A slow tracking shot", [base])
  assert.equal(budget.limit, 1100)
  assert.equal(budget.overflow, 0)
})
test("ffmpeg-static stays external so its binary path is not rewritten to a /ROOT placeholder", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8")
  assert.match(config, /serverExternalPackages:\s*\[[^\]]*"ffmpeg-static"/)
  assert.match(config, /"\/api\/media\/references\/analyse": \["\.\/node_modules\/ffmpeg-static\/ffmpeg"\]/)
})

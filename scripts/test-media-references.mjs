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
const { mediaReferenceSchema, mediaReferencesSchema, referenceLibrarySchema, referenceCompatibility, referenceConflicts, referenceIsInContext, referencePrompt, referencePromptBudget, referencePromptFits, validateOwnedReferences, labelReferences, resolveLockedRoles, referenceRoles, withRoles, MAX_REFERENCES } = module.exports
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
const uid = (index) => `123e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`
test("enforces the ten-reference limit: ten pass, an eleventh is refused", () => {
  assert.equal(MAX_REFERENCES, 10)
  const ten = Array.from({ length: 10 }, (_, index) => ({ ...base, id: uid(index) }))
  assert.equal(mediaReferencesSchema.safeParse(ten).success, true)
  assert.equal(mediaReferencesSchema.safeParse([...ten, { ...base, id: uid(10) }]).success, false)
  assert.equal(referenceCompatibility(ten).length, 0)
  assert.ok(referenceCompatibility([...ten, { ...base, id: uid(10) }]).length)
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
  assert.match(referencePrompt([unanalysed]), /^@image1 defines wardrobe \(clothing and accessories\) ONLY, not its background \(unanalysed\): image not analysed; no visual details inferred/)
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
  assert.ok(referencePrompt(refs).startsWith("@image2 defines wardrobe"), "primary first, tagged by panel order")
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

// ─── Auto-fit instead of refusing to generate ─────────────────────────────
const { fitReferencePrompt } = module.exports
const refId = n => `123e4567-e89b-42d3-a456-4266141742${String(n).padStart(2, "0")}`
const directed = (n, priority, guidance, extra = {}) => ({ ...base, id: refId(n), name: `ref-${n}.png`, priority, influence: "medium", analysis: { guidance, observations: ["x"], warnings: [], limitations: "y" }, ...extra })
const sentence = (word, count) => Array.from({ length: count }, (_, i) => `${word} detail ${i} stays exactly as shown.`).join(" ")

test("reproduces an 877-character overflow and fits without blocking", () => {
  const subject = sentence("Courier", 18).slice(0, 700)
  const refs = [directed(1, "primary", sentence("Coat", 6).slice(0, 240)), directed(2, "secondary", sentence("Street", 6).slice(0, 240)), directed(3, "secondary", sentence("Lamp", 6).slice(0, 240)), directed(4, "supporting", sentence("Rain", 6).slice(0, 240)), { ...directed(5, "supporting", ""), analysis: undefined, manualGuidance: sentence("Mood", 12).slice(0, 500) }]
  assert.ok(referencePromptBudget(subject, refs).overflow > 800, "scenario really is ~877 over")
  const fit = fitReferencePrompt(subject, refs)
  assert.equal(referencePromptFits(fit.subject, fit.references), true)
  assert.ok(fit.notes.length > 0, "the user is told what changed")
  assert.equal(fit.subject, subject.replace(/\s+/g, " ").trim(), "directions absorb the cut before the creator's prompt")
  assert.ok(fit.references.find(ref => ref.id === refId(1)).applied, "the primary reference stays in the prompt")
})

test("fitting is a no-op when the prompt already fits", () => {
  const refs = [directed(1, "primary", "Keep the red coat.")]
  const fit = fitReferencePrompt("A courier walks through rain at dusk.", refs)
  assert.equal(fit.notes.length, 0)
  assert.equal(fit.subject, "A courier walks through rain at dusk.")
  assert.equal(JSON.stringify(fit.references), JSON.stringify(refs))
})

test("least important directions are condensed first and primaries last", () => {
  const long = sentence("Detail", 8).slice(0, 240)
  const refs = [directed(1, "primary", long), directed(2, "supporting", long), directed(3, "secondary", long)]
  const subject = "x ".repeat(330).trim()
  const fit = fitReferencePrompt(subject, refs)
  const guidance = id => fit.references.find(ref => ref.id === refId(id)).analysis.guidance
  assert.equal(referencePromptFits(fit.subject, fit.references), true)
  assert.ok(guidance(2).length <= guidance(1).length, "supporting is cut at least as hard as primary")
  assert.ok(guidance(1).length >= guidance(3).length)
})

test("lower-priority references leave the text before the creator's prompt is cut; files stay attached", () => {
  const big = sentence("Detail", 8).slice(0, 240)
  const refs = Array.from({ length: 6 }, (_, i) => directed(i + 1, i === 0 ? "primary" : i < 3 ? "secondary" : "supporting", big))
  const subject = sentence("Courier", 30).slice(0, 900)
  const fit = fitReferencePrompt(subject, refs)
  assert.equal(referencePromptFits(fit.subject, fit.references), true)
  assert.equal(fit.references.length, 6, "no reference is removed from the list")
  assert.ok(fit.references.find(ref => ref.id === refId(1)).applied, "primary kept")
  assert.ok(fit.notes.some(note => /files? stays? attached/.test(note)))
})

test("a shot prompt that alone exceeds the limit is shortened at a sentence boundary", () => {
  const subject = sentence("Courier", 60).slice(0, 1200)
  const fit = fitReferencePrompt(subject, [])
  assert.equal(referencePromptFits(fit.subject, []), true)
  assert.ok(subject.startsWith(fit.subject.replace(/…$/, "")), "shortening keeps the opening of the prompt")
  assert.match(fit.subject, /[.…]$/)
  assert.ok(fit.notes.some(note => /Shortened your shot prompt by \d+ characters/.test(note)))
})

test("direct starting-frame images are never touched by fitting", () => {
  const frame = { ...base, id: refId(9), target: "provider", applied: true }
  const fit = fitReferencePrompt(sentence("Courier", 60).slice(0, 1200), [frame, directed(1, "secondary", sentence("Coat", 8).slice(0, 240))])
  const kept = fit.references.find(ref => ref.id === refId(9))
  assert.equal(kept.applied, true)
  assert.equal(kept.target, "provider")
})

test("fitting never mutates the caller's references and is deterministic", () => {
  const refs = [directed(1, "secondary", sentence("Coat", 8).slice(0, 240)), { ...directed(2, "supporting", ""), analysis: undefined, manualGuidance: sentence("Mood", 12).slice(0, 500) }]
  const before = JSON.stringify(refs)
  const subject = sentence("Courier", 30).slice(0, 950)
  const first = fitReferencePrompt(subject, refs)
  assert.equal(JSON.stringify(refs), before)
  assert.equal(JSON.stringify(fitReferencePrompt(subject, refs)), JSON.stringify(first), "browser and server compute the same fit")
})

test("fuzz: any prompt and reference mix always fits after fitting", () => {
  let seed = 7
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const priorities = ["primary", "secondary", "supporting"]
  for (let run = 0; run < 400; run += 1) {
    const refs = Array.from({ length: Math.floor(rand() * 7) }, (_, i) => {
      const priority = priorities[Math.floor(rand() * 3)]
      const kind = rand()
      if (kind < 0.33) return directed(i + 1, priority, sentence("A", 10).slice(0, 1 + Math.floor(rand() * 239)))
      if (kind < 0.66) return { ...directed(i + 1, priority, ""), analysis: undefined, manualGuidance: sentence("M", 20).slice(0, 1 + Math.floor(rand() * 499)) }
      return { ...directed(i + 1, priority, ""), analysis: undefined, mediaType: "audio", role: "voiceover", duration: 9, trimStart: 0, trimEnd: 9 }
    })
    const subject = sentence("S", 60).slice(0, 3 + Math.floor(rand() * 1197))
    const fit = fitReferencePrompt(subject, refs)
    assert.equal(referencePromptFits(fit.subject, fit.references), true, `run ${run} must fit`)
    assert.ok(fit.subject.length >= Math.min(60, subject.trim().length) - 1, `run ${run} keeps a usable prompt`)
    assert.equal(fit.references.length, refs.length, `run ${run} keeps every reference attached`)
  }
})

test("generation no longer refuses on prompt length on either side", () => {
  const action = readFileSync(new URL("../src/core/actions/fast-video.ts", import.meta.url), "utf8")
  const studio = readFileSync(new URL("../src/interface/components/fast-video/FastVideoStudio.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(action, /nothing was dropped/)
  assert.doesNotMatch(studio, /nothing was dropped/)
  assert.match(action, /fitReferencePrompt\(payload\.prompt_inputs\.text_subject, /)
  assert.match(studio, /fitReferencePrompt\(/)
})

test("primary references outrank the prompt's tail: the prompt is shortened before a primary leaves the text", () => {
  const refs = [directed(1, "primary", sentence("Coat", 8).slice(0, 240)), directed(2, "primary", sentence("Face", 8).slice(0, 240))]
  const fit = fitReferencePrompt(sentence("Courier", 60).slice(0, 1200), refs)
  assert.equal(referencePromptFits(fit.subject, fit.references), true)
  assert.ok(fit.references.every(ref => ref.applied), "both primaries stay in the prompt")
  assert.ok(fit.notes.some(note => /Shortened your shot prompt/.test(note)))
})

test("fit notices count each condensed reference once and keep long file names readable", () => {
  const longName = "ElevenLabs_2026-07-31T18_03_04_new girl_gen_sp100_s50_sb75_v3.mp3"
  const big = sentence("Detail", 8).slice(0, 240)
  const refs = [
    directed(1, "primary", big), directed(2, "secondary", big, { name: "chrono.png" }), directed(3, "secondary", big, { name: "arc.png" }),
    directed(4, "supporting", big, { name: longName }), directed(5, "supporting", big, { name: "a1761a62dc1e4becbe3fdf7ef950d9b0.mp4" }), directed(6, "supporting", big),
  ]
  const fit = fitReferencePrompt(sentence("Courier", 40).slice(0, 1000), refs)
  const condensedNote = fit.notes.find(note => note.startsWith("Condensed"))
  const count = Number(condensedNote.match(/Condensed (\d+)/)[1])
  assert.ok(count <= refs.length, `counted ${count} for ${refs.length} references`)
  const notice = fit.notes.join(" ")
  assert.doesNotMatch(notice, /sp100_s50_sb75/, "long file names are shortened")
  assert.ok(notice.length < 260, "the whole notice stays toast-sized")
  assert.match(notice, /and \d+ more references?/)
})

// The module runs in its own VM realm, so compare array contents, not prototypes.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message)
test("multi-role: one asset can hold several roles; they validate, save and reload", () => {
  const both = withRoles(base, ["character", "location"])
  same(referenceRoles(both), ["character", "location"])
  assert.equal(both.role, "character", "primary role follows the first selection")
  const parsed = mediaReferenceSchema.safeParse(JSON.parse(JSON.stringify(both)))
  assert.equal(parsed.success, true)
  same(parsed.data.roles, ["character", "location"])
  same(referenceRoles(base), ["wardrobe"], "older single-role references still read")
  assert.equal(mediaReferenceSchema.safeParse({ ...base, roles: ["character", "voiceover"], role: "character" }).success, false, "roles must fit the media type")
  assert.equal(mediaReferenceSchema.safeParse({ ...base, roles: ["character", "character"], role: "character" }).success, false, "no duplicate roles")
  assert.equal(mediaReferenceSchema.safeParse({ ...base, roles: ["character", "location"], role: "location" }).success, false, "primary must match")
})
test("role isolation: each reference controls only its roles; subject-only images drop their background", () => {
  const refs = labelReferences([
    { ...base, id: uid(1), role: "character", analysis: { ...base.analysis, guidance: "Dark-haired woman, freckles." } },
    { ...base, id: uid(2), role: "wardrobe" },
    withRoles({ ...base, id: uid(3), analysis: { ...base.analysis, guidance: "Neon alley." } }, ["character", "location"]),
  ])
  const prompt = referencePrompt(refs)
  assert.match(prompt, /@image1 defines character \(face, body and anatomy\) ONLY, not its background: Dark-haired woman/)
  assert.match(prompt, /@image2 defines wardrobe \(clothing and accessories\) ONLY, not its background/)
  assert.match(prompt, /@image3 defines character \(face, body and anatomy\) and location \(setting and architecture\) ONLY: Neon alley/)
  assert.doesNotMatch(prompt.split("@image3")[1], /not its background/, "a location role keeps the background")
})
test("labels follow the full panel order per type, so removing one re-derives the rest", () => {
  const video = { ...base, id: uid(5), mediaType: "video", role: "pacing", duration: 10, trimStart: 0, trimEnd: 5 }
  const labelled = labelReferences([{ ...base, id: uid(1) }, video, { ...base, id: uid(2), applied: false }, { ...base, id: uid(3) }])
  same(labelled.map((ref) => ref.label), ["@image1", "@video1", "@image2", "@image3"])
  // Filtering to applied after labelling keeps the creator's tags.
  same(labelled.filter((ref) => ref.applied).map((ref) => ref.label), ["@image1", "@video1", "@image3"])
  assert.ok(labelled.every((ref) => mediaReferenceSchema.safeParse(ref).success))
})
test("unapplied references never reach the prompt", () => {
  const refs = labelReferences([{ ...base, id: uid(1), applied: false }, { ...base, id: uid(2) }])
  const prompt = referencePrompt(refs.filter((ref) => ref.applied))
  assert.doesNotMatch(prompt, /@image1/)
  assert.match(prompt, /@image2/)
})
test("a continuity lock beats an unlocked reference on the same channel", () => {
  const a = withRoles({ ...base, id: uid(1) }, ["character", "location"])
  const b = { ...base, id: uid(2), role: "character" }
  const c = { ...base, id: uid(3), role: "character" }
  const resolved = resolveLockedRoles([a, b, c], { character: uid(2) })
  same(referenceRoles(resolved[0]), ["location"], "a keeps only its unlocked role")
  assert.equal(resolved[0].role, "location")
  same(referenceRoles(resolved[1]), ["character"], "the locked reference keeps the role")
  assert.equal(resolved[2].applied, false, "a reference left with no role sits this one out")
  same(resolveLockedRoles([a], {}), [a], "no locks, no change")
})

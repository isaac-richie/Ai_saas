import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

// Pure module with no imports; the real lock-manifest check, never a stub.
const longFormLocksModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/core/services/long-form-locks.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: longFormLocksModule, exports: longFormLocksModule.exports })


// The real avoid-clause helper (no imports of its own), so provider tests follow its rules.
const avoidClauseModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/core/utils/ai/avoid-clause.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: avoidClauseModule, exports: avoidClauseModule.exports })


// Pure config with no imports; the real model ranges, never a stub.
const kieModelsModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/core/config/kie-video-models.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: kieModelsModule, exports: kieModelsModule.exports })
const kieModels = kieModelsModule.exports

const source = readFileSync(new URL("../src/infrastructure/ai/providers/kie.provider.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const module = { exports: {} }
const requireMock = (id) => {
  if (id === "../base.provider") return { BaseProvider: class { constructor(config) { this.config = config } } }
  if (id === "./kie.models") return {
    DEFAULT_KIE_IMAGE_MODEL: "nano-banana-pro",
    DEFAULT_KIE_VIDEO_MODEL_I2V: "kling-3.0/video",
    DEFAULT_KIE_VIDEO_MODEL_T2V: "kling/v2-5-turbo-text-to-video-pro",
    inferKieOutputType: () => "video",
    currentKieModel: (model) => model,
  }
  if (id === "@/core/utils/ai/avoid-clause") return avoidClauseModule.exports
    if (id === "@/core/utils/ai/error-normalization") return { normalizeGenerationError: (message) => message }
  if (id === "@/core/config/kie-video-models") return kieModels
  if (id === "@/core/services/long-form-locks") return longFormLocksModule.exports
  throw new Error(`Unexpected import: ${id}`)
}
vm.runInNewContext(compiled, { module, exports: module.exports, require: requireMock })
const provider = new module.exports.KieProvider({ apiKey: "test" })

test("adversarial tag matrix never leaves a binding without a matching element", () => {
  const tags = ["@image1", "@@image1", "@@@element_dog", "@reference_set_1", "@@reference_set_1", "@reference_set_4", "@audio1", "@video1", "@IMAGE1", "(@image1),@image2", "person@example.com"]
  for (let count = 0; count <= 5; count++) {
    for (const imageCount of [0, 1, 2, 3, 4, 5]) {
      for (const tag of tags) {
        const elements = Array.from({ length: count }, (_, i) => ({ name: `reference_set_${i + 1}`, description: "character", image_urls: Array.from({ length: imageCount }, (_, j) => `https://example.com/${j}.png`) }))
        const request = { prompt: `Scene ${tag} walks. ${tag}`, output_type: "video", reference_elements: elements }
        const before = JSON.stringify(request)
        const input = provider.buildMarketInput(request, "kling-3.0/video")
        const names = new Set((input.kling_elements || []).map(element => element.name))
        for (const match of input.prompt.matchAll(/@([\w-]+)/g)) assert.ok(names.has(match[1]), `unbound ${match[0]}: ${count} elements, ${imageCount} images, ${tag}`)
        assert.equal(JSON.stringify(request), before, "saved request must not mutate")
        assert.ok((input.kling_elements || []).length <= 3)
      }
    }
  }
})

test("Seedance retains its own reference syntax", () => {
  const input = provider.buildMarketInput({ prompt: "@image1 walks", output_type: "video", reference_image_urls: ["https://example.com/a.png"] }, "bytedance/seedance-2-5")
  assert.equal(input.prompt, "@image1 walks")
  assert.equal(input.reference_image_urls.length, 1)
})

test("Kling 3.0 single-shot request supplies required mode and references", () => {
  const input = provider.buildMarketInput({
    prompt: "A girl walks through an archive",
    image_prompt: "https://example.com/opening.png",
    reference_elements: [{
      name: "reference_set_1",
      description: "character and location",
      image_urls: ["https://example.com/character.png", "https://example.com/location.png"],
    }],
    output_type: "video",
    aspect_ratio: "16:9",
    duration_seconds: 5,
  }, "kling-3.0/video")

  assert.equal(input.mode, "pro")
  assert.equal(input.multi_shots, false)
  assert.equal(input.duration, "5")
  assert.equal(input.aspect_ratio, "16:9")
  assert.equal(input.sound, true)
  assert.deepEqual(Array.from(input.image_urls), ["https://example.com/opening.png"])
  assert.equal(input.kling_elements[0].name, "reference_set_1")
  assert.equal(input.kling_elements[0].element_input_urls.length, 2)
  assert.match(input.prompt, /@reference_set_1/)
})

test("Kling 3.0 text-only requests still specify a mode", () => {
  const input = provider.buildMarketInput({ prompt: "An empty street", output_type: "video", duration_seconds: 5 }, "kling-3.0/video")
  assert.equal(input.mode, "pro")
  assert.equal(input.multi_shots, false)
  assert.equal(input.image_urls, undefined)
})

test("studio reference labels cannot become unbound Kling roles", () => {
  const input = provider.buildMarketInput({ prompt: "@image1 defines character. @audio1 guides timing. @element_dog runs.", output_type: "video" }, "kling-3.0/video")
  assert.equal(input.prompt, "image1 defines character. audio1 guides timing. element_dog runs.")
  assert.equal(input.kling_elements, undefined)
})

test("only supplied valid element names keep their binding syntax", () => {
  const input = provider.buildMarketInput({ prompt: "@reference_set_1 follows @image2 and @element_dog.", output_type: "video", reference_elements: [{ name: "reference_set_1", description: "character", image_urls: ["https://example.com/a.png", "https://example.com/b.png"] }] }, "kling-3.0/video")
  assert.equal(input.prompt, "@reference_set_1 follows image2 and element_dog.")
  assert.equal(input.kling_elements[0].name, "reference_set_1")
})

test("discarded invalid elements cannot leave dangling bindings", () => {
  const input = provider.buildMarketInput({ prompt: "@reference_set_1 walks", output_type: "video", reference_elements: [{ name: "reference_set_1", description: "character", image_urls: ["https://example.com/a.png"] }] }, "kling-3.0/video")
  assert.equal(input.prompt, "reference_set_1 walks")
  assert.equal(input.kling_elements, undefined)
})

test("lip-sync avatar gets exactly the face image, the real audio and the acting prompt", () => {
  const input = provider.buildMarketInput({
    prompt: "She sings the chorus to camera, warm smile", output_type: "video",
    image_prompt: "https://example.com/face.png", audio_url: "https://example.com/line.wav",
    end_image_prompt: "https://example.com/end.png", negative_prompt: "blur", aspect_ratio: "16:9", reference_image_urls: ["https://example.com/a.png"],
  }, "kling/ai-avatar-pro")
  assert.deepEqual(Object.keys(input).sort(), ["audio_url", "image_url", "prompt"])
  assert.equal(input.image_url, "https://example.com/face.png")
  assert.equal(input.audio_url, "https://example.com/line.wav")
})

test("normal image-to-video is unchanged by the lip-sync route", () => {
  const kling = provider.buildMarketInput({ prompt: "A shot", output_type: "video", image_prompt: "https://example.com/f.png", audio_url: "https://example.com/x.wav" }, "kling-3.0/video")
  assert.equal(kling.audio_url, undefined, "video models never receive the lip-sync audio")
  assert.equal(JSON.stringify(kling.image_urls), JSON.stringify(["https://example.com/f.png"]))
  assert.equal(kling.mode, "pro")
  const seedance = provider.buildMarketInput({ prompt: "A shot", output_type: "video", image_prompt: "https://example.com/f.png" }, "bytedance/seedance-2-5")
  assert.equal(seedance.first_frame_url, "https://example.com/f.png")
  assert.equal(seedance.aspect_ratio, "adaptive")
})

test("images follow the chosen shape: GPT Image for 1:1, 3:2, 2:3; Nano Banana Pro for every other shape", () => {
  const route = (aspect, refs = []) => provider.resolveModel({ prompt: "x", output_type: "image", model: "gpt-image/1.5", aspect_ratio: aspect, reference_image_urls: refs })
  assert.equal(route("1:1"), "gpt-image/1.5-text-to-image")
  assert.equal(route("3:2"), "gpt-image/1.5-text-to-image")
  assert.equal(route("2:3", ["https://example.com/r.png"]), "gpt-image/1.5-image-to-image")
  assert.equal(route(undefined), "gpt-image/1.5-text-to-image", "no shape asked: keep GPT Image")
  for (const aspect of ["16:9", "9:16", "21:9", "4:5", "5:4", "4:3", "3:4"]) assert.equal(route(aspect), "nano-banana-pro", aspect)
  const nano = provider.buildMarketInput({ prompt: "x", output_type: "image", aspect_ratio: "9:16", reference_image_urls: ["https://example.com/r.png"] }, "nano-banana-pro")
  assert.equal(nano.aspect_ratio, "9:16", "the shape reaches Nano Banana Pro untouched")
  assert.equal(JSON.stringify(nano.image_input), JSON.stringify(["https://example.com/r.png"]))
})

test("the last guard never sends a prompt over a model's hard cap, and leaves short prompts alone", () => {
  const long = "She sings into the microphone. ".repeat(200)
  for (const [model, cap] of [["kling-3.0/video", 2500], ["gpt-image/1.5-text-to-image", 3000], ["kling/ai-avatar-pro", 1000], ["bytedance/seedance-2-5", 20000]]) {
    const out = module.exports.KieProvider.clampPrompt({ prompt: long.repeat(model.includes("seedance") ? 4 : 1), aspect_ratio: "16:9" }, model)
    assert.ok(out.prompt.length <= cap, `${model}: ${out.prompt.length} <= ${cap}`)
    assert.ok(out.prompt.endsWith("."), `${model}: ends on a sentence`)
    assert.equal(out.aspect_ratio, "16:9")
  }
  const short = { prompt: "A short prompt." }
  assert.equal(module.exports.KieProvider.clampPrompt(short, "kling-3.0/video"), short)
})

test("Seedance 2.5 receives reference videos only when no first frame is set", () => {
  const videos = ["https://example.com/v8.mp4"]
  assert.deepEqual(provider.buildMarketInput({ prompt: "Recreate @video1", output_type: "video", reference_video_urls: videos }, "bytedance/seedance-2-5").reference_video_urls, videos)
  assert.equal(provider.buildMarketInput({ prompt: "Recreate @video1", output_type: "video", image_prompt: "https://example.com/start.png", reference_video_urls: videos }, "bytedance/seedance-2-5").reference_video_urls, undefined)
  assert.equal(provider.buildMarketInput({ prompt: "Recreate @video1", output_type: "video", reference_video_urls: videos }, "kling-3.0/video").reference_video_urls, undefined)
})

// ── Continued Seedance shot with locked images: planner → provider payload, end to end ──────────
{
  const { planLockedRequest, resolveLocks, missingFromPayload } = longFormLocksModule.exports
  // Values built inside the vm sandbox are compared as plain data.
  const plain = (v) => JSON.parse(JSON.stringify(v))
  const base = "https://p.supabase.co/storage/v1/object/public/elements/uid/"
  const lastFrame = "https://p.supabase.co/storage/v1/object/public/renders/uid/inspections/s/t/frame-2.jpg"
  let n = 0
  const lock = (img, role, entity = "", scope = "shot") => ({
    scopeType: scope, shotNumber: scope === "shot" ? 2 : null, assetId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    assetUrl: `${base}${img}.png`, sha256: img.padEnd(64, "0").slice(0, 64), assetName: img, contentType: "image/png",
    byteSize: 400_000, width: 1024, height: 1024, role, entityLabel: entity, viewLabel: "",
  })
  // What production.ts builds for a continued shot whose plan uses reference mode.
  const send = (plan, aspect = "16:9") => provider.buildMarketInput({
    prompt: `Seamless continuation from reference image 1. A woman reads.\n${plan.promptNote}`, output_type: "video",
    image_prompt: undefined, end_image_prompt: undefined, aspect_ratio: aspect, duration_seconds: 10,
    reference_image_urls: plan.referenceImageUrls, required_inputs: plan.manifest.map(m => ({ field: m.field, url: m.assetUrl })),
  }, "bytedance/seedance-2-5")

  test("continued Seedance shot (the screenshot: 1 scene location + 1 shot image) reaches Kie whole", () => {
    const resolved = resolveLocks([lock("bible-location", "location", "Room", "scene")], [lock("gold-bible", "prop", "Bible")])
    assert.equal(resolved.requiredImageCount, 2)
    const planned = planLockedRequest(resolved, "bytedance/seedance-2-5", { continuityStartUrl: lastFrame })
    assert.ok(planned.ok, planned.issues?.join(" "))
    const input = send(planned.plan)
    assert.equal(input.first_frame_url, undefined, "a first frame never rides with references")
    assert.equal(input.last_frame_url, undefined)
    assert.deepEqual(plain(input.reference_image_urls), [lastFrame, `${base}bible-location.png`, `${base}gold-bible.png`])
    assert.deepEqual(plain(missingFromPayload(input, planned.plan.manifest.map(m => ({ field: m.field, url: m.assetUrl })))), [])
    assert.match(input.prompt, /reference image 1 is the previous shot's final frame.*reference image 2 is location Room.*reference image 3 is prop Bible/s)
    assert.equal(input.aspect_ratio, "16:9")
  })

  test("every lock count from 1 to 29 plus the last frame maps exactly; 30 is refused before Kie", () => {
    for (let count = 1; count <= 30; count++) {
      const locks = Array.from({ length: count }, (_, i) => lock(`p${count}-${i}`, i % 3 ? "prop" : "character", `E${i}`, i % 2 ? "scene" : "shot"))
      const planned = planLockedRequest(resolveLocks(locks.filter(l => l.scopeType === "scene"), locks.filter(l => l.scopeType === "shot")), "bytedance/seedance-2-5", { continuityStartUrl: lastFrame })
      if (count === 30) { assert.equal(planned.ok, false); continue }
      assert.ok(planned.ok, `${count}: ${planned.issues?.join(" ")}`)
      const input = send(planned.plan)
      assert.equal(input.reference_image_urls.length, count + 1)
      assert.equal(input.reference_image_urls[0], lastFrame)
      assert.equal(new Set(input.reference_image_urls).size, count + 1, "no image sent twice")
      assert.deepEqual(plain(missingFromPayload(input, planned.plan.manifest.map(m => ({ field: m.field, url: m.assetUrl })))), [], `${count} locks`)
    }
  })

  test("one image locked for two roles is sent once and both locks point at it", () => {
    const shared = [lock("sam", "character", "Sam"), { ...lock("sam", "wardrobe", "Sam"), assetId: undefined }]
    shared[1].assetId = shared[0].assetId
    const planned = planLockedRequest(resolveLocks([], shared), "bytedance/seedance-2-5", { continuityStartUrl: lastFrame })
    assert.ok(planned.ok, planned.issues?.join(" "))
    assert.deepEqual(plain(planned.plan.referenceImageUrls), [lastFrame, `${base}sam.png`])
    assert.deepEqual(plain([...new Set(planned.plan.manifest.map(m => m.field))]), ["reference_image_urls[1]"])
  })

  test("locked start frame + references still block on a continued shot (the creator asked for both)", () => {
    const planned = planLockedRequest(resolveLocks([], [lock("open", "start_frame"), lock("sam", "character", "Sam")]), "bytedance/seedance-2-5", { continuityStartUrl: lastFrame })
    assert.equal(planned.ok, false)
    assert.match(planned.issues.join(" "), /locked start or end frame/)
  })

  test("frames-only continued Seedance shot keeps the locked opening frame and adaptive shape", () => {
    const planned = planLockedRequest(resolveLocks([], [lock("close", "end_frame")]), "bytedance/seedance-2-5", { continuityStartUrl: lastFrame })
    assert.ok(planned.ok)
    assert.equal(planned.plan.continuityAsReference, false)
    const input = provider.buildMarketInput({ prompt: "x", output_type: "video", image_prompt: lastFrame, end_image_prompt: planned.plan.endFrameUrl, aspect_ratio: "4:5", required_inputs: planned.plan.manifest.map(m => ({ field: m.field, url: m.assetUrl })) }, "bytedance/seedance-2-5")
    assert.equal(input.first_frame_url, lastFrame)
    assert.equal(input.reference_image_urls, undefined)
    assert.equal(input.aspect_ratio, "adaptive")
    assert.deepEqual(plain(missingFromPayload(input, planned.plan.manifest.map(m => ({ field: m.field, url: m.assetUrl })))), [])
  })

  test("a tampered payload (continuity frame dropped, locks shifted) fails the final check", () => {
    const planned = planLockedRequest(resolveLocks([], [lock("a", "prop", "A"), lock("b", "prop", "B")]), "bytedance/seedance-2-5", { continuityStartUrl: lastFrame })
    const input = send({ ...planned.plan, referenceImageUrls: planned.plan.referenceImageUrls.slice(1) })
    assert.equal(missingFromPayload(input, planned.plan.manifest.map(m => ({ field: m.field, url: m.assetUrl }))).length, 2)
  })

  test("Seedance 2.5 shapes: accepted ones pass, 4:5 goes to the nearest accepted (3:4), junk to adaptive", () => {
    const { KieProvider } = module.exports
    for (const ok of ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"]) assert.equal(KieProvider.seedanceAspect(ok), ok)
    assert.equal(KieProvider.seedanceAspect("4:5"), "3:4")
    assert.equal(KieProvider.seedanceAspect("2.39:1"), "21:9")
    assert.equal(KieProvider.seedanceAspect("0:1"), "adaptive")
    assert.equal(KieProvider.seedanceAspect("wide"), "adaptive")
    const planned = planLockedRequest(resolveLocks([], [lock("a", "prop", "A")]), "bytedance/seedance-2-5", { continuityStartUrl: lastFrame })
    assert.equal(send(planned.plan, "4:5").aspect_ratio, "3:4")
    // Kling keeps the shape it was given.
    assert.equal(provider.buildMarketInput({ prompt: "x", output_type: "video", aspect_ratio: "16:9" }, "kling-3.0/video").aspect_ratio, "16:9")
  })
}

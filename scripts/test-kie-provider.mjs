import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

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
  }
  if (id === "@/core/utils/ai/error-normalization") return { normalizeGenerationError: (message) => message }
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

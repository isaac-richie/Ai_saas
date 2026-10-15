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

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

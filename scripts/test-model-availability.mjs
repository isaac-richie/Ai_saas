import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const load = (path, requireMock = () => { throw new Error("no imports expected") }) => {
  const compiled = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, { module, exports: module.exports, require: requireMock, process: { env: {} } })
  return module.exports
}

// Kie answered "The model name you specified is not supported" for these on 2026-10-17.
const RETIRED = ["qwen/qwen-image", "seedream/seedream-4.0", "flux/flux-2-0", "black-forest-labs/flux-1-1-pro", "flux-1.1-pro", "nano-banana", "kling-3.0"]

test("retired Kie slugs map to a model Kie still serves; live slugs pass through", () => {
  const models = load("../src/infrastructure/ai/providers/kie.models.ts")
  for (const slug of RETIRED) {
    const current = models.currentKieModel(slug)
    assert.notEqual(current, slug, `${slug} must be replaced`)
    assert.ok(!RETIRED.includes(current), `${slug} maps to a live model`)
  }
  assert.equal(models.currentKieModel("kling-3.0"), "kling-3.0/video")
  for (const live of ["kling-3.0/video", "bytedance/seedance-2-5", "nano-banana-pro", "gpt-image/1.5", "kling/ai-avatar-pro"]) {
    assert.equal(models.currentKieModel(live), live)
  }
  assert.equal(models.currentKieModel("dall-e-3"), "gpt-image/1.5", "an OpenAI model name never reaches Kie")
  assert.equal(models.currentKieModel("gpt-image-1.5"), "gpt-image/1.5")
  for (const entry of models.KIE_MODEL_CATALOG) assert.ok(!RETIRED.includes(entry.slug), `${entry.slug} is retired`)
})

test("OpenAI images use GPT Image, never the retired DALL·E 3 or another provider's slug", () => {
  const { OpenAIProvider } = load("../src/infrastructure/ai/providers/openai.provider.ts", (id) => {
    if (id === "../base.provider") return { BaseProvider: class { constructor(config) { this.config = config } } }
    if (id === "openai") return class {}
    if (id === "@/core/utils/ai/error-normalization") return { normalizeGenerationError: (message) => message }
    throw new Error(`Unexpected import: ${id}`)
  })
  assert.equal(OpenAIProvider.resolveModel(undefined), "gpt-image-1.5")
  assert.equal(OpenAIProvider.resolveModel("dall-e-3"), "gpt-image-1.5")
  assert.equal(OpenAIProvider.resolveModel("nano-banana-pro"), "gpt-image-1.5")
  assert.equal(OpenAIProvider.resolveModel("gpt-image-1"), "gpt-image-1")
  assert.doesNotMatch(read("../src/infrastructure/ai/providers/openai.provider.ts"), /"dall-e-3"/)
})

test("the Kie provider checks explicit and default models against the retired list", () => {
  const provider = read("../src/infrastructure/ai/providers/kie.provider.ts")
  assert.match(provider, /resolveImageVariant\(currentKieModel\(explicitModel\), request\)/)
  assert.match(provider, /resolveImageVariant\(currentKieModel\(DEFAULT_KIE_IMAGE_MODEL\), request\)/)
  assert.match(provider, /currentKieModel\(request\.image_prompt \? DEFAULT_KIE_VIDEO_MODEL_I2V : DEFAULT_KIE_VIDEO_MODEL_T2V\)/)
  assert.doesNotMatch(read("../src/interface/components/shots/ShotBuilder.tsx"), /qwen\/qwen-image|dall-e-3/, "no retired model in placeholders")
})

test("deleting a production removes the whole film: its original and every revision", () => {
  const action = read("../src/core/actions/production.ts")
  assert.match(action, /\(row\.parent_job_id as string \| null\) \|\| \(row\.id as string\)/, "each chosen row resolves to its original")
  assert.match(action, /id\.in\.\(\$\{roots\.join\(","\)\}\),parent_job_id\.in\.\(\$\{roots\.join\(","\)\}\)/, "original plus all revisions")
  assert.match(action, /return \{ data: \{ deleted: roots\.length, ids: targets \} \}/)
  const picker = read("../src/interface/components/fast-video/ProductionPicker.tsx")
  assert.match(picker, /onDeleted\(result\.data\.ids\)/, "the list drops every deleted revision")
  const desk = read("../src/interface/components/fast-video/ProductionDesk.tsx")
  assert.match(desk, /onDeleted=\{ids => \{ setJobs\(current => current\.filter\(job => !ids\.includes\(job\.id\)\)\)/)
})

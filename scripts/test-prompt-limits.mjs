import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const load = (path) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module, exports: module.exports, require: () => ({}) })
  return module.exports
}
const { promptBudgetFor, promptHardLimitFor, looksLikeJson, PROMPT_INTAKE_LIMIT } = load("../src/core/config/prompt-limits.ts")

test("each model gets its measured budget, always under the provider's hard cap", () => {
  const cases = [["kling-3.0/video", 2500], ["bytedance/seedance-2-5", 20000], ["kling/ai-avatar-pro", 1000], ["gpt-image/1.5-text-to-image", 3000], ["nano-banana-pro", 20000]]
  for (const [model, hard] of cases) {
    assert.equal(promptHardLimitFor(model), hard, model)
    assert.ok(promptBudgetFor(model) <= hard, `${model} budget under its hard cap`)
    assert.ok(promptBudgetFor(model) > 1100 || /avatar/.test(model), `${model} reads more than the old 1,100 budget`)
  }
  assert.equal(promptBudgetFor("kling/ai-avatar-pro"), 1000, "avatar is matched before the generic Kling rule")
  assert.equal(promptBudgetFor(undefined), 2440, "unknown model falls back to Kling's safe budget")
  assert.equal(PROMPT_INTAKE_LIMIT, 50000)
})

test("pasted JSON scene breakdowns are recognised; prose and broken JSON are not", () => {
  assert.equal(looksLikeJson('{"shot":"wide","camera":{"move":"dolly in"}}'), true)
  assert.equal(looksLikeJson('  [{"scene":1},{"scene":2}]  '), true)
  assert.equal(looksLikeJson("A singer on a stage {lights} up"), false)
  assert.equal(looksLikeJson('{"shot": "wide",'), false)
})

test("no feature still hard-cuts prompts to 600 or trims video prompts to a fixed 1,100", () => {
  const generation = readFileSync(new URL("../src/core/actions/generation.ts", import.meta.url), "utf8")
  assert.doesNotMatch(generation, /slice\(0, 597\)/, "Studio animation no longer cuts at 600 with an ellipsis")
  assert.match(generation, /fitPromptForModel\(basePrompt/)
  const fastVideo = readFileSync(new URL("../src/core/actions/fast-video.ts", import.meta.url), "utf8")
  assert.doesNotMatch(fastVideo, /trimPromptBySegments\(uniquePromptParts, 1100\)/)
  assert.match(fastVideo, /condensePrompt\(payload\.prompt_inputs\.text_subject/)
})

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("../src/core/utils/ai/prompt-budget.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { module, exports: module.exports })
const { trimPromptBySegments } = module.exports

test("keeps later critical directives when optional context exceeds the budget", () => {
  const prompt = trimPromptBySegments([
    "A complete subject and action description",
    `optional location ${"x".repeat(200)}`,
    "duration 10s",
    "16:9 landscape composition",
  ], 100)

  assert.match(prompt, /complete subject/)
  assert.match(prompt, /duration 10s/)
  assert.match(prompt, /16:9 landscape/)
  assert.doesNotMatch(prompt, /optional location/)
  assert.ok(prompt.length <= 100)
})

test("reserves room for critical directives when the subject alone is oversized", () => {
  const prompt = trimPromptBySegments([
    `subject ${"long description ".repeat(100)}`,
    "duration 10s",
    "16:9 landscape composition",
  ], 240)

  assert.match(prompt, /^subject/)
  assert.match(prompt, /duration 10s/)
  assert.match(prompt, /16:9 landscape/)
  assert.ok(prompt.length <= 240)
})

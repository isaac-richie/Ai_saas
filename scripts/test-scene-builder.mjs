import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const look = read("../src/interface/components/shots/LookBuilder.tsx")
const builder = read("../src/interface/components/shots/ShotBuilder.tsx")
const order = [...read("../src/core/utils/prompts/builder.ts").match(/PROMPT_ORDER = \[([\s\S]*?)\]/)[1].matchAll(/"([a-zA-Z]+)"/g)].map((match) => match[1])

test("the four look groups cover every Scene Builder category exactly once", () => {
  const grouped = [...look.matchAll(/categories: \[([^\]]*)\]/g)].flatMap((match) => [...match[1].matchAll(/"([a-zA-Z]+)"/g)].map((item) => item[1]))
  assert.equal(order.length, 11)
  assert.deepEqual([...grouped].sort(), [...order].sort())
  assert.equal(new Set(grouped).size, grouped.length, "no category appears twice")
})

test("aspect-ratio labels become drawable ratios", () => {
  const tree = ts.createSourceFile("l.tsx", look, ts.ScriptTarget.Latest, true)
  const fn = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "ratioFromLabel").getText(tree)
  const loaded = { exports: {} }
  vm.runInNewContext(ts.transpileModule(`${fn}\nmodule.exports = { ratioFromLabel }`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports })
  const { ratioFromLabel } = loaded.exports
  assert.equal(ratioFromLabel("2.39:1 Anamorphic"), "2.39:1")
  assert.equal(ratioFromLabel("4:3 Academy"), "4:3")
  assert.equal(ratioFromLabel("16 : 9"), "16:9")
  assert.equal(ratioFromLabel("Vertical"), null)
})

test("every category stays optional and selections are removable", () => {
  assert.match(look, /<LookChip label="Any" selected=\{!current\} onSelect=\{\(\) => onChange\(category, undefined\)\} muted \/>/)
  assert.match(look, /onChange\(category, current === option\.key \? undefined : option\.key\)/, "clicking a selected chip clears it")
  assert.match(look, /onClick=\{\(\) => onChange\(category, undefined\)\} title=\{`Remove/, "summary chips remove a choice")
  assert.match(look, /role="radiogroup" aria-label=\{labels\[category\]\}/)
  assert.match(look, /title=\{description\}/, "descriptors stay discoverable")
})

test("Scene Builder uses the look builder instead of eleven dropdowns, writing the same form fields", () => {
  assert.match(builder, /<LookBuilder/)
  assert.doesNotMatch(builder, /PROMPT_ORDER\.map\(\(category\) => \(\s*<FormField/)
  assert.match(builder, /form\.setValue\(category, key, \{ shouldDirty: true \}\)/)
  assert.match(builder, /QUICK_STYLE_PREVIEWS/)
})

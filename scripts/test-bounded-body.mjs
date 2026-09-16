import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("../src/core/utils/security/bounded-body.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { module, exports: module.exports, Buffer })
const { readBoundedBody, readBoundedBytes } = module.exports

test("reads a valid metadata request", async () => {
  assert.equal(await readBoundedBody(new Response('{"role":"music"}'), 64), '{"role":"music"}')
})
test("caps bytes rather than characters", async () => {
  await assert.rejects(readBoundedBody(new Response("\u00e9\u00e9"), 3), /too large/)
})
test("cancels oversized chunked streams", async () => {
  let cancelled = false
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)) },
    cancel() { cancelled = true },
  })
  await assert.rejects(readBoundedBytes({ body }, 10), /too large/)
  assert.equal(cancelled, true)
})
test("handles absent bodies and binary data", async () => {
  assert.equal((await readBoundedBytes({ body: null }, 2)).length, 0)
  assert.equal((await readBoundedBytes(new Response(new Uint8Array([0, 255])), 2)).toString("hex"), "00ff")
})

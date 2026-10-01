import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("../src/core/utils/security/media-runtime.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText

function runtime({ unavailable = [], env = { FFMPEG_PATH: "/custom/ffmpeg", FFPROBE_PATH: "/custom/ffprobe" } } = {}) {
  const calls = []
  const module = { exports: {} }
  const require = createRequire(import.meta.url)
  vm.runInNewContext(compiled, {
    module, exports: module.exports, process: { env }, console: { warn() {}, error() {} },
    require(name) {
      if (name === "node:child_process") return { execFile(binary, args, options, callback) {
        calls.push({ binary, args, options })
        callback(unavailable.includes(binary) ? Object.assign(new Error("private server path and diagnostic"), { code: "ENOENT" }) : null, "version", "")
      } }
      return require(name)
    },
  })
  return { ...module.exports, calls }
}

test("reference preflight checks configured FFmpeg with bounded runtime", async () => {
  const r = runtime()
  const signal = new AbortController().signal
  const resolved = await r.requireMediaRuntime(false, signal)
  assert.equal(r.calls.length, 1)
  assert.equal(r.calls[0].binary, "/custom/ffmpeg")
  assert.equal(resolved, "/custom/ffmpeg")
  assert.equal(r.calls[0].args[0], "-version")
  assert.equal(r.calls[0].options.timeout, 3000)
  assert.equal(r.calls[0].options.signal, signal)
})

test("FFmpeg resolves to the bundled binary when no deployment override is set", async () => {
  const r = runtime({ env: {} })
  const resolved = await r.requireMediaRuntime()
  assert.match(resolved, /ffmpeg-static.*ffmpeg$/)
  assert.equal(r.calls[0].binary, resolved)
})

test("a stale FFmpeg override falls back to the bundled binary before touching quotas", async () => {
  const r = runtime({ unavailable: ["/custom/ffmpeg"] })
  const resolved = await r.requireMediaRuntime()
  assert.match(resolved, /ffmpeg-static.*ffmpeg$/)
  assert.deepEqual(r.calls.map(call => call.binary), ["/custom/ffmpeg", resolved])
})

test("take inspection also requires FFprobe", async () => {
  const r = runtime()
  await r.requireMediaRuntime(true)
  assert.deepEqual(r.calls.map(call => call.binary), ["/custom/ffmpeg", "/custom/ffprobe"])
})

test("runtime failure exposes a safe typed message rather than process details", async () => {
  const r = runtime({ unavailable: ["/custom/ffmpeg", createRequire(import.meta.url)("ffmpeg-static"), "ffmpeg"] })
  await assert.rejects(r.requireMediaRuntime(), error => {
    assert.ok(error instanceof r.MediaRuntimeUnavailableError)
    assert.equal(error.message.includes("private server path"), false)
    return true
  })
})

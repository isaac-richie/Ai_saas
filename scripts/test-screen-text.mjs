import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("../src/core/utils/ai/screen-text.ts", import.meta.url), "utf8")
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module, exports: module.exports })
const { wantsOnScreenText, withNoScreenText, NO_SCREEN_TEXT_DIRECTIVE, SCREEN_TEXT_NEGATIVES } = module.exports

test("quoted lyrics and dialogue are heard, not written on screen", () => {
  const sung = 'She sings "First time I felt the light" into the mic, tears in her eyes'
  assert.equal(wantsOnScreenText(sung), false)
  const out = withNoScreenText(sung)
  assert.ok(out.includes(NO_SCREEN_TEXT_DIRECTIVE))
  assert.ok(out.includes("First time I felt the light"), "the line itself stays so the voice can sing it")
  assert.equal(withNoScreenText(out), out, "never added twice")
  assert.ok(SCREEN_TEXT_NEGATIVES.includes("subtitles") && SCREEN_TEXT_NEGATIVES.includes("captions"))
})

test("creators who ask for visible text keep it; 'no captions' still means no text", () => {
  for (const wants of ["Open on a title card that reads AMARA", "a neon sign reading OPEN", "lyric video with kinetic typography", "add subtitles in white"]) {
    assert.equal(wantsOnScreenText(wants), true, wants)
    assert.equal(withNoScreenText(wants), wants)
  }
  for (const none of ["no captions please", "without subtitles", "avoid on-screen text"]) assert.equal(wantsOnScreenText(none), false, none)
})

test("every video path applies the rule", () => {
  const fast = readFileSync(new URL("../src/core/actions/fast-video.ts", import.meta.url), "utf8")
  assert.match(fast, /if \(noScreenText\) parts\.push\(NO_SCREEN_TEXT_DIRECTIVE\)/)
  assert.ok(fast.indexOf("parts.push(NO_SCREEN_TEXT_DIRECTIVE)") < fast.indexOf("parts.push(...BASE_QUALITY_TOKENS)"), "early, so trimming can't drop it")
  assert.match(fast, /noScreenText \? SCREEN_TEXT_NEGATIVES/)
  assert.match(readFileSync(new URL("../src/core/actions/generation.ts", import.meta.url), "utf8"), /withNoScreenText\(await fitPromptForModel/)
  assert.match(readFileSync(new URL("../src/core/services/prompt-condenser.ts", import.meta.url), "utf8"), /never ask for on-screen text/)
})

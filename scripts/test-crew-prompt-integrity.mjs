import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/core/services/production-crew.ts', import.meta.url), 'utf8')
const tree = ts.createSourceFile('crew.ts', source, ts.ScriptTarget.Latest, true)
const names = new Set(['compileContinuityPrompt', 'normalizeCrewShots', 'compileCrewShotsForReview'])
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(tree)).join('\n')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(functions, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports })
const compile = editor => module.exports.compileCrewShotsForReview({}, editor)

test('review receives complete authored dialogue, camera and handoff without rewriting', () => {
  const prompt = 'Locked frontal medium. He says: "We were born to create, not destroy." End with the white megaphone at his lips.'
  const editor = { shots: [{ prompt, continuity: { startState: 'standing', endState: 'seated', carriedDetails: ['white prop'] } }, { prompt, continuity: { startState: 'different authored pose', endState: 'speaking', carriedDetails: ['white prop'] } }] }
  const before = JSON.stringify(editor)
  const shots = compile(editor)
  assert.equal(shots[0].prompt, prompt)
  assert.equal(shots[1].continuity.startState, 'different authored pose')
  assert.equal(JSON.stringify(editor), before)
})

test('oversized provider instructions are rejected instead of sliced', () => {
  assert.throws(() => compile({ shots: [{ prompt: 'x'.repeat(1001), continuity: null }] }), /exceeds/)
  assert.equal(compile({ shots: [{ prompt: 'x'.repeat(1000), continuity: null }] })[0].prompt.length, 1000)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const loaded = { exports: {} }
vm.runInNewContext(ts.transpileModule(read('../src/interface/components/fast-video/preset-order.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: loaded, exports: loaded.exports })
const { orderPresets } = loaded.exports
const ids = list => list.map(item => item.id).join(',')
const presets = 'abcdefghij'.split('').map(id => ({ id }))
const base = { pinnedIds: [], recentIds: [], selectedId: '', expanded: false, searching: false }

test('pinned presets lead, then recent in recency order, then the rest', () => {
  const ordered = orderPresets(presets, { ...base, pinnedIds: ['h', 'c'], recentIds: ['e', 'c', 'a'], expanded: true })
  assert.equal(ids(ordered), 'h,c,e,a,b,d,f,g,i,j')
})

test('collapsed view shows five but never hides the selected preset', () => {
  assert.equal(orderPresets(presets, base).length, 5)
  const withSelected = orderPresets(presets, { ...base, selectedId: 'j' })
  assert.equal(withSelected.length, 5)
  assert.ok(withSelected.some(item => item.id === 'j'))
  assert.equal(ids(orderPresets(presets, { ...base, selectedId: 'b' })), 'a,b,c,d,e', 'a visible selection is not duplicated')
})

test('searching and expanding show every match; empty selection is allowed', () => {
  assert.equal(orderPresets(presets, { ...base, searching: true }).length, 10)
  assert.equal(orderPresets(presets, { ...base, expanded: true }).length, 10)
  assert.equal(orderPresets([], base).length, 0)
  assert.equal(orderPresets(presets.slice(0, 3), { ...base, selectedId: 'zz' }).length, 3, 'unknown selection is ignored')
})

test('stale pinned or recent ids never create phantom presets', () => {
  const ordered = orderPresets(presets.slice(0, 3), { ...base, pinnedIds: ['gone'], recentIds: ['missing', 'b'], expanded: true })
  assert.equal(ids(ordered), 'b,a,c')
})

test('ordering never mutates the source presets', () => {
  const source = presets.map(item => ({ ...item }))
  const before = JSON.stringify(source)
  orderPresets(source, { ...base, pinnedIds: ['j'], recentIds: ['i'], selectedId: 'h' })
  assert.equal(JSON.stringify(source), before)
})

test('every preset family offers a "none" choice so presets are never mandatory', () => {
  const studio = read('../src/interface/components/fast-video/FastVideoStudio.tsx')
  const picker = read('../src/interface/components/fast-video/PresetPicker.tsx')
  assert.match(picker, /active=\{!selectedId\}[\s\S]{0,40}onSelect=\{\(\) => onSelect\(""\)\}/, 'None card selects an empty preset')
  assert.match(studio, /noneLabel="No style"/)
  assert.match(studio, /noneLabel="No motion"/)
  assert.match(studio, /applyStylePreset\(active \? "" : look\.stylePresetId\)/, 'an active quick look toggles off')
  assert.doesNotMatch(studio, /STYLE_PRESETS\.map\(\(preset\) => \(\s*<SelectItem/, 'duplicate style dropdown removed')
})

test('preset pickers are accessible radio groups', () => {
  const picker = read('../src/interface/components/fast-video/PresetPicker.tsx')
  assert.equal((picker.match(/role="radiogroup"/g) || []).length, 2)
  assert.match(picker, /role="radio"\s+aria-checked=\{active\}/)
  assert.match(picker, /aria-label=\{pinned \? `Unpin \$\{name\}` : `Pin \$\{name\}`\}/)
})

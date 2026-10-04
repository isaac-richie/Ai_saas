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
  const studio = read('../src/interface/components/fast-video/FastVideoStudio.tsx') + read('../src/interface/components/fast-video/ShotLookSection.tsx')
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

test('every style and motion preset has its own visual and a release-ready name', () => {
  const presets = read('../src/core/config/fast-video-presets.ts')
  const visuals = read('../src/interface/components/fast-video/preset-visuals.tsx')
  const ids = [...presets.matchAll(/id: "((?:style|motion)_[a-z0-9_]+)"/g)].map(match => match[1])
  assert.ok(ids.length >= 20)
  for (const id of ids) assert.match(visuals, new RegExp(`\\b${id}:`), `${id} needs a swatch or motion glyph`)
  for (const [, name] of presets.matchAll(/name: "([^"]+)"/g)) assert.doesNotMatch(name, /\bWIP\b|TODO|TBD/i, `"${name}" is not release-ready`)
})

test('the preset rail and grid both keep None first and selection obvious', () => {
  const picker = read('../src/interface/components/fast-video/PresetPicker.tsx')
  assert.match(picker, /preset-rail[^"]*snap-x/)
  assert.match(picker, /name=\{noneLabel\}[\s\S]{0,140}active=\{!selectedId\}/)
  assert.match(picker, /aria-label=\{`Clear \$\{label\.toLowerCase\(\)\}`\}/, 'a selected preset can be cleared in one click')
  assert.match(picker, /aria-expanded=\{expanded\}/)
})

test('free plan Fast Track allowance is raised to 10 and older writers cannot lower it', () => {
  const sql = read('../src/infrastructure/supabase/migrations/0033_fast_track_quota_10.sql')
  assert.match(sql, /jsonb_set\(features_json, '\{max_fast_video_generations\}', '10'::jsonb/)
  assert.match(sql, /update public\.entitlements[\s\S]*max_fast_video_generations = 10[\s\S]*plan_code = 'creator_free'/)
  assert.match(sql, /before insert or update on public\.entitlements/)
  assert.match(sql, /new\.max_fast_video_generations < 10 then\s+new\.max_fast_video_generations := 10/)
  assert.doesNotMatch(sql, /max_studio_generations/, 'only Fast Track changes')
})

test('free plan Fast Track allowance is raised to 20', () => {
  const sql = read('../src/infrastructure/supabase/migrations/0037_fast_track_quota_20.sql')
  assert.match(sql, /jsonb_set\(features_json, '\{max_fast_video_generations\}', '20'::jsonb/)
  assert.match(sql, /update public\.entitlements[\s\S]*max_fast_video_generations = 20[\s\S]*plan_code = 'creator_free'/)
  assert.match(sql, /new\.max_fast_video_generations < 20 then\s+new\.max_fast_video_generations := 20/)
  assert.doesNotMatch(sql, /max_studio_generations/, 'only Fast Track changes')
})

test('every template points at real presets and shows a real style image', () => {
  const templates = read('../src/core/config/fast-video-templates.ts')
  const presets = read('../src/core/config/fast-video-presets.ts')
  const visuals = read('../src/interface/components/fast-video/preset-visuals.tsx')
  const ids = [...templates.matchAll(/id: "([a-z0-9-]+)"/g)].map(match => match[1])
  assert.ok(ids.length >= 8)
  assert.equal(new Set(ids).size, ids.length, 'template ids are unique')
  for (const [, presetId] of templates.matchAll(/(?:stylePresetId|motionPresetId): "([a-z0-9_]+)"/g)) {
    assert.match(presets, new RegExp(`id: "${presetId}"`), `${presetId} must exist`)
  }
  for (const [, styleId] of templates.matchAll(/stylePresetId: "([a-z0-9_]+)"/g)) {
    assert.match(visuals, new RegExp(`${styleId}: "/presets/`), `${styleId} should have an example image for its template card`)
  }
})

test('applying a template can be undone and the model cards state real limits', () => {
  const studio = read('../src/interface/components/fast-video/FastVideoStudio.tsx')
  assert.match(studio, /label: "Undo",[\s\S]{0,120}setSubject\(before\.subject\)/)
  const pickers = read('../src/interface/components/fast-video/StudioPickers.tsx')
  assert.match(pickers, /Text-only shots: 5 or 10 s/)
  assert.match(pickers, /4 to 15 s/)
  assert.match(pickers, /frames\.start \? "Start \+ End frames" : "No frame control"/)
  assert.match(pickers, /role="radiogroup" aria-label="Video model"/)
})

test('public test period: free plan is unlimited and Studio is open by default', () => {
  const sql = read('../src/infrastructure/supabase/migrations/0040_free_plan_unlimited_testing.sql')
  assert.match(sql, /'max_fast_video_generations', null/)
  assert.match(sql, /max_studio_generations = null/)
  assert.match(sql, /new\.max_fast_video_generations := null/)
  assert.match(read('../src/core/config/feature-flags.ts'), /toBool\(process\.env\.NEXT_PUBLIC_STUDIO_ENABLED, true\)/)
  const gallery = read('../src/core/actions/gallery.ts')
  assert.match(gallery, /\.update\(\{ shot_id: createdShot\.id \}\)/, 'Move re-parents instead of copying')
  assert.doesNotMatch(gallery, /\(Moved\)/)
})

test('Scene Builder prompt can be generated in place or sent to Fast Track', () => {
  const builder = read('../src/interface/components/shots/ShotBuilder.tsx')
  assert.match(builder, /const shotId = await saveShot\(data\)[\s\S]*await generateShot\(shotId\)/)
  assert.match(builder, /"Generate image"/)
  assert.match(builder, /Enhance with AI/)
  assert.match(builder, /Undo enhance/, 'AI changes can be undone')
  assert.match(builder, /continuity_image_url: continuation\.imageUrl/, 'continued shots start from the approved image')
  assert.match(builder, /sessionStorage\.setItem\(FAST_TRACK_HANDOFF_KEY/)
  const studio = read('../src/interface/components/fast-video/FastVideoStudio.tsx')
  assert.match(studio, /sessionStorage\.removeItem\(FAST_TRACK_HANDOFF_KEY\)/, 'handoff is read once')
})

test('Scene Builder guided loop: references reach the image model and one image is the anchor', () => {
  const generation = read('../src/core/actions/generation.ts')
  assert.match(generation, /reference_image_urls: referenceImageUrls/, 'references are sent with image takes')
  assert.match(generation, /reference_image_urls: referenceImageUrls,\n\s*\}/, 'and logged on the take')
  assert.match(read('../src/infrastructure/ai/providers/kie.provider.ts'), /input\.image_input = request\.reference_image_urls\.slice\(0, 8\)/)
  const shots = read('../src/core/actions/shots.ts')
  assert.match(shots, /update\(\{ approved_take_id: optionId \}\)/, 'approved image becomes the shot anchor')
  const flow = read('../src/interface/components/shots/ShotFlowPanel.tsx')
  for (const label of ['Choose your image', 'Approve image', 'Regenerate', 'Edit shot', 'Animate this image', 'Add to sequence', 'Continue to next shot', 'Approve video']) {
    assert.ok(flow.includes(label), label)
  }
  assert.match(flow, /useSourceImage: true/, 'animation starts from the approved image')
})

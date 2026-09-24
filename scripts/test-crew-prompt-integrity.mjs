import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { z as settingsZod } from 'zod'
const settingsModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/core/validation/production-settings.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: settingsModule, exports: settingsModule.exports, require: () => ({ z: settingsZod }) })
const { productionShotSettingsSchema } = settingsModule.exports

const source = readFileSync(new URL('../src/core/services/production-crew.ts', import.meta.url), 'utf8')
const tree = ts.createSourceFile('crew.ts', source, ts.ScriptTarget.Latest, true)
const names = new Set(['compileContinuityPrompt', 'normalizeCrewShots', 'compileCrewShotsForReview', 'compileProductionPlan', 'compileContinuityNegativePrompt', 'clip'])
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(tree)).join('\n')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(functions, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, productionPlanSchema: { parse: value => value } })
const compile = editor => module.exports.compileCrewShotsForReview({}, editor)

const approvalSource = readFileSync(new URL('../src/core/validation/production-crew.ts', import.meta.url), 'utf8')
const approvalTree = ts.createSourceFile('production-crew-validation.ts', approvalSource, ts.ScriptTarget.Latest, true)
const approvalNames = new Set(['hasExecutableProviderPrompt', 'supportsRequestedTiming', 'canApproveProduction'])
const approvalFunctions = approvalTree.statements.filter(node => ts.isFunctionDeclaration(node) && approvalNames.has(node.name?.text)).map(node => node.getText(approvalTree)).join('\n')
const approvalModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(approvalFunctions, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: approvalModule, exports: approvalModule.exports, productionPlanSchema: { safeParse: value => ({ success: true, data: value }) } })

const errorModule = { exports: {} }
const errorSource = readFileSync(new URL('../src/core/services/production-crew.ts', import.meta.url), 'utf8')
const errorTree = ts.createSourceFile('crew-error.ts', errorSource, ts.ScriptTarget.Latest, true)
const errorFn = errorTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isRecoverableStructuredOutputError').getText(errorTree)
vm.runInNewContext(ts.transpileModule(errorFn, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: errorModule, exports: errorModule.exports })
test('malformed structured output is classified as safe to retry once', () => {
  assert.equal(errorModule.exports.isRecoverableStructuredOutputError(new SyntaxError('Expected comma')), true)
  assert.equal(errorModule.exports.isRecoverableStructuredOutputError(new Error('rate limit')), false)
})

const safeErrorFn = errorTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'safeCrewError').getText(errorTree)
const redactErrorFn = errorTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'redactCrewError').getText(errorTree)
const safeErrorModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(`${redactErrorFn}\n${safeErrorFn}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: safeErrorModule, exports: safeErrorModule.exports })
test('crew diagnostics preserve plain provider errors without leaking credentials', () => {
  assert.match(safeErrorModule.exports.safeCrewError({ code: 502, message: 'upstream failed' }), /502: upstream failed/)
  assert.match(safeErrorModule.exports.safeCrewError({ error: { message: 'Bearer secret failed' } }), /Bearer \[redacted\]/)
  assert.doesNotMatch(safeErrorModule.exports.safeCrewError({ message: 'sk-proj-secret failed' }), /sk-proj-secret/)
})

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

test('blocking crew notes cannot trap an executable plan before takes', () => {
  const plan = {
    deliverables: [
      { masterPrompt: 'Track the adult runner across the empty track, then hold on the finish line.', modelFamilyId: 'kling', durationSeconds: 10, continuityStartState: 'Runner waits at lane four.', continuityEndState: 'Runner crosses the finish line.' },
      { masterPrompt: 'Begin on the runner crossing the finish line, then settle into a calm close-up.', modelFamilyId: 'seedance', durationSeconds: 5, continuityStartState: 'Runner crosses the finish line.', continuityEndState: 'Runner takes a calm breath.' },
    ],
    crew: { version: 2, bible: { continuityLedger: { invariants: ['same runner'] } }, review: { findings: [{ severity: 'blocking', evidence: 'A department note is truncated.', correction: 'Rewrite the note.' }] } },
  }
  assert.equal(approvalModule.exports.canApproveProduction(plan), true)
  assert.equal(approvalModule.exports.canApproveProduction({ ...plan, deliverables: [{ ...plan.deliverables[0], masterPrompt: 'Track the runner across' }, plan.deliverables[1]] }), false)
})

const groupingModule = { exports: {} }
const groupingSource = readFileSync(new URL('../src/core/utils/production/latest-films.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(groupingSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: groupingModule, exports: groupingModule.exports })
test('film picker keeps latest lineage revision without merging separate films or mutating history', () => {
  const rows = [{ id: 'v4', parent_job_id: 'root', revision_number: 4 }, { id: 'other', revision_number: 1 }, { id: 'root', revision_number: 1 }, { id: 'v5', parent_job_id: 'root', revision_number: 5 }]
  const before = JSON.stringify(rows)
  const result = groupingModule.exports.latestFilms(rows)
  assert.equal(result.length, 2)
  assert.equal(result[0].id, 'v5')
  assert.equal(result[1].id, 'other')
  assert.equal(JSON.stringify(rows), before)
})

const revisionModule = { exports: {} }
const revisionSource = readFileSync(new URL('../src/core/utils/production/revision-context.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(revisionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: revisionModule, exports: revisionModule.exports })
const { buildRevisionContext, compactRevisionContext, revisionSaveError } = revisionModule.exports

test('repair stores complete large findings separately and never carries stale checkpoints', () => {
  const findings = Array.from({ length: 8 }, (_, i) => ({ shotNumber: i % 3 + 1, severity: 'blocking', evidence: 'e'.repeat(600), correction: 'c'.repeat(600) }))
  const previous = { revision: { directions: ['Keep the chair brown.'], findings: [] }, story: { stale: true }, editor: { stale: true }, stages: [{ role: 'shot-editor' }] }
  const before = JSON.stringify(previous)
  const context = buildRevisionContext(previous, 'Repair the complete dialogue.', findings)
  assert.ok(JSON.stringify(context).length < 5000)
  assert.equal(context.revision.findings.length, 3)
  assert.equal(context.revision.directions.join('|'), 'Repair the complete dialogue.')
  assert.equal(context.story, undefined)
  assert.equal(context.editor, undefined)
  assert.equal(JSON.stringify(previous), before)
  const retry = buildRevisionContext(context, 'Repair the complete dialogue.', [])
  assert.equal(retry.revision.directions.length, 1)
  assert.equal(retry.revision.findings.length, 0)
  const compact = compactRevisionContext(context)
  assert.equal(compact.directions.length, 1)
  assert.ok(compact.findings.every(finding => finding.evidence.length <= 420 && finding.correction.length <= 420))
})

test('only unique violations are described as revision conflicts', () => {
  assert.match(revisionSaveError('23505'), /same time/)
  assert.match(revisionSaveError('23514'), /validation/)
  assert.match(revisionSaveError('42501'), /permission/)
  assert.match(revisionSaveError('PGRST204'), /0025/)
  assert.doesNotMatch(revisionSaveError('08006'), /same time|migration/)
})

test('revision action saves a 4000-character brief unchanged with large repair notes', async () => {
  const { z } = await import('zod')
  const actionSource = readFileSync(new URL('../src/core/actions/production.ts', import.meta.url), 'utf8')
  const actionTree = ts.createSourceFile('production.ts', actionSource, ts.ScriptTarget.Latest, true)
  const actionCode = actionTree.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === 'createProductionRevision') ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(actionTree) === 'productionRevisionSchema'))
  ).map(node => node.getText(actionTree)).join('\n')
  const sourceJob = { id: 'f8a78482-293d-4de1-aa95-0914f1140a24', brief: 'b'.repeat(4000), revision_number: 1, status: 'awaiting_approval', planning_context: { shotSettings: [{ model: 'seedance', durationSeconds: 5 }, { model: 'kling', durationSeconds: 10 }, { model: 'seedance', durationSeconds: 5 }] }, reference_assets: [] }
  const findings = Array.from({ length: 8 }, () => ({ shotNumber: 1, severity: 'blocking', evidence: 'e'.repeat(600), correction: 'c'.repeat(600) }))
  let inserted
  let reads = 0
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: () => {
      const query = {
        select: () => query, eq: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: reads++ === 0 ? sourceJob : null }),
        insert: value => { inserted = value; return query },
        single: async () => ({ data: { ...inserted, id: 'saved' }, error: null }),
      }
      return query
    },
  }
  const actionModule = { exports: {} }
  vm.runInNewContext(ts.transpileModule(actionCode, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: actionModule, exports: actionModule.exports, z, productionShotSettingsSchema, isJsonObject: value => value && typeof value === "object" && !Array.isArray(value), createClient: async () => db,
    productionPlanSchema: { safeParse: () => ({ success: true, data: { crew: { review: { findings } } } }) },
    canApproveProduction: () => false, buildRevisionContext, revisionSaveError,
  })
  const result = await actionModule.exports.createProductionRevision({ productionId: sourceJob.id, direction: 'Repair the blocked shot.', repair: true })
  assert.equal(result.data.id, 'saved')
  assert.equal(inserted.brief, sourceJob.brief)
  assert.equal(inserted.brief.length, 4000)
  assert.equal(JSON.stringify(inserted.planning_context.shotSettings), JSON.stringify(sourceJob.planning_context.shotSettings))
  assert.equal(inserted.parent_job_id, sourceJob.id)
  assert.equal(inserted.revision_number, 2)
  assert.equal(inserted.planning_context.revision.findings.length, 1)
})

for (const failedRole of [null, 'story-director', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director', 'shot-editor', 'continuity-reviewer']) test(`crew pipeline resumes without repeating successful calls after ${failedRole || 'no failure'}`, async () => {
  const { z } = await import('zod')
  const runnerSource = readFileSync(new URL('../src/core/services/production-crew-runner.ts', import.meta.url), 'utf8')
  const revision = { directions: ['Preserve the exact dialogue.'], findings: [{ shotNumber: 2, severity: 'blocking', evidence: 'Dialogue cut short.', correction: 'Restore complete dialogue.' }] }
  const received = []
  let injected = false
  let job = { id: 'job', user_id: 'owner', brief: 'Make three connected shots.', status: 'brief', planning_stage: 'brief', planning_context: { revision, shotSettings: [{ model: 'seedance', durationSeconds: 5 }, { model: 'kling', durationSeconds: 10 }, { model: 'seedance', durationSeconds: 5 }] }, reference_assets: [] }
  const db = { from: () => {
    let update
    const filters = []
    const query = {
      update: value => { update = value; return query }, eq: (key, value) => { filters.push([key, value]); return query }, or: () => query, select: () => query,
      maybeSingle: async () => {
        if (filters.some(([key, value]) => job[key] !== value)) return { data: null, error: null }
        job = { ...job, ...update }
        return { data: job, error: null }
      },
      then: (resolve, reject) => query.maybeSingle().then(resolve, reject),
    }
    return query
  } }
  const mockRun = async (role, instruction, context) => {
    received.push({ role, context })
    if (role === failedRole && !injected) { injected = true; throw new Error('Simulated provider failure') }
    return { value: role === 'story-director' ? { continuityLedger: {} } : role === 'shot-editor' ? { shots: Array.from({ length: 3 }, () => ({ prompt: 'A complete shot.', continuity: {} })) } : {}, responseId: role }
  }
  const runnerModule = { exports: {} }
  vm.runInNewContext(ts.transpileModule(runnerSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: runnerModule, exports: runnerModule.exports, process: { env: {} }, console,
    require: name => {
      if (name === 'zod') return { z }
      if (name.endsWith('/validation/production-settings')) return { productionShotSettingsSchema }
      if (name.endsWith('/services/production-crew')) return { createCrewRunner: () => mockRun, compileCrewShotsForReview: () => [], compileProductionPlan: () => ({ ready: true }), safeCrewError: cause => cause instanceof Error ? cause.message : 'unknown' }
      if (name.endsWith('/validation/production-crew')) return { productionBibleSchema: z.any(), departmentDirectionSchema: z.any(), crewShotsSchema: z.any(), crewReviewSchema: z.object({ findings: z.array(z.any()) }) }
      if (name.endsWith('/ai/prompt-compliance')) return { enforcePromptCompliance: () => ({ blocked: false, flags: [] }) }
      if (name.endsWith('/validation/production-assets')) return { productionAssetsSchema: z.array(z.any()), ownsAssetUrl: () => true }
      if (name.endsWith('/utils/production/revision-context')) return { compactRevisionContext: value => value.revision }
      throw new Error(`Unexpected import ${name}`)
    },
  })
  let completed = false
  for (let i = 0; i < 9; i++) {
    const result = await runnerModule.exports.advanceProductionCrew(db, 'owner', 'job')
    if (result.error) {
      assert.ok(failedRole && injected)
      continue
    }
    assert.equal(result.error, undefined)
    assert.equal(JSON.stringify(job.planning_context.revision), JSON.stringify(revision))
    if (result.data.complete) { completed = true; break }
  }
  assert.equal(completed, true)
  assert.equal(received.length, failedRole ? 8 : 7)
  for (const role of ['story-director', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director', 'shot-editor', 'continuity-reviewer']) {
    assert.equal(received.filter(call => call.role === role).length, role === failedRole ? 2 : 1)
  }
  for (const call of received) {
    assert.equal(JSON.stringify(call.context.revision), JSON.stringify(revision), call.role)
    if (call.role === 'continuity-reviewer') {
      assert.ok(call.context.source.continuityContract)
      assert.ok(Array.isArray(call.context.source.shots))
    } else {
      assert.equal(call.context.source.brief, job.brief)
      assert.equal(JSON.stringify(call.context.shotSettings), JSON.stringify(job.planning_context.shotSettings))
    }
  }
})

test('complete editorial repair notes survive crew and saved-plan validation without enlarging provider prompts', async () => {
  const { z } = await import('zod')
  const loadSchema = (path, dependencies = {}) => {
    const result = { exports: {} }
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
      module: result, exports: result.exports,
      require: name => name === 'zod' ? { z } : dependencies[name],
    })
    return result.exports
  }
  const studio = loadSchema('../src/core/validation/studio-ad.ts')
  const crew = loadSchema('../src/core/validation/production-crew.ts', { './studio-ad': studio })
  const note = 'Cut at right toe-off into shot 2, matching the advancing left knee and preserving forward motion. Assumption: runner and styling are proposed specifications, not approved assets. If supported and available, use an approved identity reference and shot 1 selected end frame as reference controls; these do not guarantee continuity.'
  assert.ok(note.length > 220)
  const editSchema = crew.crewShotsSchema.shape.shots.element.shape.editNote
  const savedSchema = crew.productionPlanSchema.shape.deliverables.element.shape.productionNotes
  assert.equal(editSchema.parse(note), note)
  assert.equal(savedSchema.parse([note])[0], note)
  assert.equal(editSchema.safeParse('x'.repeat(1201)).success, false)
  assert.equal(savedSchema.safeParse(['x'.repeat(1201)]).success, false)
  assert.equal(savedSchema.parse(['Match the outgoing stride.'])[0], 'Match the outgoing stride.')
  assert.equal(studio.studioAdCampaignDeliverableSchema.shape.productionNotes.safeParse([note]).success, false)
  assert.throws(() => compile({ shots: [{ prompt: 'x'.repeat(1001), continuity: null }] }), /exceeds/)
})

test('per-shot settings reject unsupported choices and reach the review compiler', () => {
  const settings = [{ model: 'seedance', durationSeconds: 5 }, { model: 'kling', durationSeconds: 10 }, { model: 'seedance', durationSeconds: 10 }]
  assert.equal(productionShotSettingsSchema.safeParse(settings).success, true)
  assert.equal(productionShotSettingsSchema.safeParse([{ model: 'sora', durationSeconds: 5 }, ...settings.slice(1)]).success, false)
  assert.equal(productionShotSettingsSchema.safeParse([{ model: 'kling', durationSeconds: 7 }, ...settings.slice(1)]).success, false)
  assert.equal(productionShotSettingsSchema.safeParse(settings.slice(0, 1)).success, false)
  const shots = module.exports.compileCrewShotsForReview({}, { shots: settings.map(() => ({ prompt: 'Track the runner for the selected duration.', model: 'kling', continuity: null })) }, settings)
  assert.equal(shots[0].model, 'seedance')
  assert.equal(shots[0].durationSeconds, 5)
  assert.equal(shots[1].model, 'kling')
  assert.equal(shots[1].durationSeconds, 10)
})

test('saved production deliverables use the user model and duration rather than the editor default', () => {
  const settings = [{ model: 'seedance', durationSeconds: 5 }, { model: 'kling', durationSeconds: 10 }, { model: 'seedance', durationSeconds: 5 }]
  const plan = module.exports.compileProductionPlan({
    shotSettings: settings, model: 'test',
    story: { treatment: 'A running sequence.', audienceEmotion: 'Hope', continuityAnchors: [], continuityLedger: { invariants: [] } },
    editor: { shots: settings.map(() => ({ prompt: 'A complete prompt.', model: 'kling', negativePrompt: 'No drift.', continuity: null })) },
    review: { findings: [] }, stages: [],
  })
  assert.equal(plan.deliverables[0].durationSeconds, 5)
  assert.equal(plan.deliverables[0].modelFamilyId, 'seedance')
  assert.equal(plan.deliverables[1].durationSeconds, 10)
  assert.equal(plan.deliverables[2].modelFamilyId, 'seedance')
})

test('long film settings accept 12 shots and Seedance 4-15s but reject invalid model durations', () => {
  for (const seconds of [4, 7, 12, 15]) {
    assert.equal(productionShotSettingsSchema.safeParse(Array.from({ length: 12 }, () => ({ model: 'seedance', durationSeconds: seconds }))).success, true)
  }
  assert.equal(productionShotSettingsSchema.safeParse(Array.from({ length: 13 }, () => ({ model: 'seedance', durationSeconds: 15 }))).success, false)
  for (const seconds of [4, 7, 15]) assert.equal(productionShotSettingsSchema.safeParse(Array.from({ length: 3 }, () => ({ model: 'kling', durationSeconds: seconds }))).success, false)
})

test('Seedance duration survives action normalization and numeric provider payload without rounding', () => {
  const action = readFileSync(new URL('../src/core/actions/fast-video.ts', import.meta.url), 'utf8')
  const parsed = ts.createSourceFile('fast-video.ts', action, ts.ScriptTarget.Latest, true)
  const parts = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && ['nearestAllowedDuration', 'resolveModelAwareDuration'].includes(node.name?.text)).map(node => node.getText(parsed)).join('\n')
  const context = {}
  vm.runInNewContext(ts.transpileModule(parts, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context)
  const providerSource = readFileSync(new URL('../src/infrastructure/ai/providers/kie.provider.ts', import.meta.url), 'utf8')
  const result = { exports: {} }
  vm.runInNewContext(ts.transpileModule(providerSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: result, exports: result.exports,
    require: name => name.endsWith('base.provider') ? { BaseProvider: class {} } : {},
  })
  const provider = new result.exports.KieProvider()
  const reference = 'https://example.com/approved-last-frame.jpg'
  const seedance = provider.buildMarketInput({ prompt: 'Continue the shot.', output_type: 'video', image_prompt: reference, duration_seconds: 15 }, 'bytedance/seedance-2')
  assert.equal(seedance.first_frame_url, reference)
  assert.equal(seedance.image_url, undefined)
  const kling = provider.buildMarketInput({ prompt: 'Continue the shot.', output_type: 'video', image_prompt: reference, duration_seconds: 10 }, 'kling/v2-5-turbo-image-to-video-pro')
  assert.equal(kling.image_url, reference)
  assert.equal(kling.first_frame_url, undefined)
  const elements = [{ name: 'reference_set_1', description: 'character: tai.png; character: db.png', image_urls: [reference, 'https://example.com/db.png'] }]
  const klingThree = provider.buildMarketInput({ prompt: 'Tai turns toward DB.', output_type: 'video', image_prompt: reference, reference_elements: elements, duration_seconds: 10 }, 'kling-3.0/video')
  assert.equal(JSON.stringify(klingThree.image_urls), JSON.stringify([reference]))
  assert.equal(JSON.stringify(klingThree.kling_elements), JSON.stringify(elements))
  assert.equal(klingThree.prompt, 'Tai turns toward DB. @reference_set_1')
  for (const duration of [4, 5, 7, 10, 12, 15]) {
    const applied = context.resolveModelAwareDuration(duration, 'bytedance/seedance-2')
    assert.equal(applied, duration)
    assert.equal(provider.buildMarketInput({ prompt: 'A running scene.', output_type: 'video', duration_seconds: applied }, 'bytedance/seedance-2').duration, duration)
  }
  assert.equal(provider.buildMarketInput({ prompt: 'Scene', output_type: 'video', duration_seconds: 10 }, 'kling/v2-5-turbo-text-to-video-pro').duration, '10')
})

test('longer plans cannot silently lose shots during compilation', () => {
  const settings = Array.from({ length: 12 }, () => ({ model: 'seedance', durationSeconds: 15 }))
  const input = {
    shotSettings: settings, model: 'test',
    story: { treatment: 'A running sequence.', audienceEmotion: 'Hope', continuityAnchors: [], continuityLedger: { invariants: [] } },
    editor: { shots: settings.map(() => ({ prompt: 'A complete prompt.', model: 'seedance', negativePrompt: 'No drift.', continuity: null })) },
    review: { findings: [] }, stages: [],
  }
  const plan = module.exports.compileProductionPlan(input)
  assert.equal(plan.deliverables.length, 12)
  assert.equal(plan.deliverables.reduce((total, shot) => total + shot.durationSeconds, 0), 180)
  assert.throws(() => module.exports.compileProductionPlan({ ...input, editor: { shots: input.editor.shots.slice(0, 3) } }), /wrong shot count/)
  assert.throws(() => module.exports.compileCrewShotsForReview({}, { shots: input.editor.shots.slice(0, 3) }, settings), /wrong shot count/)
})

test('shot settings frontend renders twelve editable shots with model-specific duration choices', async () => {
  const React = await import('react')
  const jsxRuntime = await import('react/jsx-runtime')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const result = { exports: {} }
  const source = readFileSync(new URL('../src/interface/components/fast-video/ProductionShotSettings.tsx', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: result, exports: result.exports,
    require: name => name === 'react' ? React : name === 'react/jsx-runtime' ? jsxRuntime : name.endsWith('.module.css') ? { default: {} } : { productionShotSettingsSchema },
  })
  const render = model => renderToStaticMarkup(React.createElement(result.exports.ProductionShotSettings, { value: Array.from({ length: 12 }, () => ({ model, durationSeconds: model === 'seedance' ? 15 : 10 })), onChange() {}, disabled: false }))
  const seedance = render('seedance')
  assert.equal((seedance.match(/role="tab"/g) || []).length, 12)
  assert.equal((seedance.match(/aria-label="Shot \d+ duration"/g) || []).length, 1)
  assert.match(seedance, /value="15" selected=""/)
  assert.match(seedance, /value="4"/)
  const kling = render('kling')
  assert.doesNotMatch(kling, /value="15"/)
  assert.match(kling, /value="10" selected=""/)
})

test('sequence editor preserves other shots and clears unsupported model timing', async () => {
  const jsxRuntime = await import('react/jsx-runtime')
  let selection = 0
  const result = { exports: {} }
  const source = readFileSync(new URL('../src/interface/components/fast-video/ProductionShotSettings.tsx', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: result, exports: result.exports,
    require: name => name === 'react' ? { useId: () => 'sequence', useRef: () => ({ current: [] }), useState: () => [selection, next => { selection = next }] } : name === 'react/jsx-runtime' ? jsxRuntime : name.endsWith('.module.css') ? { default: {} } : { productionShotSettingsSchema },
  })
  let value = [{ model: 'seedance', durationSeconds: 15 }, { model: 'kling', durationSeconds: 10 }, { model: 'kling', durationSeconds: 5 }]
  function render() {
    const tree = result.exports.ProductionShotSettings({ value, onChange: next => { value = next }, disabled: false })
    const nodes = []
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return
      nodes.push(node)
      walk(node.props?.children)
    }
    walk(tree)
    return nodes
  }
  render().find(node => node.type === 'button' && node.props.children === 'Kling').props.onClick()
  assert.equal(value[0].model, 'kling')
  assert.equal(value[0].durationSeconds, 0)
  assert.equal(value[1].durationSeconds, 10)
  render().find(node => node.props?.['aria-label'] === 'Increase shot duration').props.onClick()
  assert.equal(value[0].durationSeconds, 5)
  render().filter(node => node.props?.role === 'tab')[1].props.onClick()
  assert.equal(selection, 1)
  render().find(node => node.props?.['aria-label'] === 'Shot 2 duration').props.onChange({ target: { value: '5' } })
  assert.equal(value[1].durationSeconds, 5)
  render().find(node => node.type === 'button' && node.props.children === '2 min').props.onClick()
  assert.equal(value.length, 12)
  assert.equal(value.reduce((sum, shot) => sum + shot.durationSeconds, 0), 120)
  assert.equal(selection, 0)
  assert.equal(productionShotSettingsSchema.safeParse(value).success, true)
  render().filter(node => node.props?.role === 'tab')[0].props.onKeyDown({ key: 'End', preventDefault() {} })
  assert.equal(selection, 11)
  render().find(node => node.type === 'button' && node.props.children === '30 sec').props.onClick()
  assert.equal(value.length, 3)
  assert.equal(selection, 0)
})

test('batch retries only failed or missing footage, never completed or active shots', () => {
  const module = { exports: {} }
  const source = readFileSync(new URL('../src/core/utils/production/retry-eligibility.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module, exports: module.exports })
  const eligible = module.exports.needsProductionTake
  const shot = (status, url = null) => ({ approved_take_id: null, shot_generations: [{ status, output_url: url }], generation_jobs: [] })
  const shots = [shot('completed', 'saved-one.mp4'), shot('completed', 'saved-two.mp4'), shot('failed')]
  assert.deepEqual(shots.map(eligible), [false, false, true])
  for (const status of module.exports.activeProductionStatuses) {
    assert.equal(eligible({ ...shot('failed'), generation_jobs: [{ status }] }), false)
  }
  assert.equal(eligible({ ...shot('failed'), approved_take_id: 'approved' }), false)
  assert.equal(eligible({ approved_take_id: null, shot_generations: [], generation_jobs: [] }), true)
  assert.equal(eligible({ ...shot('failed'), shot_generations: [...shots[0].shot_generations, ...shot('failed').shot_generations] }), false)
})

test('provider structured output contract requires exact shot count for 2 through 12 shots', async () => {
  const { z } = await import('zod')
  const { zodTextFormat } = await import('openai/helpers/zod')
  const load = (path, dependencies = {}) => {
    const module = { exports: {} }
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module, exports: module.exports, require: name => name === 'zod' ? { z } : dependencies[name] })
    return module.exports
  }
  const studio = load('../src/core/validation/studio-ad.ts')
  const schemas = load('../src/core/validation/production-crew.ts', { './studio-ad': studio })
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'createCrewRunner').getText(tree)
  let request
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fn, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module, exports: module.exports, ...schemas, zodTextFormat,
    process: { env: { OPENAI_API_KEY: 'mock-no-network' } }, buildReferenceInput: () => [],
    OpenAI: class { responses = { parse: async input => { request = input; return { status: 'incomplete' } } } },
    responseFailureDetail: () => 'simulated stop before paid output', safeCrewError: error => error.message,
  })
  for (let count = 2; count <= 12; count++) {
    for (const [schema, field] of [[schemas.productionBibleSchema, 'beats'], [schemas.departmentDirectionSchema, 'shotDirections'], [schemas.crewShotsSchema, 'shots']]) {
      await assert.rejects(module.exports.createCrewRunner('mock', [], count)('test-role', 'test', {}, schema), /simulated stop/)
      assert.equal(request.text.format.schema.properties[field].minItems, count)
      assert.equal(request.text.format.schema.properties[field].maxItems, count)
    }
  }
})

for (const scenario of ['completed', 'lookup-error', 'active', 'active-error', 'history-error']) test(`paid video submission is blocked safely for ${scenario}`, async () => {
  const z = settingsZod
  const source = readFileSync(new URL('../src/core/actions/production.ts', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('production.ts', source, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'queueProductionShot').getText(ast)
  let calls = 0
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: table => {
    let columns
    const q = { select: value => { columns = value; return q }, eq: () => q, not: () => q, in: () => q, limit: () => q, order: () => q,
      maybeSingle: async () => {
        if (table === 'generation_jobs') return { data: scenario === 'active' ? { id: 'existing', status: 'submitted' } : null, error: scenario === 'active-error' ? { code: 'offline' } : null }
        if (columns === 'take_number') return { data: null, error: { code: 'offline' } }
        return { data: scenario === 'completed' ? { id: 'saved-take' } : null, error: scenario === 'lookup-error' ? { code: 'offline' } : null }
      }, insert: () => { throw new Error('Unexpected paid-work record') } }
    return q
  } }
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fn, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module, exports: module.exports,
    productionShotSchema: z.object({ productionId: z.string(), shotId: z.string(), newTake: z.boolean().default(false) }),
    createClient: async () => db,
    getOwnedProductionShot: async () => ({ shot: { id: 'shot', previous_shot_id: null }, production: { id: 'film', reference_assets: [] } }),
    productionAssetsSchema: z.array(z.any()), activeGenerationStatuses: ['submitted'],
    generateFastVideo: () => { calls++; throw new Error('Unexpected provider call') },
  })
  const result = await module.exports.queueProductionShot({ productionId: 'film', shotId: 'shot' })
  if (scenario === 'active') assert.equal(result.data.id, 'existing')
  else assert.ok(result.error)
  assert.equal(calls, 0)
})

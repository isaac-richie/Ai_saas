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
const { buildRevisionContext, revisionSaveError } = revisionModule.exports

test('repair stores complete large findings separately and never carries stale checkpoints', () => {
  const findings = Array.from({ length: 8 }, (_, i) => ({ shotNumber: i % 3 + 1, severity: 'blocking', evidence: 'e'.repeat(600), correction: 'c'.repeat(600) }))
  const previous = { revision: { directions: ['Keep the chair brown.'], findings: [] }, story: { stale: true }, editor: { stale: true }, stages: [{ role: 'shot-editor' }] }
  const before = JSON.stringify(previous)
  const context = buildRevisionContext(previous, 'Repair the complete dialogue.', findings)
  assert.ok(JSON.stringify(context).length > 4000)
  assert.equal(JSON.stringify(context.revision.findings), JSON.stringify(findings))
  assert.equal(context.revision.directions.join('|'), 'Keep the chair brown.|Repair the complete dialogue.')
  assert.equal(context.story, undefined)
  assert.equal(context.editor, undefined)
  assert.equal(JSON.stringify(previous), before)
  const retry = buildRevisionContext(context, 'Repair the complete dialogue.', [])
  assert.equal(retry.revision.directions.length, 2)
  assert.equal(retry.revision.findings.length, 0)
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
  assert.equal(JSON.stringify(inserted.planning_context.revision.findings), JSON.stringify(findings))
})

test('repair directions survive checkpoint parsing and reach every planning stage', async () => {
  const { z } = await import('zod')
  const runnerSource = readFileSync(new URL('../src/core/services/production-crew-runner.ts', import.meta.url), 'utf8')
  const revision = { directions: ['Preserve the exact dialogue.'], findings: [{ shotNumber: 2, severity: 'blocking', evidence: 'Dialogue cut short.', correction: 'Restore complete dialogue.' }] }
  const received = []
  let job = { id: 'job', brief: 'Make three connected shots.', status: 'brief', planning_stage: 'brief', planning_context: { revision, shotSettings: [{ model: 'seedance', durationSeconds: 5 }, { model: 'kling', durationSeconds: 10 }, { model: 'seedance', durationSeconds: 5 }] }, reference_assets: [] }
  const db = { from: () => {
    let update
    const query = {
      update: value => { update = value; return query }, eq: () => query, or: () => query, select: () => query,
      maybeSingle: async () => {
        job = { ...job, ...update }
        return { data: job, error: null }
      },
    }
    return query
  } }
  const mockRun = async (role, instruction, context) => {
    received.push({ role, context })
    return { value: role === 'story-director' ? { continuityLedger: {} } : role === 'shot-editor' ? { shots: [{ prompt: 'A complete shot.', continuity: {} }] } : {}, responseId: role }
  }
  const runnerModule = { exports: {} }
  vm.runInNewContext(ts.transpileModule(runnerSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: runnerModule, exports: runnerModule.exports, process: { env: {} }, console,
    require: name => {
      if (name === 'zod') return { z }
      if (name.endsWith('/validation/production-settings')) return { productionShotSettingsSchema }
      if (name.endsWith('/services/production-crew')) return { createCrewRunner: () => mockRun, compileCrewShotsForReview: () => [], compileProductionPlan: () => ({ ready: true }) }
      if (name.endsWith('/validation/production-crew')) return { productionBibleSchema: z.any(), departmentDirectionSchema: z.any(), crewShotsSchema: z.any(), crewReviewSchema: z.object({ findings: z.array(z.any()) }) }
      if (name.endsWith('/ai/prompt-compliance')) return { enforcePromptCompliance: () => ({ blocked: false, flags: [] }) }
      if (name.endsWith('/validation/production-assets')) return { productionAssetsSchema: z.array(z.any()), ownsAssetUrl: () => true }
      throw new Error(`Unexpected import ${name}`)
    },
  })
  for (let i = 0; i < 4; i++) {
    const result = await runnerModule.exports.advanceProductionCrew(db, 'owner', 'job')
    assert.equal(result.error, undefined)
    assert.equal(result.data.complete, i === 3)
    assert.equal(JSON.stringify(job.planning_context.revision), JSON.stringify(revision))
  }
  assert.equal(received.length, 7)
  for (const call of received) {
    assert.equal(JSON.stringify(call.context.revision), JSON.stringify(revision), call.role)
    assert.equal(call.context.source.brief, job.brief)
    assert.equal(JSON.stringify(call.context.shotSettings), JSON.stringify(job.planning_context.shotSettings))
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
  assert.equal(productionShotSettingsSchema.safeParse(settings.slice(1)).success, false)
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

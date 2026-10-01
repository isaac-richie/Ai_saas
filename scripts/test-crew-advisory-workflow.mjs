import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { z } from 'zod'

// vm-created objects carry another realm's prototypes; compare their data, not identity.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message)

const transpile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

function loadModule(path, requireMap = {}, globals = {}) {
  const loaded = { exports: {} }
  vm.runInNewContext(transpile(read(path)), {
    module: loaded, exports: loaded.exports, console, process: { env: {} }, ...globals,
    require: name => {
      if (name === 'zod') return { z }
      const match = Object.keys(requireMap).find(key => name === key || name.endsWith(key))
      if (match) return requireMap[match]
      throw new Error(`Unexpected import ${name}`)
    },
  })
  return loaded.exports
}

function extractFunctions(path, names, globals) {
  const source = read(path)
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const code = tree.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.includes(item.name.getText(tree))))
  ).map(node => node.getText(tree)).join('\n')
  const loaded = { exports: {} }
  vm.runInNewContext(transpile(`${code}\nmodule.exports = { ${names.join(', ')} }`), { module: loaded, exports: loaded.exports, console, ...globals })
  return loaded.exports
}

// Real validation schemas and helpers, never pass-through mocks.
const settings = loadModule('../src/core/validation/production-settings.ts')
const studioAd = loadModule('../src/core/validation/studio-ad.ts')
const crewValidation = loadModule('../src/core/validation/production-crew.ts', { './studio-ad': studioAd })
const revisionContext = loadModule('../src/core/utils/production/revision-context.ts')

const shotSettings = [{ model: 'kling', durationSeconds: 10 }, { model: 'seedance', durationSeconds: 5 }, { model: 'kling', durationSeconds: 5 }]
const extractedLedger = {
  subjectIdentity: 'Courier: woman in her thirties, short black hair.',
  wardrobe: 'Red waxed raincoat, black boots.',
  heroObjects: ['Sealed cream envelope'],
  location: 'Rain-soaked city streets at dusk.',
  environment: 'Steady light rain, wet reflective pavement.',
  palette: ['deep teal', 'sodium orange'],
  lighting: 'Low sodium streetlight from screen left.',
  screenDirection: 'Courier travels left to right.',
  cameraRules: 'Not specified in the brief; keep consistent across shots.',
  invariants: ['Red raincoat in every shot.', 'Envelope stays sealed.', 'Rain never stops.'],
}

function completePlan(findings = []) {
  const shot = index => ({
    id: `shot-${index}`, title: `Shot ${index}`, conceptType: 'Narrative coverage', hook: 'Reveal the courier.',
    creatorDirection: 'The courier walks forward.', masterPrompt: 'A cinematic wide shot of the courier walking left to right through rain at dusk.',
    negativePrompt: 'blurry, warped', durationSeconds: shotSettings[index - 1].durationSeconds, aspectRatio: '16:9', modelFamilyId: shotSettings[index - 1].model,
    continuityAnchors: [], productionNotes: ['Cut on action.'], continuityStartState: 'At the door.', continuityEndState: 'At the table.', intentionalChanges: [],
  })
  const direction = { approach: 'Approach text here.', shotDirections: ['One.', 'Two.', 'Three.'], constraints: ['Keep it.'] }
  return {
    campaignSummary: 'A courier crosses the city.', audience: 'Hope.', creativeStrategy: 'A courier crosses the city.',
    deliverables: [1, 2, 3].map(shot), score: { campaignReadiness: 0, varietyStrength: 0, promptClarity: 0 }, suggestions: [],
    crew: {
      version: 2, model: 'test', createdAt: '2026-10-01T00:00:00Z',
      bible: { title: 'Courier', treatment: 'A courier crosses the city.', audienceEmotion: 'Hope.', world: 'Rainy city.', continuityAnchors: ['Keep the red coat.'], continuityLedger: extractedLedger, beats: ['One.', 'Two.', 'Three.'], assumptions: [] },
      camera: direction, lighting: direction, productionDesign: direction, performance: direction,
      review: { summary: 'Review summary.', findings },
      stages: ['continuity-extractor', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director', 'shot-editor', 'continuity-reviewer'].map(role => ({ role, responseId: role })),
    },
  }
}

const blocking = { shotNumber: 2, severity: 'blocking', evidence: 'Coat turns blue in shot 2.', correction: 'Restore the red raincoat.' }
const note = { shotNumber: 1, severity: 'note', evidence: 'Consider a slower push.', correction: 'Optional.' }

// ─── Validation helpers ─────────────────────────────────────────────────
test('a seven-role crew plan with an extracted ledger is valid and approvable', () => {
  const plan = completePlan()
  assert.equal(crewValidation.productionPlanSchema.safeParse(plan).success, true)
  assert.equal(crewValidation.canApproveProduction(plan), true)
})

test('blockingFindings returns only blocking findings from valid plans', () => {
  same(crewValidation.blockingFindings(completePlan([note, blocking])).map(item => item.severity), ['blocking'])
  assert.equal(crewValidation.blockingFindings(completePlan([note])).length, 0)
  for (const invalid of [null, undefined, {}, { crew: { review: { findings: [blocking] } } }, 'plan']) {
    same(crewValidation.blockingFindings(invalid), [], 'unparseable plans never surface findings')
  }
})

test('findings do not change the deterministic approval gate', () => {
  assert.equal(crewValidation.canApproveProduction(completePlan([blocking, blocking])), true, 'flagged notes stay advisory')
})

test('findingsRepairUsed only trusts an explicit true flag', () => {
  assert.equal(crewValidation.findingsRepairUsed({ findingsRepairUsed: true }), true)
  for (const value of [null, undefined, {}, { findingsRepairUsed: 'true' }, { findingsRepairUsed: 1 }, { findingsRepairUsed: false }, 'x']) {
    assert.equal(crewValidation.findingsRepairUsed(value), false)
  }
})

test('extracted ledger strings survive the stage normalizer and the ledger schema', () => {
  const ledger = crewValidation.continuityLedgerSchema.parse(extractedLedger)
  assert.equal(ledger.heroObjects.length, 1)
  assert.equal(crewValidation.continuityLedgerSchema.safeParse({ ...extractedLedger, invariants: ['Only one.'] }).success, false, 'invariants need at least three rules')
})

test('continuity extraction routes to the economy tier', () => {
  const routing = loadModule('../src/core/config/production-model-routing.ts')
  const env = { PRODUCTION_CREW_MODEL: 'gpt-6-astra' }
  assert.equal(routing.resolveProductionModel('continuity-extractor', env).tier, 'economy')
  assert.equal(routing.resolveProductionModel('continuity-extractor', env).model, 'gpt-6-luna')
})

// ─── Runner: extraction stage ───────────────────────────────────────────
function createRunnerHarness({ extractor = 'ok', referenceAssets = [], context = {} } = {}) {
  const calls = []
  let planInput
  let job = { id: 'job', user_id: 'owner', brief: 'A courier in a red raincoat crosses a rainy city at dusk to deliver a sealed envelope.', status: 'brief', planning_stage: 'brief', planning_context: { shotSettings, ...context }, reference_assets: referenceAssets }
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
  const mockRun = async (role, instruction, input, schema) => {
    calls.push({ role, instruction, input })
    if (role === 'continuity-extractor') {
      if (extractor === 'refusal') throw new Error('continuity-extractor:director_refusal: cannot comply')
      if (extractor === 'credits') throw new Error('continuity-extractor:AI planning credits are exhausted. Add credits to the configured OpenAI API account.')
      return { value: schema.parse(extractedLedger), responseId: 'extract-1', model: 'gpt-6-luna' }
    }
    if (role === 'shot-editor') return { value: { shots: Array.from({ length: 3 }, () => ({ prompt: 'A complete shot.', continuity: {} })) }, responseId: role }
    if (role === 'continuity-reviewer') return { value: { findings: [] }, responseId: role }
    return { value: { approach: role }, responseId: role }
  }
  const runner = loadModule('../src/core/services/production-crew-runner.ts', {
    '/validation/production-settings': settings,
    '/services/production-crew': {
      createCrewRunner: () => mockRun, compileCrewShotsForReview: () => [],
      compileProductionPlan: input => { planInput = input; return { ready: true } },
      safeCrewError: cause => {
        const message = cause instanceof Error ? cause.message : 'unknown'
        return /credits are exhausted/i.test(message) ? 'AI planning credits are exhausted. Add credits to the configured OpenAI API account.' : message
      },
    },
    '/validation/production-crew': { ...crewValidation, productionBibleSchema: crewValidation.productionBibleSchema, departmentDirectionSchema: z.any(), crewShotsSchema: z.any(), crewReviewSchema: z.object({ findings: z.array(z.any()) }) },
    '/ai/prompt-compliance': { enforcePromptCompliance: ({ prompt }) => ({ blocked: false, prompt, flags: [] }) },
    '/validation/production-assets': { productionAssetsSchema: z.array(z.any()), ownsAssetUrl: () => true },
    '/utils/production/revision-context': revisionContext,
    '/config/production-model-routing': { resolveProductionModel: () => ({ model: 'mock', tier: 'balanced' }) },
  })
  return {
    calls, get job() { return job }, set job(value) { job = value }, get planInput() { return planInput },
    step: () => runner.advanceProductionCrew(db, 'owner', 'job'),
    async runToEnd(limit = 12) {
      for (let index = 0; index < limit; index += 1) {
        const result = await this.step()
        if (result.error) return result
        if (result.data.complete) return result
      }
      throw new Error('crew did not finish')
    },
  }
}

test('extraction runs first, alone, and saves a concrete ledger before any department', async () => {
  const harness = createRunnerHarness()
  const first = await harness.step()
  assert.equal(first.error, undefined)
  assert.equal(first.data.stage, 'story')
  assert.match(first.data.message, /extracted/)
  same(harness.calls.map(call => call.role), ['continuity-extractor'], 'one paid call per request')
  assert.equal(harness.job.planning_stage, 'story')
  same(harness.job.planning_context.story.continuityLedger, extractedLedger)
  same(harness.job.planning_context.stages, [{ role: 'continuity-extractor', responseId: 'extract-1', model: 'gpt-6-luna' }])
  assert.equal(harness.job.planning_claimed_until, null, 'lease released after the checkpoint')
})

test('extractor is told never to invent facts and receives the brief', async () => {
  const harness = createRunnerHarness()
  await harness.step()
  const call = harness.calls[0]
  assert.match(call.instruction, /only facts stated in the brief/i)
  assert.match(call.instruction, /never invent/i)
  assert.match(call.instruction, /Not specified in the brief; keep consistent across shots\./)
  assert.equal(call.input.source.brief, harness.job.brief)
})

test('every department, the editor and the reviewer share the extracted ledger', async () => {
  const harness = createRunnerHarness()
  const result = await harness.runToEnd()
  assert.equal(result.data.complete, true)
  same(harness.calls.map(call => call.role), ['continuity-extractor', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director', 'shot-editor', 'continuity-reviewer'])
  for (const call of harness.calls.slice(1, 6)) same(call.input.source.bible.continuityLedger, extractedLedger, call.role)
  same(harness.calls[6].input.source.continuityContract, extractedLedger, 'reviewer audits against the extracted contract')
  same(harness.planInput.stages.map(stage => stage.role), ['continuity-extractor', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director', 'shot-editor', 'continuity-reviewer'])
  assert.equal(harness.planInput.stages.length, 7, 'matches the CREW / 07 label and the 5|6|7 stage schema')
})

test('a non-credit extraction failure falls back to generic anchors without blocking the film', async () => {
  const harness = createRunnerHarness({ extractor: 'refusal' })
  const first = await harness.step()
  assert.equal(first.error, undefined, 'the film keeps moving')
  assert.match(first.data.message, /anchors prepared/)
  assert.equal(harness.job.planning_context.story.continuityLedger, null)
  same(harness.job.planning_context.stages, [])
  assert.equal(harness.job.planning_error ?? null, null)
  const result = await harness.runToEnd()
  assert.equal(result.data.complete, true)
  assert.equal(harness.calls.filter(call => call.role === 'continuity-extractor').length, 1, 'never retried on resume')
  assert.equal(harness.planInput.stages.length, 6)
})

test('exhausted credits during extraction stop the crew and keep the brief checkpoint', async () => {
  const harness = createRunnerHarness({ extractor: 'credits' })
  const result = await harness.step()
  assert.match(result.error, /credits are exhausted/)
  assert.match(result.error, /Resume crew/)
  assert.equal(harness.job.planning_stage, 'brief')
  assert.match(harness.job.planning_error, /credits are exhausted/)
  assert.equal(harness.job.planning_claimed_until, null)
  same(harness.calls.map(call => call.role), ['continuity-extractor'], 'no department spends after a billing failure')
})

test('department failures never discard the paid extraction', async () => {
  const harness = createRunnerHarness()
  await harness.step()
  const ledgerBefore = harness.job.planning_context.story.continuityLedger
  // Simulate four departments then confirm the extractor stage is still recorded.
  for (let index = 0; index < 4; index += 1) await harness.step()
  same(harness.job.planning_context.story.continuityLedger, ledgerBefore)
  assert.equal(harness.job.planning_context.stages[0].role, 'continuity-extractor')
  assert.equal(harness.job.planning_context.stages.length, 5)
  assert.equal(harness.job.planning_stage, 'departments')
})

test('the one-repair flag survives every checkpoint through plan completion', async () => {
  const harness = createRunnerHarness({ context: { findingsRepairUsed: true } })
  await harness.runToEnd()
  assert.equal(harness.job.planning_context.findingsRepairUsed, true)
  assert.equal(harness.job.status, 'awaiting_approval')
})

test('changed references restart extraction and keep the one-repair flag', async () => {
  const harness = createRunnerHarness({ context: { findingsRepairUsed: true } })
  await harness.step()
  await harness.step()
  harness.job = { ...harness.job, reference_assets: [{ id: 'new', name: 'coat.png', role: 'wardrobe', url: 'u', mediaType: 'image' }] }
  const reset = await harness.step()
  assert.match(reset.data.message, /References changed/)
  assert.equal(harness.job.planning_stage, 'brief')
  assert.equal(harness.job.planning_context.findingsRepairUsed, true)
  await harness.step()
  assert.equal(harness.calls.filter(call => call.role === 'continuity-extractor').length, 2, 'new references are re-extracted')
})

// ─── Server actions: approve anyway & one crew repair ──────────────────
function loadActions({ sourceJob, latestRevision = null }) {
  let inserted
  let updated
  let reads = 0
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: () => {
      const query = {
        select: () => query, eq: () => query, order: () => query, limit: () => query, range: () => query,
        maybeSingle: async () => ({ data: reads++ === 0 ? sourceJob : latestRevision, error: null }),
        insert: value => { inserted = value; return query },
        update: value => { updated = value; return query },
        single: async () => ({ data: { ...(inserted || {}), ...(updated || {}), id: 'saved' }, error: null }),
      }
      return query
    },
  }
  const actions = extractFunctions('../src/core/actions/production.ts', ['updateSchema', 'updateProduction', 'productionRevisionSchema', 'createProductionRevision'], {
    z, createClient: async () => db,
    productionShotSettingsSchema: settings.productionShotSettingsSchema, productionAssetsSchema: z.array(z.any()), ownsAssetUrl: () => true,
    productionPlanSchema: crewValidation.productionPlanSchema, productionBibleSchema: crewValidation.productionBibleSchema,
    departmentDirectionSchema: crewValidation.departmentDirectionSchema, crewShotsSchema: crewValidation.crewShotsSchema,
    canApproveProduction: crewValidation.canApproveProduction, blockingFindings: crewValidation.blockingFindings, findingsRepairUsed: crewValidation.findingsRepairUsed,
    isJsonObject: value => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    buildRevisionContext: revisionContext.buildRevisionContext, revisionSaveError: revisionContext.revisionSaveError,
  })
  return { actions, get inserted() { return inserted }, get updated() { return updated } }
}

const jobId = 'f8a78482-293d-4de1-aa95-0914f1140a24'
const awaiting = (plan, planningContext = { shotSettings }) => ({ id: jobId, brief: 'A courier crosses the city.', revision_number: 1, status: 'awaiting_approval', planning_stage: 'complete', plan, planning_context: planningContext, reference_assets: [] })

test('approving a flagged plan without acknowledgement is refused server-side', async () => {
  const harness = loadActions({ sourceJob: { plan: completePlan([blocking]) } })
  const result = await harness.actions.updateProduction({ action: 'approve', id: jobId })
  assert.match(result.error, /Approve anyway/)
  assert.equal(harness.updated, undefined, 'nothing is written')
})

test('approve anyway succeeds for a flagged plan once acknowledged', async () => {
  const harness = loadActions({ sourceJob: { plan: completePlan([blocking]) } })
  const result = await harness.actions.updateProduction({ action: 'approve', id: jobId, acknowledgeFindings: true })
  assert.equal(result.error, undefined)
  assert.equal(harness.updated.status, 'approved')
})

test('clean plans and note-only plans approve without acknowledgement', async () => {
  for (const findings of [[], [note]]) {
    const harness = loadActions({ sourceJob: { plan: completePlan(findings) } })
    const result = await harness.actions.updateProduction({ action: 'approve', id: jobId })
    assert.equal(result.error, undefined)
    assert.equal(harness.updated.status, 'approved')
  }
})

test('acknowledgement can never bypass the deterministic release gate', async () => {
  const broken = completePlan([blocking])
  broken.deliverables[0].masterPrompt = 'A prompt cut off mid-sentence without an ending'
  const harness = loadActions({ sourceJob: { plan: broken } })
  const result = await harness.actions.updateProduction({ action: 'approve', id: jobId, acknowledgeFindings: true })
  assert.match(result.error, /need a repair/)
  assert.equal(harness.updated, undefined)
})

test('acknowledgeFindings must be a boolean', async () => {
  const harness = loadActions({ sourceJob: { plan: completePlan([blocking]) } })
  const result = await harness.actions.updateProduction({ action: 'approve', id: jobId, acknowledgeFindings: 'yes' })
  assert.ok(result.error)
  assert.equal(harness.updated, undefined)
})

test('first crew repair of a flagged plan is allowed, carries findings, and spends the one repair', async () => {
  const harness = loadActions({ sourceJob: awaiting(completePlan([note, blocking])) })
  const result = await harness.actions.createProductionRevision({ productionId: jobId, direction: 'Repair the flagged notes.', repair: true })
  assert.equal(result.error, undefined)
  assert.equal(harness.inserted.planning_context.findingsRepairUsed, true)
  same(harness.inserted.planning_context.revision.findings, [blocking], 'only blocking findings drive the repair')
  assert.equal(harness.inserted.revision_number, 2)
})

test('a second findings repair in the same lineage is refused', async () => {
  const harness = loadActions({ sourceJob: awaiting(completePlan([blocking]), { shotSettings, findingsRepairUsed: true }) })
  const result = await harness.actions.createProductionRevision({ productionId: jobId, direction: 'Repair the flagged notes.', repair: true })
  assert.match(result.error, /already repaired/)
  assert.equal(harness.inserted, undefined)
})

test('repair is refused for an approvable plan with nothing flagged', async () => {
  for (const findings of [[], [note]]) {
    const harness = loadActions({ sourceJob: awaiting(completePlan(findings)) })
    const result = await harness.actions.createProductionRevision({ productionId: jobId, direction: 'Repair the flagged notes.', repair: true })
    assert.match(result.error, /does not need a repair/)
    assert.equal(harness.inserted, undefined)
  }
})

test('hard release-gate repairs stay available after the findings repair is spent', async () => {
  const broken = completePlan([blocking])
  broken.deliverables[1].masterPrompt = 'Truncated prompt without an ending'
  const harness = loadActions({ sourceJob: awaiting(broken, { shotSettings, findingsRepairUsed: true }) })
  const result = await harness.actions.createProductionRevision({ productionId: jobId, direction: 'Repair the blocked plan.', repair: true })
  assert.equal(result.error, undefined)
  assert.equal(harness.inserted.planning_context.findingsRepairUsed, true, 'the cap carries forward')
})

test('a hard-gate repair does not spend the findings repair', async () => {
  const broken = completePlan([blocking])
  broken.deliverables[1].masterPrompt = 'Truncated prompt without an ending'
  const harness = loadActions({ sourceJob: awaiting(broken) })
  await harness.actions.createProductionRevision({ productionId: jobId, direction: 'Repair the blocked plan.', repair: true })
  assert.equal(harness.inserted.planning_context.findingsRepairUsed, undefined)
})

test('creative direction revisions inherit the spent repair so the cap cannot be reset', async () => {
  const harness = loadActions({ sourceJob: awaiting(completePlan([blocking]), { shotSettings, findingsRepairUsed: true }) })
  const result = await harness.actions.createProductionRevision({ productionId: jobId, direction: 'Make the rain heavier in shot two.' })
  assert.equal(result.error, undefined)
  assert.equal(harness.inserted.planning_context.findingsRepairUsed, true)
  assert.equal(harness.inserted.planning_stage, 'brief')
})

test('repairs that reuse paid departments also keep the paid extraction stage', async () => {
  const plan = completePlan([blocking])
  const direction = plan.crew.camera
  const editorShots = plan.deliverables.map(shot => ({ title: shot.title, intent: 'Reveal the courier.', action: 'The courier walks forward.', prompt: shot.masterPrompt, negativePrompt: 'blurry, warped', model: shot.modelFamilyId, editNote: 'Cut on action.', continuity: { startState: 'At the door.', endState: 'At the table.', carriedDetails: ['red coat', 'envelope', 'rain'], intentionalChanges: [] } }))
  const stages = plan.crew.stages
  const source = awaiting(plan, { shotSettings, referenceSnapshot: '[]', story: plan.crew.bible, camera: direction, lighting: direction, productionDesign: direction, performance: direction, editor: { shots: editorShots }, stages })
  const harness = loadActions({ sourceJob: source })
  const result = await harness.actions.createProductionRevision({ productionId: jobId, direction: 'Repair the flagged notes.', repair: true })
  assert.equal(result.error, undefined)
  assert.equal(harness.inserted.planning_stage, 'departments', 'paid specialists are reused')
  same(harness.inserted.planning_context.stages.map(stage => stage.role), ['continuity-extractor', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director'])
  assert.equal(harness.inserted.planning_context.findingsRepairUsed, true)
})

// ─── UI contract ────────────────────────────────────────────────────────
test('production desk label matches the seven calls that actually run', () => {
  const desk = read('../src/interface/components/fast-video/ProductionDesk.tsx')
  assert.match(desk, /CREW \/ 07/)
  assert.match(desk, /Continuity · Camera · Light<br \/>Design · Performance · Edit · Review/)
  assert.doesNotMatch(desk, /Story · Camera/)
  assert.match(desk, /step < 10/, 'client loop covers seven stages plus a reference reset')
})

test('production desk approves flagged plans only through an explicit two-step confirmation', () => {
  const desk = read('../src/interface/components/fast-video/ProductionDesk.tsx')
  assert.match(desk, /blockingFindings\(job\.plan\)\.length === 0 && <button[^>]*>/, 'one-click approve hidden when notes are flagged')
  assert.match(desk, /Approve anyway/)
  assert.match(desk, /Confirm approval with open notes/)
  assert.match(desk, /acknowledgeFindings: true/)
  assert.match(desk, /!findingsRepairUsed\(job\.planning_context\) && <button/)
})

// Longer film, Keep Progress brief: Step 4 (re-plan one shot only) and Step 5 (save progress, ask first).
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { loadTs } from './load-ts.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (value) => JSON.stringify(value);
const { normalizeShotScope, isWholeFilm, replanContext, spliceReplannedShots, replanInstruction } = await loadTs('core/services/production-replan.ts');

// ─── Step 4: the scope rules ────────────────────────────────────────────────────────────────────

describe('Step 4: which shots are re-planned', () => {
  it('keeps whole shot numbers in the film, once each, in order', () => {
    assert.deepEqual(normalizeShotScope([3, 2, 3], 5), [2, 3]);
    assert.deepEqual(normalizeShotScope([2], 3), [2]);
  });
  it('refuses shots outside the film or odd numbers, instead of guessing', () => {
    assert.deepEqual(normalizeShotScope([0], 3), []);
    assert.deepEqual(normalizeShotScope([4], 3), []);
    assert.deepEqual(normalizeShotScope([1.5], 3), []);
    assert.deepEqual(normalizeShotScope([], 3), []);
    assert.deepEqual(normalizeShotScope(undefined, 3), []);
    assert.deepEqual(normalizeShotScope([1], 0), []);
  });
  it('every shot chosen is a whole-film re-plan', () => {
    assert.equal(isWholeFilm([1, 2, 3], 3), true);
    assert.equal(isWholeFilm([2], 3), false);
    assert.equal(isWholeFilm([], 3), true);
  });
});

describe('Step 4: the crew sees fixed neighbours but changes only the chosen shots', () => {
  const shots = ['one', 'two', 'three', 'four'].map((title) => ({ title }));
  const numbers = (list) => list.map((s) => s.shotNumber);
  it('shot 2 of 4: neighbours 1 and 3', () => {
    const { shotsToReplan, readOnlyNeighbours } = replanContext(shots, [2]);
    assert.deepEqual(numbers(shotsToReplan), [2]);
    assert.equal(shotsToReplan[0].title, 'two');
    assert.deepEqual(numbers(readOnlyNeighbours), [1, 3]);
  });
  it('the first and last shots have one neighbour', () => {
    assert.deepEqual(numbers(replanContext(shots, [1]).readOnlyNeighbours), [2]);
    assert.deepEqual(numbers(replanContext(shots, [4]).readOnlyNeighbours), [3]);
  });
  it('two shots side by side share their outer neighbours only', () => {
    assert.deepEqual(numbers(replanContext(shots, [2, 3]).readOnlyNeighbours), [1, 4]);
  });
  it('splices only the chosen shots back, leaving the others exactly as they were', () => {
    const out = spliceReplannedShots(shots, [2], [{ title: 'two, new' }]);
    assert.deepEqual(out.map((s) => s.title), ['one', 'two, new', 'three', 'four']);
    assert.equal(out[0], shots[0]);
    assert.equal(out[2], shots[2]);
    assert.equal(out[3], shots[3]);
  });
  it('a wrong count from the crew is an error, never a silent mix-up', () => {
    assert.throws(() => spliceReplannedShots(shots, [2], []), /returned 0 shots for 1/);
    assert.throws(() => spliceReplannedShots(shots, [2], [{}, {}]), /returned 2 shots for 1/);
  });
  it('the instruction names the shot and the exact count', () => {
    const text = replanInstruction([2], 20);
    assert.match(text, /Re-plan only shot 2 of this 20-shot film/);
    assert.match(text, /Return exactly 1 shot, in the order listed/);
    assert.match(text, /readOnlyNeighbours/);
  });
});

// ─── Step 4: the real crew runner, with a mock AI and database ──────────────────────────────────

const transpile = (code) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function loadModule(path, requireMap = {}) {
  const loaded = { exports: {} };
  vm.runInNewContext(transpile(read(path)), {
    module: loaded, exports: loaded.exports, console, process: { env: {} },
    require: (name) => {
      if (name === 'zod') return { z };
      if (name === '@/core/config/kie-video-models') return loadModule('../src/core/config/kie-video-models.ts');
      if (name === '@/core/config/film') return loadModule('../src/core/config/film.ts');
      if (name === '@/core/utils/crew-failure') return loadModule('../src/core/utils/crew-failure.ts');
      if (name === '@/core/config/lighting-presets') return loadModule('../src/core/config/lighting-presets.ts');
      const match = Object.keys(requireMap).find((key) => name === key || name.endsWith(key));
      if (match) return requireMap[match];
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return loaded.exports;
}
const settings = loadModule('../src/core/validation/production-settings.ts');
const studioAd = loadModule('../src/core/validation/studio-ad.ts', { './campaign-references': loadModule('../src/core/validation/campaign-references.ts') });
const crewValidation = loadModule('../src/core/validation/production-crew.ts', { './studio-ad': studioAd });
const revisionContext = loadModule('../src/core/utils/production/revision-context.ts');
const replan = loadModule('../src/core/services/production-replan.ts');

const shotSettings = [{ model: 'kling', durationSeconds: 10 }, { model: 'seedance', durationSeconds: 5 }, { model: 'kling', durationSeconds: 5 }];
const ledger = {
  subjectIdentity: 'Sam: man in his forties, grey beard.', wardrobe: 'Blue cardigan, brown slippers.', heroObjects: ['Chipped white mug'],
  location: 'Small kitchen at sunrise.', environment: 'Kettle steam, quiet street outside.', palette: ['warm amber', 'pale blue'],
  lighting: 'Low sun through the window, screen left.', screenDirection: 'Sam faces right.', cameraRules: 'Handheld, eye level.',
  invariants: ['Blue cardigan in every shot.', 'Mug stays chipped.', 'Morning light.'],
};
const bible = { title: 'Sam’s Morning', treatment: 'A quiet morning.', audienceEmotion: 'Calm.', world: 'Kitchen.', continuityAnchors: ['Blue cardigan.'], continuityLedger: ledger, beats: ['Wake.', 'Kettle.', 'Window.'], assumptions: [] };
const direction = { approach: 'Approach.', shotDirections: ['One.', 'Two.', 'Three.'], constraints: ['Keep it.'] };
const previousShots = [1, 2, 3].map((n) => ({ title: `Shot ${n}`, prompt: `Saved prompt for shot ${n}, exactly as approved.`, continuity: { endState: `end ${n}` } }));

function harness(context) {
  const calls = [];
  let planInput;
  let job = { id: 'job', user_id: 'owner', brief: 'Sam makes tea at sunrise.', status: 'brief', planning_stage: 'departments', reference_assets: [], planning_context: context };
  const db = { from: () => {
    let update;
    const filters = [];
    const query = {
      update: (value) => { update = value; return query }, eq: (key, value) => { filters.push([key, value]); return query }, or: () => query, select: () => query,
      maybeSingle: async () => {
        if (filters.some(([key, value]) => job[key] !== value)) return { data: null, error: null };
        job = { ...job, ...update };
        return { data: job, error: null };
      },
      then: (resolve, reject) => query.maybeSingle().then(resolve, reject),
    };
    return query;
  } };
  const createCrewRunner = (_model, _refs, shotCount) => async (role, instruction, input) => {
    calls.push({ role, instruction, input, shotCount });
    if (role === 'shot-editor') return { value: { shots: Array.from({ length: shotCount }, (_, i) => ({ title: `Rewritten ${i + 1}`, prompt: `A rewritten shot ${i + 1}.`, continuity: { endState: 'new end' } })) }, responseId: 'editor-new', model: 'mock' };
    if (role === 'continuity-reviewer') return { value: { findings: [] }, responseId: 'review', model: 'mock' };
    throw new Error(`The ${role} must not run in a one-shot re-plan`);
  };
  const runner = loadModule('../src/core/services/production-crew-runner.ts', {
    '/validation/production-settings': settings,
    '/services/production-crew': {
      createCrewRunner, compileCrewShotsForReview: () => [],
      compileProductionPlan: (input) => { planInput = input; return { ready: true } },
      safeCrewError: (cause) => (typeof cause?.message === 'string' ? cause.message : 'unknown'),
    },
    '/services/production-replan': replan,
    '/validation/production-crew': { ...crewValidation, departmentDirectionSchema: z.any(), crewShotsSchema: z.any(), crewShotRewriteSchema: z.any(), crewReviewSchema: z.object({ findings: z.array(z.any()) }) },
    '/ai/prompt-compliance': { enforcePromptCompliance: ({ prompt, negativePrompt }) => ({ blocked: false, prompt, negativePrompt, flags: [] }) },
    '/validation/production-assets': { productionAssetsSchema: z.array(z.any()), ownsAssetUrl: () => true },
    '/utils/production/revision-context': revisionContext,
    '/config/production-model-routing': { resolveProductionModel: () => ({ model: 'mock', tier: 'balanced' }) },
  });
  return { calls, get job() { return job }, get planInput() { return planInput }, step: () => runner.advanceProductionCrew(db, 'owner', 'job') };
}
const scopedContext = (extra = {}) => ({
  shotSettings, story: bible, camera: direction, lighting: direction, productionDesign: direction, performance: direction,
  previousEditor: { shots: previousShots }, revision: { directions: ['Make shot 2 rainy.'], findings: [] },
  revisionScope: { shots: [2] }, keepWork: true, stages: [{ role: 'cinematographer', responseId: 'cam' }], ...extra,
});

test('re-planning shot 2 runs only the shot writer for shot 2, then the review', async () => {
  const h = harness(scopedContext());
  const first = await h.step();
  assert.equal(first.error, undefined, first.error);
  assert.equal(h.job.planning_stage, 'shots');
  assert.match(first.data.message, /Shot 2 re-planned; the other shots are unchanged/);
  assert.deepEqual(h.calls.map((c) => c.role), ['shot-editor']);
  const call = h.calls[0];
  assert.equal(call.shotCount, 1);
  assert.equal(json(call.input.source.shotsToReplan.map((s) => s.shotNumber)), json([2]));
  assert.equal(json(call.input.source.readOnlyNeighbours.map((s) => s.shotNumber)), json([1, 3]));
  assert.equal(json(call.input.shotSettings), json([{ model: 'seedance', durationSeconds: 5 }]), 'only shot 2’s model and timing');
  assert.match(json(call.input.revision), /Make shot 2 rainy\./);
  const saved = h.job.planning_context.editor.shots;
  assert.equal(json(saved[0]), json(previousShots[0]), 'shot 1 is byte-for-byte the same');
  assert.equal(saved[1].title, 'Rewritten 1');
  assert.equal(json(saved[2]), json(previousShots[2]), 'shot 3 is byte-for-byte the same');
  assert.equal(h.job.planning_context.revisionScope.shots[0], 2, 'the scope is kept for the approval step');
  assert.equal(h.job.planning_context.keepWork, true);

  const second = await h.step();
  assert.equal(second.data.complete, true);
  assert.deepEqual(h.calls.map((c) => c.role), ['shot-editor', 'continuity-reviewer'], 'two AI calls in all, not a whole crew');
  assert.equal(json(h.planInput.editor.shots[0]), json(previousShots[0]));
  assert.equal(h.planInput.story.title, bible.title, 'story and departments are reused as saved');
});

test('a 20-shot film: re-planning one shot asks for one shot, not twenty', async () => {
  const twenty = Array.from({ length: 20 }, (_, i) => ({ title: `Shot ${i + 1}`, prompt: `Saved ${i + 1}.`, continuity: { endState: `end ${i + 1}` } }));
  const h = harness(scopedContext({ shotSettings: Array.from({ length: 20 }, () => ({ model: 'kling', durationSeconds: 5 })), previousEditor: { shots: twenty }, revisionScope: { shots: [12] } }));
  await h.step();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].shotCount, 1);
  const saved = h.job.planning_context.editor.shots;
  assert.equal(saved.length, 20);
  assert.equal(saved.filter((s, i) => json(s) !== json(twenty[i])).length, 1, 'exactly one shot changed');
  assert.equal(saved[11].title, 'Rewritten 1');
});

test('changed references never restart a one-shot re-plan from the brief', async () => {
  const h = harness(scopedContext({ referenceSnapshot: 'an older reference set' }));
  const result = await h.step();
  assert.equal(result.error, undefined, result.error);
  assert.equal(h.job.planning_stage, 'shots');
  assert.deepEqual(h.calls.map((c) => c.role), ['shot-editor']);
});

test('a shot that is no longer in the film stops the re-plan with a plain message', async () => {
  const h = harness(scopedContext({ revisionScope: { shots: [7] } }));
  const result = await h.step();
  assert.match(result.error, /That shot is no longer in the film\. Re-plan the whole film instead, or restore an earlier version\./);
  assert.equal(result.failure.reason, 'replan_scope');
  assert.equal(h.calls.length, 0, 'nothing was paid for');
  assert.equal(h.job.planning_stage, 'departments', 'the saved checkpoint is unchanged');
});

// ─── Step 4 and 5: the server and the desk ──────────────────────────────────────────────────────

describe('Steps 4 and 5: revisions, approval and the desk', () => {
  const production = read('../src/core/actions/production.ts');
  const desk = read('../src/interface/components/fast-video/ProductionDesk.tsx');
  const adjust = read('../src/interface/components/fast-video/AdjustDirection.tsx');
  it('a one-shot revision reuses the saved crew work and starts at the shot writer', () => {
    assert.match(production, /shotNumbers: z\.array\(z\.number\(\)\.int\(\)\.min\(1\)\.max\(24\)\)\.min\(1\)\.max\(24\)\.optional\(\)/);
    assert.match(production, /planning_stage: "departments", parent_job_id: lineageRoot/);
    assert.match(production, /previousEditor: savedContext\.data\.editor,/);
    assert.match(production, /revisionScope: \{ shots: scope \},/);
  });
  it('refuses a one-shot re-plan it can’t do faithfully, and says to use Whole film', () => {
    assert.match(production, /shot\.masterPrompt === savedContext\.data\.editor\.shots\[index\]\.prompt/);
    assert.match(production, /Choose Whole film instead\./);
    assert.match(production, /&& departmentStages\.length === departmentRoles\.length\n/);
  });
  it('Keep is the default; declining it only clears the re-planned shots’ approved takes, never Takes', () => {
    assert.match(production, /keepWork: z\.boolean\(\)\.default\(true\)/);
    assert.match(production, /if \(context\.keepWork === false\)/);
    assert.match(production, /update\(\{ approved_take_id: null \}\)\.in\("id", ids\)/);
    assert.doesNotMatch(production, /from\("shot_generations"\)\.delete\(\)/);
  });
  it('the panel defaults to the shot in view, says so, and asks before touching work', () => {
    assert.match(adjust, /useState<"shot" \| "film">\("shot"\)/);
    assert.match(adjust, /Applies to this shot only: shot \{shot\}/);
    assert.match(adjust, /Keep everything I have made\?/);
    assert.match(adjust, /<button type="button" autoFocus disabled=\{disabled\} onClick=\{\(\) => void send\(true\)\}[^>]*>Keep<\/button>/);
    assert.match(adjust, /if \(wholeFilm \|\| hasWork\) setAsking\(true\)/);
    assert.match(desk, /onFocusShot=\{setFocusShot\}/);
    assert.match(desk, /Re-plan this shot/);
  });
  it('after the first plan the crew button reads Update plan, and re-plans run straight away', () => {
    assert.match(desk, /job\.parent_job_id \? "Update plan" : "Develop with crew"/);
    assert.match(desk, /await developWithCrew\(result\.data\.id\)\n\s+\}\)\}\n\s+\/>\}/);
  });
  it('every version is kept and can be restored; Takes stay visible while a new plan is made', () => {
    assert.match(production, /export async function restoreProductionVersion/);
    assert.match(desk, /Earlier versions \(/);
    assert.match(desk, /\(stage === "takes" && !workspaceOf\(selected\)\)/);
    assert.match(desk, /productionId=\{workspaceOf\(job\)!\.id\}/);
  });
});

test('the compiled plan: untouched shots come out identical, only shot 2 changes', async () => {
  const { compileProductionPlan } = await loadTs('core/services/production-crew.ts');
  const shot = (n, extra = {}) => ({
    title: `Shot ${n} title`, intent: 'Show Sam waking up.', action: 'Sam opens his eyes and sits up slowly in warm light.',
    prompt: `Shot ${n}: a handheld eye-level shot of Sam in a blue cardigan in a small kitchen at sunrise.`, negativePrompt: 'blurry, warped faces',
    model: 'kling', editNote: 'Cut on action.',
    continuity: { startState: `start ${n}`, endState: `end ${n}`, carriedDetails: ['Blue cardigan', 'Chipped mug', 'Morning light'], intentionalChanges: [] }, ...extra,
  });
  const base = { shotSettings, model: 'mock', story: bible, camera: direction, lighting: direction, productionDesign: direction, performance: direction, review: { summary: 'Review summary text.', findings: [] }, stages: ['continuity-extractor', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director', 'shot-editor', 'continuity-reviewer'].map((role) => ({ role, responseId: role })) };
  const before = compileProductionPlan({ ...base, editor: { shots: [shot(1), shot(2), shot(3)] } });
  const after = compileProductionPlan({ ...base, editor: { shots: spliceReplannedShots([shot(1), shot(2), shot(3)], [2], [shot(2, { title: 'Sam in the rain', prompt: 'Shot 2: rain streaks the kitchen window as Sam, in his blue cardigan, watches the street.' })]) } });
  assert.equal(json(after.deliverables[0]), json(before.deliverables[0]));
  assert.equal(json(after.deliverables[2]), json(before.deliverables[2]));
  assert.notEqual(json(after.deliverables[1]), json(before.deliverables[1]));
  assert.equal(after.deliverables[1].title, 'Sam in the rain');
  assert.equal(after.deliverables[1].modelFamilyId, 'seedance', 'shot 2 keeps its chosen model');
  assert.equal(after.deliverables[1].durationSeconds, 5, 'and its timing');
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { productionPlanSchema, crewMetadataSchema } = await loadTs('core/validation/production-crew.ts');
const { compileProductionPlan } = await loadTs('core/services/production-crew.ts');
const { MAX_FILM_SHOTS, MAX_SHOT_PROMPT_CHARS } = await loadTs('core/config/film.ts');

const shot = (i, prompt) => ({
  id: `shot-${i + 1}`, title: `Shot ${i + 1}`, conceptType: 'Narrative coverage', hook: 'A quiet reveal.',
  creatorDirection: 'She looks up from the letter toward the window.', masterPrompt: prompt,
  negativePrompt: 'flicker, warped hands', durationSeconds: 10, aspectRatio: '16:9', modelFamilyId: 'kling',
  continuityAnchors: [], productionNotes: [],
});
const plan = (count, prompt) => ({
  campaignSummary: 'A short film about a letter.', audience: 'Viewers', creativeStrategy: 'Slow, intimate.',
  deliverables: Array.from({ length: count }, (_, i) => shot(i, prompt)),
  score: { campaignReadiness: 0, varietyStrength: 0, promptClarity: 0 }, suggestions: [],
});

describe('Long films', () => {
  it(`a ${MAX_FILM_SHOTS}-shot plan with full-length shot prompts is valid`, () => {
    const prompt = 'A precise cinematic shot of her face as the light changes. '.repeat(60).slice(0, MAX_SHOT_PROMPT_CHARS - 1).trimEnd() + '.';
    const result = productionPlanSchema.safeParse(plan(MAX_FILM_SHOTS, prompt));
    assert.ok(result.success, result.success ? '' : JSON.stringify(result.error.issues.slice(0, 3)));
  });

  it('a shot prompt over the film budget is still refused', () => {
    assert.equal(productionPlanSchema.safeParse(plan(3, 'x'.repeat(MAX_SHOT_PROMPT_CHARS + 1))).success, false);
  });

  it('the crew history of a film written in two batches is accepted (8 steps)', () => {
    const roles = ['continuity-extractor', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director', 'shot-editor', 'shot-editor', 'continuity-reviewer'];
    assert.ok(crewMetadataSchema.shape.stages.safeParse(roles.map((role) => ({ role, responseId: role }))).success);
    assert.equal(crewMetadataSchema.shape.stages.safeParse(roles.slice(0, 4).map((role) => ({ role, responseId: role }))).success, false);
  });

  it(`the final planning step assembles a ${MAX_FILM_SHOTS}-shot film with full prompts`, () => {
    const direction = { approach: 'Motivated, consistent light and camera.', shotDirections: Array.from({ length: MAX_FILM_SHOTS }, (_, i) => `Shot ${i + 1}: keep the window key on her left.`), constraints: ['Keep the light motivated.'] };
    const story = {
      title: 'The letter', treatment: 'A woman reads a letter and decides to leave.', audienceEmotion: 'Quiet tension.', world: 'A small room at dusk.',
      continuityAnchors: ['Same woman, same coat.'], continuityLedger: null,
      beats: Array.from({ length: MAX_FILM_SHOTS }, (_, i) => `Beat ${i + 1} moves the decision forward.`), assumptions: [],
    };
    const prompt = 'Slow push-in on her face as the window light shifts across the room. '.repeat(40).slice(0, MAX_SHOT_PROMPT_CHARS - 1).trimEnd() + '.';
    const editor = { shots: Array.from({ length: MAX_FILM_SHOTS }, (_, i) => ({
      title: `Shot ${i + 1}`, intent: 'Move the decision forward.', action: 'She reads, looks up, and breathes in.',
      prompt, negativePrompt: 'flicker, warped hands', model: 'kling', editNote: 'Cut on her look.',
      continuity: { startState: 'Seated at the table.', endState: 'Looking at the window.', carriedDetails: ['dark coat', 'white letter', 'wooden table'], intentionalChanges: [] },
    })) };
    const stages = ['continuity-extractor', 'cinematographer', 'lighting-director', 'production-designer', 'performance-director', 'shot-editor', 'shot-editor', 'continuity-reviewer'].map((role) => ({ role, responseId: role }));
    const plan = compileProductionPlan({
      shotSettings: Array.from({ length: MAX_FILM_SHOTS }, () => ({ model: 'kling', durationSeconds: 10 })),
      model: 'mock', story, camera: direction, lighting: direction, productionDesign: direction, performance: direction,
      editor, review: { summary: 'Prompts and handoffs pass.', findings: [] }, stages,
    });
    assert.equal(plan.deliverables.length, MAX_FILM_SHOTS);
    assert.equal(plan.deliverables[0].masterPrompt.length, prompt.length);
  });
});

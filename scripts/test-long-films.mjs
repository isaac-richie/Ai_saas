import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { productionPlanSchema } = await loadTs('core/validation/production-crew.ts');
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
});

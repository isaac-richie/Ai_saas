import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './load-ts.mjs';

const { AVOID_RESERVE, buildAvoidClause, supportsNegativePrompt } = await loadTs('core/utils/ai/avoid-clause.ts');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Avoid lists on models without a negative-prompt field', () => {
  it('knows which Kie models have no negative-prompt field', () => {
    for (const model of ['kling-3.0/video', 'bytedance/seedance-2-5', 'bytedance/seedance-2', 'nano-banana-pro', 'gpt-image/1.5', 'kling/ai-avatar-pro']) {
      assert.equal(supportsNegativePrompt(model), false, model);
    }
    for (const model of ['kling/v2-5-turbo-image-to-video-pro', 'wan/2-2-a14b-text-to-video-turbo', null]) {
      assert.equal(supportsNegativePrompt(model), true, String(model));
    }
  });

  it('writes the most important items first, without repeats', () => {
    assert.equal(buildAvoidClause(['flat even lighting', ' overlit face ', 'Flat even lighting', 'watermarks']), 'Avoid: flat even lighting, overlit face, watermarks.');
  });

  it('never runs past its room, and cuts at a whole item', () => {
    const items = Array.from({ length: 40 }, (_, i) => `unwanted thing number ${i}`);
    const clause = buildAvoidClause(items);
    assert.ok(clause.length <= AVOID_RESERVE, `${clause.length} characters`);
    assert.match(clause, /^Avoid: unwanted thing number 0, unwanted thing number 1,/);
    assert.match(clause, /number \d+\.$/);
  });

  it('is empty when there is nothing to avoid', () => {
    assert.equal(buildAvoidClause([]), '');
    assert.equal(buildAvoidClause(['  ', ',']), '');
  });

  it('the generator folds the list into the prompt and reserves room for it', () => {
    const action = read('../src/core/actions/fast-video.ts');
    assert.match(action, /supportsNegativePrompt\(payload\.settings\.model\) \? 0 : AVOID_RESERVE/);
    assert.match(action, /buildAvoidClause\(checked\.negativePrompt\.split\(","\), AVOID_RESERVE - 2\)/);
    // Identity locks lead, then lighting, then style.
    assert.match(action, /\$\{lockNegatives\.join\(", "\)\}, \$\{composed\.negativePrompt\}/);
    assert.ok(action.indexOf('lighting.negativeTokens.split') < action.indexOf('style.negativeTokens.split'));
  });

  it('the provider only sends the field to models that have it', () => {
    const provider = read('../src/infrastructure/ai/providers/kie.provider.ts');
    assert.match(provider, /request\.negative_prompt && supportsNegativePrompt\(model\)/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { loadTs } from './load-ts.mjs';

const { LIGHTING_PRESETS, LIGHTING_GROUPS, LIGHTING_TOKEN_LIMIT, findLightingPreset, lightingClause } = await loadTs('core/config/lighting-presets.ts');
const { productionShotSettingsSchema, crewShotSettings } = await loadTs('core/validation/production-settings.ts');
const { fastVideoRequestSchema } = await loadTs('core/validation/fast-video.ts');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Lighting library', () => {
  it('has 37 setups with unique ids and names', () => {
    assert.equal(LIGHTING_PRESETS.length, 37);
    assert.equal(new Set(LIGHTING_PRESETS.map((p) => p.id)).size, 37);
    assert.equal(new Set(LIGHTING_PRESETS.map((p) => p.name.toLowerCase())).size, 37);
  });

  it('every setup is complete, in a known group, and short enough to sit beside a long idea', () => {
    const groups = new Set(LIGHTING_GROUPS.map((g) => g.id));
    for (const p of LIGHTING_PRESETS) {
      assert.match(p.id, /^light_[a-z_]+$/, p.id);
      assert.ok(groups.has(p.group), `${p.id} group`);
      for (const field of ['name', 'mood', 'description', 'bestFor', 'promptTokens', 'negativeTokens']) {
        assert.ok(p[field] && p[field].trim().length > 2, `${p.id} ${field}`);
      }
      assert.ok(p.promptTokens.length <= LIGHTING_TOKEN_LIMIT, `${p.id} prompt is ${p.promptTokens.length} characters`);
      assert.ok(p.negativeTokens.length <= 120, `${p.id} negatives`);
    }
  });

  it('every group has at least three setups', () => {
    for (const g of LIGHTING_GROUPS) {
      assert.ok(LIGHTING_PRESETS.filter((p) => p.group === g.id).length >= 3, g.id);
    }
  });

  it('prompt words describe the light physically, not just its name', () => {
    for (const p of LIGHTING_PRESETS) {
      assert.ok(p.promptTokens.split(/[ ,:]+/).length >= 14, `${p.id} is too thin to guide a model`);
    }
  });

  it('finds setups by id and ignores unknown ids', () => {
    assert.equal(findLightingPreset('light_rembrandt')?.name, 'Rembrandt');
    assert.equal(findLightingPreset('nope'), undefined);
    assert.equal(findLightingPreset(null), undefined);
    assert.equal(lightingClause('nope'), '');
    assert.match(lightingClause('light_golden_hour'), /golden hour/i);
  });

  it('every setup has its example photo, small enough for a quick rail', () => {
    for (const p of LIGHTING_PRESETS) {
      const file = new URL(`../public/lighting/${p.id}.webp`, import.meta.url);
      assert.ok(existsSync(file), `${p.id} has no example photo`);
      assert.ok(statSync(file).size < 120_000, `${p.id} photo is too large`);
    }
  });

  it('every setup has a drawn swatch', () => {
    const visuals = read('../src/interface/components/fast-video/lighting-visuals.tsx');
    for (const p of LIGHTING_PRESETS) assert.ok(visuals.includes(`${p.id}:`), `${p.id} has no swatch recipe`);
  });
});

describe('Lighting in requests and films', () => {
  const request = (extra = {}) => ({
    request_type: 'fast_video',
    prompt_inputs: { text_subject: 'a dancer on a rooftop', aspect_ratio: '16:9', variation_setting: 'balanced', ...extra },
    settings: { duration_seconds: 5 },
  });

  it('a quick video request carries an optional lighting id', () => {
    assert.ok(fastVideoRequestSchema.safeParse(request({ lighting_preset_id: 'light_neon' })).success);
    assert.ok(fastVideoRequestSchema.safeParse(request()).success);
    assert.ok(fastVideoRequestSchema.safeParse(request({ lighting_preset_id: null })).success);
  });

  it('film shots accept a known lighting setup and refuse an unknown one', () => {
    assert.ok(productionShotSettingsSchema.safeParse([
      { model: 'kling', durationSeconds: 5, lighting: 'light_rembrandt' },
      { model: 'seedance', durationSeconds: 8 },
    ]).success);
    assert.equal(productionShotSettingsSchema.safeParse([
      { model: 'kling', durationSeconds: 5, lighting: 'light_made_up' },
      { model: 'kling', durationSeconds: 5 },
    ]).success, false);
  });

  it('the crew reads each lighting choice written out in words', () => {
    const settings = [
      { model: 'kling', durationSeconds: 5, lighting: 'light_candle' },
      { model: 'kling', durationSeconds: 6 },
    ];
    const crew = crewShotSettings(settings);
    assert.match(crew[0].lightingSetup, /^Candlelight: candlelight: flickering/);
    assert.equal('lightingSetup' in crew[1], false);
    assert.equal(crewShotSettings(undefined), null);
  });

  it('the generator puts lighting right after the idea and adds its negatives', () => {
    const action = read('../src/core/actions/fast-video.ts');
    assert.match(action, /if \(lighting\) parts\.push\(lighting\.promptTokens\)/);
    assert.match(action, /lighting \? lighting\.negativeTokens\.split/);
    assert.match(action, /promptBudgetFor\(payload\.settings\.model\) - \(lighting \?/, 'room is reserved so a long idea never pushes lighting out');
  });

  it('film shots send their chosen lighting when generated', () => {
    const production = read('../src/core/actions/production.ts');
    assert.match(production, /lighting_preset_id: lightingPresetId/);
    assert.match(production, /planned\.data\[shot\.sequence_order - 1\]\?\.lighting/);
  });
});

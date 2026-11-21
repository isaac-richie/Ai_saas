// Motion Ad Director, Phase 1: the state rules, the upload guard, charging and idempotency in the server
// actions, and the migration. The contract and timing have their own tests in motion-ads/scripts.
// Migration 0060 was also run in PGlite (Postgres) while building it: owner-only rows, one image per tag,
// one voice per ad, single-use idempotency keys, and a job claim two workers can never share.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './load-ts.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const state = await loadTs('core/services/motion-ad/state.ts');
const { validatePlan } = await loadTs('core/services/motion-ad/contract.ts');
const golden = () => JSON.parse(read('motion-ads/src/fixtures/golden-mist.json'));
const U = '11111111-1111-4111-8111-111111111111', AD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', F = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('which state a planned ad is in', () => {
  it('shots point at their own image tags, or null while they have none', () => {
    const plan = state.withImages(golden(), ['@image1', '@image3']);
    assert.deepEqual(plan.shots.map((s) => s.image_tag), ['@image1', null, '@image3', null, null, null]);
    assert.deepEqual([...state.shotsMissingImages(plan)], [2, 4, 5, 6]);
    assert.equal(state.planState(plan), 'awaiting_assets');
  });
  it('with every image in, it waits for approval, and the plan still validates', () => {
    const plan = state.withImages(golden(), [1, 2, 3, 4, 5, 6].map((n) => `@image${n}`));
    assert.equal(state.planState(plan), 'awaiting_approval');
    assert.equal(validatePlan(plan).ok, true);
  });
});

describe('approval and the final render', () => {
  const full = state.withImages(golden(), [1, 2, 3, 4, 5, 6].map((n) => `@image${n}`));
  it('approve needs a plan, every image and the rights box', () => {
    assert.deepEqual([...state.approvalProblems({ state: 'draft', plan: null }, true)], ['Plan the storyboard first.']);
    assert.match(state.approvalProblems({ state: 'awaiting_assets', plan: state.withImages(golden(), ['@image1']) }, true).join(' '), /Add images for shots 2, 3, 4, 5, 6\./);
    assert.match(state.approvalProblems({ state: 'awaiting_approval', plan: full }, false).join(' '), /Confirm you have the right to use these assets\./);
    assert.deepEqual([...state.approvalProblems({ state: 'awaiting_approval', plan: full }, true)], []);
    assert.match(state.approvalProblems({ state: 'building', plan: full }, true).join(' '), /isn't waiting for approval/);
  });
  it('the final render needs a watched preview and the cost the user saw', () => {
    assert.match(state.finalProblems({ state: 'awaiting_approval' }, '4k', 4).join(' '), /Watch the preview/);
    assert.deepEqual([...state.finalProblems({ state: 'preview_ready' }, '4k', state.FINAL_UNITS['4k'])], []);
    assert.match(state.finalProblems({ state: 'preview_ready' }, '4k', 2).join(' '), /cost changed to 4 generations/);
    assert.ok(state.FINAL_UNITS['4k'] > state.FINAL_UNITS['1080p'], '4K costs more');
  });
});

describe('uploads only into the owner’s own folder for this ad', () => {
  it('accepts the right path and file type', () => {
    assert.equal(state.isAdUploadPath(`${U}/motion-ads/${AD}/${F}.jpg`, U, AD, 'image'), true);
    assert.equal(state.isAdUploadPath(`${U}/motion-ads/${AD}/${F}.wav`, U, AD, 'voice'), true);
    assert.equal(state.isAdUploadPath(`${U}/motion-ads/${AD}/${F}.png`, U, AD, 'logo'), true);
  });
  it('refuses another user, another ad, the wrong type, SVG and odd paths', () => {
    assert.equal(state.isAdUploadPath(`${F}/motion-ads/${AD}/${F}.jpg`, U, AD, 'image'), false);
    assert.equal(state.isAdUploadPath(`${U}/motion-ads/${F}/${F}.jpg`, U, AD, 'image'), false);
    assert.equal(state.isAdUploadPath(`${U}/motion-ads/${AD}/${F}.wav`, U, AD, 'image'), false);
    assert.equal(state.isAdUploadPath(`${U}/motion-ads/${AD}/${F}.svg`, U, AD, 'logo'), false);
    assert.equal(state.isAdUploadPath(`${U}/motion-ads/${AD}/../x.jpg`, U, AD, 'image'), false);
  });
});

describe('the server actions', () => {
  const actions = read('src/core/actions/motion-ads.ts');
  it('everything is behind the flag, sign-in and beta access', () => {
    assert.match(actions, /if \(!MOTION_AD_ENABLED\) return \{ error: OFF \} as const/);
    assert.match(actions, /if \(!\(await hasBetaAccess\(user\.email\)\)\) return \{ error: BETA_LOCKED_MESSAGE \} as const/);
    assert.match(read('src/core/config/feature-flags.ts'), /MOTION_AD_ENABLED = toBool\(process\.env\.NEXT_PUBLIC_MOTION_ADS, false\)/);
  });
  it('state moves are conditional, so two tabs or a double click can’t both win', () => {
    assert.match(actions, /\.eq\("id", ad\.id\)\.eq\("state", ad\.state\)/);
  });
  it('approve and the final render are idempotent', () => {
    assert.equal((actions.match(/\.eq\("idempotency_key", parsed\.data\.idempotencyKey\)\.maybeSingle\(\)/g) ?? []).length, 2);
  });
  it('a failed plan charges nothing; planning is rate-limited', () => {
    assert.match(actions, /couldn't be planned this time\. Nothing was charged/);
    assert.match(actions, /checkRateLimit\(`motion-plan:\$\{g\.user\.id\}`/);
  });
  it('the final render holds credits first and gives them back if it can’t be queued', () => {
    assert.match(actions, /reserveUsageQuota\(g\.db, g\.user\.id, "fast_video", reservationId, units\)/);
    assert.match(actions, /needsUpgrade: true/);
    assert.match(actions, /await settleUsageQuota\(g\.user\.id, reservationId, false\)/);
  });
  it('uploads are re-read on the server: real image type and size, real voice length', () => {
    assert.match(actions, /const probe = probeImage\(bytes\)/);
    assert.match(actions, /const seconds = await voiceSeconds\(bytes, ext\)/);
    assert.match(actions, /const problem = voiceProblem\(seconds\)/);
    assert.match(actions, /if \(!isAdUploadPath\(storagePath, g\.user\.id, ad\.id, kind\)\)/);
  });
  it('the voice re-times the storyboard; Free-tier finals keep the watermark', () => {
    assert.match(actions, /const timed = applyVoice\(plan, Number\(row\.duration_s\), ad\.length_s\)/);
    assert.match(actions, /watermark: !paid/);
  });
});

describe('the worker and the card', () => {
  it('the worker refunds a failed final and charges a finished one', () => {
    const w = read('motion-ads/worker-core.mjs');
    assert.match(w, /if \(job\.type === "final"\) await settle\(ad\.user_id, job\.reservation_id, true\)/);
    assert.match(w, /if \(job\.type === "final"\) await settle\(job\.user_id, job\.reservation_id, false\)/);
    assert.match(w, /watermark: job\.type === "preview" \? true : version\.watermark/);
  });
  it('the card shows the cost before the final render, and never approves without the rights box', () => {
    const card = read('src/interface/components/fast-video/MotionAdCard.tsx');
    assert.match(card, /uses <strong>\{units\} generations<\/strong>/);
    assert.match(card, /if \(!rights\) \{ setRightsBanner\(true\)/);
    assert.match(card, /Watch and listen at full speed before you publish/);
    assert.match(read('src/interface/components/fast-video/FastVideoStudio.tsx'), /\{MOTION_AD_ENABLED && <MotionAdCard \/>\}/);
  });
});

describe('migration 0060', () => {
  const sql = read('src/infrastructure/supabase/migrations/0060_motion_ads.sql');
  it('owner-only tables and the brief’s states', () => {
    for (const t of ['motion_ads', 'motion_ad_assets', 'motion_ad_versions', 'motion_ad_jobs']) assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
    for (const s of ['draft', 'planning', 'awaiting_assets', 'awaiting_approval', 'approved', 'building', 'preview_ready', 'final_rendering', 'done', 'failed']) assert.ok(sql.includes(`'${s}'`), s);
  });
  it('idempotency keys are single-use and only the service role can claim jobs', () => {
    assert.match(sql, /unique \(user_id, idempotency_key\)/);
    assert.match(sql, /revoke all on function public\.claim_motion_ad_job\(integer\) from public, anon, authenticated/);
    assert.match(sql, /for update skip locked/);
  });
});

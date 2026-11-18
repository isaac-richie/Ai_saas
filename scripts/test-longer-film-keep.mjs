// Longer film, Keep Progress brief: Step 2 (shots are permanent) and Step 3 (locked media stays locked).
// The migration itself was also run end to end in PGlite (Postgres) while building it: re-plans kept
// shot ids, approved takes and locks; dropped shots were kept out of the sequence and came back.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './load-ts.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const { isProductionShot, isRetiredShot, livePlanShots } = await loadTs('core/services/production-shots.ts');
const locks = await loadTs('core/services/long-form-locks.ts');

describe('Step 2: which shots make up the film', () => {
  const made = (id, order, extra = {}) => ({ id, sequence_order: order, generation_settings: { production_job_id: 'job', ...extra } });
  it('production shots are the crew’s, not ones added by hand', () => {
    assert.equal(isProductionShot({ production_job_id: 'job' }), true);
    assert.equal(isProductionShot({}), false);
    assert.equal(isProductionShot(null), false);
    assert.equal(isProductionShot([]), false);
  });
  it('a shot a later plan left out is retired, not deleted', () => {
    assert.equal(isRetiredShot({ production_job_id: 'job', retired_at: '2026-11-18T10:00:00Z' }), true);
    assert.equal(isRetiredShot({ production_job_id: 'job' }), false);
    assert.equal(isRetiredShot(undefined), false);
  });
  it('lists the live plan shots in order, without hand-made or retired ones', () => {
    const shots = [made('c', 3), { id: 'hand', sequence_order: 2, generation_settings: {} }, made('a', 1), made('b', 2), made('gone', 4, { retired_at: 'x' })];
    assert.deepEqual(livePlanShots(shots, 3).map((s) => s.id), ['a', 'b', 'c']);
    assert.deepEqual(livePlanShots(shots, 2).map((s) => s.id), ['a', 'b']);
    assert.deepEqual(livePlanShots(shots, 0), []);
  });
  it('a retired shot inside the range is skipped, never counted as shot N', () => {
    assert.deepEqual(livePlanShots([made('a', 1), made('gone', 2, { retired_at: 'x' }), made('b', 3)], 2).map((s) => s.id), ['a', 'b']);
  });
});

describe('Step 2: migration 0058 updates shots in place', () => {
  const sql = read('src/infrastructure/supabase/migrations/0058_longer_film_keep_shots.sql');
  it('reuses the film’s existing workspace for a later revision', () => {
    assert.match(sql, /An earlier revision of this film already has a workspace: keep it\./);
    assert.match(sql, /update public\.shots set\s+name = left\(item->>'title', 120\)/);
    assert.match(sql, /where id = existing_id/);
  });
  it('never deletes a shot or a Take', () => {
    assert.doesNotMatch(sql, /delete from public\.shots\b/i);
    assert.doesNotMatch(sql, /delete from public\.shot_generations/i);
    assert.match(sql, /jsonb_build_object\('retired_at', now\(\)\)/);
  });
  it('only touches the crew’s shots, and brings a retired one back', () => {
    assert.match(sql, /sequence_order = shot_index and generation_settings \? 'production_job_id'/);
    assert.match(sql, /\(coalesce\(generation_settings, '\{\}'::jsonb\) - 'retired_at'\)/);
  });
  it('keeps the approved take: the in-place update never sets it', () => {
    const update = sql.slice(sql.indexOf('update public.shots set\n          name ='), sql.indexOf('where id = existing_id'));
    assert.doesNotMatch(update, /approved_take_id/);
  });
  it('links locked media to its permanent shot, now and for older locks', () => {
    for (const table of ['long_form_reference_bindings', 'long_form_video_bindings', 'long_form_audio_bindings']) {
      assert.match(sql, new RegExp(`alter table public\\.${table} add column if not exists shot_id uuid references public\\.shots\\(id\\) on delete set null`));
      assert.match(sql, new RegExp(`before insert or update of shot_number on public\\.${table}`));
      assert.match(sql, new RegExp(`update public\\.${table} set shot_id = public\\.long_form_shot_id\\(production_root_id, shot_number\\)`));
    }
  });
});

describe('Step 2: the app uses only the film’s live shots', () => {
  const production = read('src/core/actions/production.ts');
  it('Takes & review lists no retired shot, and a retired shot can’t be generated', () => {
    assert.match(production, /\.is\("generation_settings->>retired_at", null\)\.order\("sequence_order"\)/);
    assert.match(production, /return shot && !isRetiredShot\(shot\.generation_settings\) \? \{ production, shot \} : null/);
  });
  it('continuity is set on the live plan shots only', () => {
    assert.match(production, /const shots = livePlanShots\(sceneShots, parsedPlan\.deliverables\.length\)/);
  });
  it('approving a revised plan says it updates the shots', () => {
    const desk = read('src/interface/components/fast-video/ProductionDesk.tsx');
    assert.match(desk, /hasShotWorkspace\(job\) \? "Apply to my shots" : "Create production workspace"/);
  });
});

describe('Step 3: locked media survives a re-plan', () => {
  it('a re-planned (renamed) shot keeps its locks and can generate', () => {
    assert.deepEqual(locks.movedLockIssues([{ shotId: 's2', anchorTitle: "Sam's Morning" }], 2, 's2'), []);
  });
  it('only a lock from a different shot waits, and says why in plain words', () => {
    const [issue] = locks.movedLockIssues([{ shotId: 'old' }], 2, 's2', 'video references');
    assert.match(issue, /Some locked video references on shot 2 were set on a different shot that has since moved\./);
  });
  it('the generation gate checks the shot id, not the title', () => {
    const production = read('src/core/actions/production.ts');
    assert.match(production, /movedLockIssues\(shot\.sequence_order \? filmLocks\.shots\[shot\.sequence_order\] \?\? \[\] : \[\], shot\.sequence_order \?\? 0, shot\.id\)/);
    assert.doesNotMatch(production, /currentTitle\)/);
  });
  it('the Locked row shows the real reason, and Keep clears a re-plan note without re-adding anything', () => {
    const row = read('src/interface/components/fast-video/LockedMedia.tsx');
    assert.match(row, /Can&apos;t generate yet: \{reason\}/);
    assert.doesNotMatch(row, /Can&apos;t generate on \{modelName/);
    assert.match(row, /\{keeping \? "Keeping…" : "Keep"\}/);
    const actions = read('src/core/actions/long-form-locks.ts');
    assert.match(actions, /export async function keepShotLocks/);
    assert.match(actions, /db\.from\(table\)\.update\(patch\)/);
    assert.doesNotMatch(actions.slice(actions.indexOf('export async function keepShotLocks')), /\.delete\(|\.insert\(/);
  });
  it('a plain capability problem is still blocked, with its own words', () => {
    const big = { id: 'b', scopeType: 'shot', shotNumber: 2, assetId: 'a', assetUrl: 'https://x/face.png', sha256: 'f'.repeat(64), assetName: 'face.png', contentType: 'image/png', byteSize: 60 * 1024 * 1024, width: 1600, height: 1200, role: 'character', entityLabel: 'Sam', viewLabel: '' };
    const planned = locks.planLockedRequest(locks.resolveLocks([], [big]), 'bytedance/seedance-2-5', { continuityStartUrl: null, videos: [] });
    assert.equal(planned.ok, false);
    assert.match(planned.issues.join(' '), /face\.png is over \d+ MB/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { startTake, checkTake } = await loadTs('core/services/take-jobs.ts');
const { fastVideoRequestSchema } = await loadTs('core/validation/fast-video.ts');

/** In-memory tables with the query calls the take jobs use. Rows absent here are what RLS hides. */
function fakeDb(tables) {
  const from = (name) => {
    const rows = (tables[name] ||= []);
    let filters = [];
    let patch = null;
    let max = Infinity;
    const match = () => rows.filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      eq: (k, v) => { filters.push((r) => r[k] === v); return q; },
      in: (k, vs) => { filters.push((r) => vs.includes(r[k])); return q; },
      limit: (n) => { max = n; return q; },
      update: (p) => { patch = p; return q; },
      maybeSingle: async () => ({ data: structuredClone(match()[0] ?? null) }),
      then: (resolve) => {
        if (patch) { for (const r of match()) Object.assign(r, structuredClone(patch)); return resolve({ error: null }); }
        return resolve({ data: structuredClone(match().slice(0, max)) });
      },
    };
    return q;
  };
  return { from, tables };
}

const SHOT_URL = 'https://x.supabase.co/storage/v1/object/public/renders/u/shot2.mp4';
function world(overrides = {}) {
  return fakeDb({
    timeline_projects: [{ id: 'tl', project_id: 'p1' }],
    projects: [{ id: 'p1', aspect_ratio: '9:16' }],
    timeline_tracks: [{ id: 'v', timeline_id: 'tl', track_type: 'video', locked: false }, { id: 'a', timeline_id: 'tl', track_type: 'audio', locked: false }],
    timeline_clips: [
      { id: 'c1', track_id: 'v', asset_url: 'https://x/shot1.mp4', start_ms: 0, end_ms: 4000, trim_start_ms: 0, metadata: {} },
      { id: 'c2', track_id: 'v', asset_url: SHOT_URL, start_ms: 4000, end_ms: 9000, trim_start_ms: 500, metadata: { storyboard_item_id: 'item2', source_duration_ms: 6000 } },
      { id: 'c3', track_id: 'v', asset_url: 'https://x/shot3.mp4', start_ms: 9000, end_ms: 12000, trim_start_ms: 0, metadata: {} },
      { id: 'm', track_id: 'a', asset_url: 'https://x/song.mp3', start_ms: 0, end_ms: 12000, trim_start_ms: 0, metadata: {} },
    ],
    fast_video_storyboard_items: [{ id: 'item2', project_id: 'p1', scene_id: 's1', url: SHOT_URL, prompt: 'She turns to the camera at sunset', enhanced_prompt: null, direction: '', model_family_id: 'kling', duration_seconds: 5, start_frame: null, end_frame: null, media_references: [] }],
    ...overrides,
  });
}

function generator({ start = { data: { taskId: 'task-1', status: 'processing' } }, polls = [] } = {}) {
  const calls = { generate: [], poll: [] };
  return {
    calls,
    generate: async (req) => { calls.generate.push(req); return typeof start === 'function' ? start(req) : start; },
    poll: async (id) => { calls.poll.push(id); return polls.length ? polls.shift() : { data: { status: 'processing', url: null } }; },
  };
}
const clip = (db, id) => db.tables.timeline_clips.find((c) => c.id === id);

describe('making a new take of a timeline shot', () => {
  it('runs start → waiting → done, keeps the old take and the shot length', async () => {
    const db = world();
    const gen = generator({ polls: [{ data: { status: 'processing', url: null } }, { data: { status: 'completed', url: 'https://x/new.mp4' } }] });
    const started = await startTake(db, gen, { clip_id: 'c2' });
    assert.equal(started.status, 202);
    const req = gen.calls.generate[0];
    assert.ok(fastVideoRequestSchema.safeParse(req).success, 'a valid generator request');
    assert.match(req.prompt_inputs.text_subject, /She turns to the camera/);
    assert.equal(req.prompt_inputs.aspect_ratio, '9:16');
    assert.equal(clip(db, 'c2').metadata.pending_take.task_id, 'task-1');

    assert.equal((await checkTake(db, gen, 'c2')).body.status, 'processing');
    assert.equal(clip(db, 'c2').asset_url, SHOT_URL, 'nothing changes while it is still being made');

    assert.equal((await checkTake(db, gen, 'c2')).body.status, 'completed');
    const c2 = clip(db, 'c2');
    assert.equal(c2.asset_url, 'https://x/new.mp4');
    assert.equal(c2.end_ms - c2.start_ms, 5000, 'same length on the timeline');
    assert.equal(c2.trim_start_ms, 0);
    assert.equal(c2.metadata.pending_take, undefined);
    assert.equal(c2.metadata.storyboard_item_id, 'item2');
    assert.deepEqual(c2.metadata.takes.map((t) => t.url), [SHOT_URL]);
    assert.equal(clip(db, 'c3').start_ms, 9000, 'later shots untouched');
    assert.equal((await checkTake(db, gen, 'c2')).body.status, 'idle', 'nothing left to check');
  });

  it('a different length closes up the shots after it, and never moves the music', async () => {
    const db = world();
    const gen = generator({ start: { data: { taskId: 't', status: 'processing', durationSeconds: 8 } }, polls: [{ data: { status: 'completed', url: 'https://x/long.mp4' } }] });
    assert.equal((await startTake(db, gen, { clip_id: 'c2', duration_sec: 8 })).status, 202);
    assert.equal(gen.calls.generate[0].settings.duration_seconds, 8);
    await checkTake(db, gen, 'c2');
    assert.deepEqual([clip(db, 'c2').start_ms, clip(db, 'c2').end_ms], [4000, 12000]);
    assert.deepEqual([clip(db, 'c3').start_ms, clip(db, 'c3').end_ms], [12000, 15000]);
    assert.deepEqual([clip(db, 'm').start_ms, clip(db, 'm').end_ms], [0, 12000]);
  });

  it('places a take the generator finishes immediately', async () => {
    const db = world();
    const gen = generator({ start: { data: { status: 'completed', url: 'https://x/fast.mp4', durationSeconds: 5 } } });
    assert.equal((await startTake(db, gen, { clip_id: 'c2' })).body.status, 'completed');
    assert.equal(clip(db, 'c2').asset_url, 'https://x/fast.mp4');
  });

  it('never starts a second paid generation while one is running', async () => {
    const db = world();
    const gen = generator();
    await startTake(db, gen, { clip_id: 'c2' });
    const again = await startTake(db, gen, { clip_id: 'c2' });
    assert.equal(again.status, 409);
    assert.equal(gen.calls.generate.length, 1);
  });

  it('a generator refusal (e.g. no allowance left) changes nothing', async () => {
    const db = world();
    const before = structuredClone(db.tables.timeline_clips);
    const gen = generator({ start: { error: 'You have used all your generations this month.' } });
    const res = await startTake(db, gen, { clip_id: 'c2' });
    assert.equal(res.status, 502);
    assert.match(res.body.error, /used all your generations/);
    assert.deepEqual(db.tables.timeline_clips, before);
  });

  it('a failed take clears the wait and keeps the current footage', async () => {
    const db = world();
    const gen = generator({ polls: [{ data: { status: 'failed', url: null, error: 'Content was flagged.' } }] });
    await startTake(db, gen, { clip_id: 'c2' });
    const res = await checkTake(db, gen, 'c2');
    assert.equal(res.body.status, 'failed');
    assert.match(res.body.error, /flagged/);
    assert.equal(clip(db, 'c2').asset_url, SHOT_URL);
    assert.equal(clip(db, 'c2').metadata.pending_take, undefined);
    assert.equal((await startTake(db, gen, { clip_id: 'c2' })).status, 202, 'can try again');
  });

  it('a hiccup while checking is not a failure', async () => {
    const db = world();
    const gen = generator({ polls: [{ error: 'Polling failed' }] });
    await startTake(db, gen, { clip_id: 'c2' });
    assert.equal((await checkTake(db, gen, 'c2')).body.status, 'processing');
    assert.ok(clip(db, 'c2').metadata.pending_take, 'still waiting');
  });

  it('a take abandoned for over 30 minutes is stopped, and a new one can start', async () => {
    const db = world();
    clip(db, 'c2').metadata.pending_take = { task_id: 'old', started_at: '2020-01-01T00:00:00Z', duration_sec: 5 };
    const gen = generator();
    assert.equal((await checkTake(db, gen, 'c2')).body.status, 'failed');
    assert.equal(gen.calls.poll.length, 0, 'does not poll a dead job');
    assert.equal((await startTake(db, gen, { clip_id: 'c2' })).status, 202);
  });

  it('finds the storyboard shot again from an earlier take after the footage changed', async () => {
    const db = world();
    const c2 = clip(db, 'c2');
    c2.asset_url = 'https://x/take2.mp4';
    c2.metadata = { takes: [{ url: SHOT_URL, source_duration_ms: 6000, created_at: 't' }] };
    const gen = generator();
    assert.equal((await startTake(db, gen, { clip_id: 'c2' })).status, 202);
  });

  it('refuses shots it cannot remake', async () => {
    const gen = generator();
    assert.equal((await startTake(world(), gen, { clip_id: 'c1' })).status, 422, 'not from the storyboard');
    assert.equal((await startTake(world(), gen, { clip_id: 'm' })).status, 400, 'music is not a shot');
    assert.equal((await startTake(world(), gen, { clip_id: 'nope' })).status, 404, "someone else's or deleted");
    const locked = world();
    locked.tables.timeline_tracks[0].locked = true;
    assert.equal((await startTake(locked, gen, { clip_id: 'c2' })).status, 409);
    const otherProject = world();
    otherProject.tables.fast_video_storyboard_items[0].project_id = 'someone-else';
    assert.equal((await startTake(otherProject, gen, { clip_id: 'c2' })).status, 422, 'only this project’s storyboard is used');
    assert.equal(gen.calls.generate.length, 0, 'nothing was generated');
  });
});

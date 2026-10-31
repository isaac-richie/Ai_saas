import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const A = await loadTs('core/services/edit-agent.ts');
const { useTimelineStore } = await loadTs('interface/hooks/use-timeline-store.ts');
const { startTake } = await loadTs('core/services/take-jobs.ts');
const { applyTake } = await loadTs('core/services/take-regenerate.ts');
const { saveRevision, restoreRevision } = await loadTs('core/services/timeline-revisions.ts');

const c = (id, start, end, extra = {}) => ({ id, start_ms: start, end_ms: end, trim_start_ms: 0, volume: 1, transition_out: null, transition_out_ms: 0, color_grade_id: null, metadata: { source_duration_ms: 8000 }, ...extra });
const locked = (id, start, end, extra = {}) => c(id, start, end, { metadata: { source_duration_ms: 8000, locked: true }, ...extra });
const state = () => ({ clips: [c('a', 0, 4000), locked('b', 4000, 8000), c('c', 8000, 12000)], timeline_grade_id: 'natural', beats: Array.from({ length: 40 }, (_, i) => 0.3 + i * 0.7) });
const span = (out, id) => { const x = out.clips.find((k) => k.id === id); return x.end_ms - x.start_ms; };

describe('approved and locked shots in the AI editor', () => {
  it('refuses to change a locked shot, and says why', () => {
    for (const cmd of [
      { type: 'trim_clip', clip: 2, duration_sec: 1 },
      { type: 'remove_clip', clip: 2 },
      { type: 'move_clip', clip: 2, to_position: 1 },
      { type: 'set_transition', clip: 2, transition: 'crossfade', duration_ms: 500 },
      { type: 'set_color_grade', clip: 2, grade_id: 'cool-noir' },
      { type: 'set_volume', clip: 2, volume: 0 },
      { type: 'set_speed', clip: 2, speed: 0.5 },
    ]) {
      const out = A.applyEditCommands(state(), [cmd]);
      assert.equal(out.applied.length, 0, cmd.type);
      assert.match(out.rejected[0].reason, /Shot 2 is locked/);
      assert.equal(span(out, 'b'), 4000);
    }
  });
  it('re-pacing and beat sync change the other shots but not the locked one', () => {
    const paced = A.applyEditCommands(state(), [{ type: 'apply_pacing', profile_id: Object.keys(A.describeTimelineForAgent(state())).length ? 'trailer' : 'trailer' }]);
    assert.equal(span(paced, 'b'), 4000);
    assert.equal(paced.clips.find((x) => x.id === 'b').transition_out, null);
    const synced = A.applyEditCommands(state(), [{ type: 'sync_to_music' }]);
    assert.equal(span(synced, 'b'), 4000);
  });
  it('a new look for the whole video leaves a locked shot with the look it was approved in', () => {
    const out = A.applyEditCommands(state(), [{ type: 'set_color_grade', clip: null, grade_id: 'golden-hour' }]);
    assert.equal(out.timeline_grade_id, 'golden-hour');
    assert.equal(out.clips.find((x) => x.id === 'b').color_grade_id, 'natural');
    assert.equal(out.clips.find((x) => x.id === 'a').color_grade_id, null);
  });
  it('other shots still move around a locked one', () => {
    const out = A.applyEditCommands(state(), [{ type: 'remove_clip', clip: 1 }]);
    assert.deepEqual(out.clips.map((x) => [x.id, x.start_ms]), [['b', 0], ['c', 4000]]);
  });
  it('the AI is told which shots are locked', () => {
    assert.equal(A.describeTimelineForAgent(state()).clips[1].locked, true);
    assert.equal(A.describeTimelineForAgent(state()).clips[0].locked, undefined);
    assert.match(A.AGENT_INSTRUCTIONS, /locked/);
  });
});

describe('locks in the editor', () => {
  const s = () => useTimelineStore.getState();
  const row = (id, t) => ({ id, timeline_id: 'tl', name: id, track_type: t, order_index: 0, muted: false, locked: false, visible: true, created_at: '' });
  const clip = (id, start, end, extra = {}) => ({ id, track_id: 'v', take_id: null, asset_url: `https://s/${id}.mp4`, clip_type: 'video', start_ms: start, end_ms: end, trim_start_ms: 0, trim_end_ms: null, volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: null, transition_out_ms: 0, color_grade_id: null, metadata: {}, order_index: 0, created_at: '', updated_at: '', ...extra });
  const load = () => s().load({ timeline: { id: 'tl', project_id: 'p', name: 'm', fps: 24, resolution: '1920x1080', duration_ms: 0, color_grade_id: 'natural', created_at: '', updated_at: '' }, tracks: [row('v', 'video')], clips: [clip('a', 0, 3000), clip('b', 3000, 6000)] });
  it('locking is one undoable step, and a locked shot refuses every hand edit', () => {
    load();
    s().toggleClipLock('a');
    assert.equal(s().clips.find((x) => x.id === 'a').metadata.locked, true);
    const before = s().clips;
    s().updateClip('a', { volume: 0 });
    s().removeClip('a');
    s().split('a', 1500);
    s().reorder('a', 1);
    s().setSpeed('a', 2);
    assert.equal(s().clips, before);
    s().undo();
    assert.equal(s().clips.find((x) => x.id === 'a').metadata.locked, undefined);
  });
  it('unlocking makes it editable again', () => {
    load();
    s().toggleClipLock('a');
    s().toggleClipLock('a');
    s().updateClip('a', { volume: 0.5 });
    assert.equal(s().clips.find((x) => x.id === 'a').volume, 0.5);
  });
});

describe('new takes and locks', () => {
  it('a locked shot cannot be remade, and nothing is generated', async () => {
    const calls = [];
    const db = { from: (t) => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: t === 'timeline_clips' ? { id: 'c', track_id: 'v', asset_url: 'x', start_ms: 0, end_ms: 1, trim_start_ms: 0, metadata: { locked: true } } : t === 'timeline_tracks' ? { id: 'v', timeline_id: 'tl', track_type: 'video', locked: false } : { id: 'tl', project_id: 'p' } }) }; return q; } };
    const res = await startTake(db, { generate: async (r) => { calls.push(r); return {}; }, poll: async () => ({}) }, { clip_id: 'c' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /locked/);
    assert.equal(calls.length, 0);
  });
  it('a shorter new take is flagged for review; a same-length one is not', () => {
    const base = { asset_url: 'https://s/a.mp4', start_ms: 0, end_ms: 5000, trim_start_ms: 0, metadata: {} };
    const short = applyTake(base, { url: 'https://s/b.mp4', source_duration_ms: 3200, created_at: 't' }, { keepLength: true });
    assert.match(short.metadata.review_note, /now 3.2s instead of 5.0s/);
    const same = applyTake(base, { url: 'https://s/c.mp4', source_duration_ms: 6000, created_at: 't' }, { keepLength: true });
    assert.equal(same.metadata.review_note, undefined);
    const clears = applyTake({ ...short }, { url: 'https://s/d.mp4', source_duration_ms: 9000, created_at: 't' }, { keepLength: true });
    assert.equal(clears.metadata.review_note, undefined, 'a fitting take clears an old flag');
  });
});

describe('AI changes in plain words', () => {
  const grade = (id) => ({ 'golden-hour': 'Golden Hour' })[id] ?? id;
  it('describes every kind of change', () => {
    const lines = [
      { type: 'trim_clip', clip: 2, duration_sec: 2.46 },
      { type: 'remove_clip', clip: 3 },
      { type: 'move_clip', clip: 4, to_position: 1 },
      { type: 'set_transition', clip: 1, transition: 'fade_black', duration_ms: 800 },
      { type: 'set_color_grade', clip: null, grade_id: 'golden-hour' },
      { type: 'set_volume', clip: 1, volume: 0.5 },
      { type: 'set_speed', clip: 3, speed: 0.5 },
      { type: 'apply_pacing', profile_id: 'trailer' },
      { type: 'sync_to_music' },
    ].map((cmd) => A.describeCommand(cmd, grade));
    assert.deepEqual(lines, [
      'Shot 2: 2.5s long', 'Removed shot 3', 'Moved shot 4 to position 1', 'Fade black after shot 1',
      'Golden Hour look for the whole video', 'Shot 1 volume 50%', 'Shot 3 in slow motion (0.5x)', 'Re-paced every shot (trailer rhythm)', 'Lined up the cuts with the beat',
    ]);
  });
  it('the plan format still has no oneOf, and asks about new footage', async () => {
    const { zodTextFormat } = await import('openai/helpers/zod');
    const json = JSON.stringify(zodTextFormat(A.agentPlanSchema, 'edit_plan').schema);
    assert.ok(!json.includes('"oneOf"'));
    assert.ok(json.includes('new_shots'));
    assert.match(A.AGENT_INSTRUCTIONS, /new_shots/);
  });
});

describe('saved versions', () => {
  function fakeDb(tables) {
    const from = (name) => {
      const rows = (tables[name] ||= []);
      let filters = [], patch = null, insert = null, upsert = null, del = false, range = null, fields = null;
      const match = () => rows.filter((r) => filters.every((f) => f(r)));
      const q = {
        select: (f) => { fields = f; return q; },
        eq: (k, v) => { filters.push((r) => r[k] === v); return q; },
        in: (k, v) => { filters.push((r) => v.includes(r[k])); return q; },
        order: () => q,
        range: (a, b) => { range = [a, b]; return q; },
        update: (p) => { patch = p; return q; },
        delete: () => { del = true; return q; },
        insert: (row) => { insert = { id: `r${rows.length + 1}`, created_at: new Date().toISOString(), ...structuredClone(row) }; return q; },
        upsert: (list) => { upsert = list; return q; },
        maybeSingle: async () => ({ data: structuredClone(match()[0] ?? null) }),
        single: async () => { rows.push(insert); return { data: { id: insert.id }, error: null }; },
        then: (resolve) => {
          if (patch) { match().forEach((r) => Object.assign(r, patch)); return resolve({ error: null }); }
          if (del) { const gone = new Set(match()); tables[name] = rows.filter((r) => !gone.has(r)); return resolve({ error: null }); }
          if (upsert) { for (const u of upsert) { const i = rows.findIndex((r) => r.id === u.id); if (i >= 0) rows[i] = { ...rows[i], ...u }; else rows.push(structuredClone(u)); } return resolve({ error: null }); }
          const m = match();
          return resolve({ data: structuredClone(range ? m.slice(range[0], range[1] + 1) : m) });
        },
      };
      return q;
    };
    return { from, tables };
  }
  it('restores the shots and look exactly, removes shots added since, and saves the current cut first', async () => {
    const db = fakeDb({
      timeline_projects: [{ id: 'tl', color_grade_id: 'natural' }],
      timeline_tracks: [{ id: 'v', timeline_id: 'tl' }],
      timeline_clips: [{ id: 'a', track_id: 'v', start_ms: 0, end_ms: 4000, metadata: { x: 1 } }, { id: 'b', track_id: 'v', start_ms: 4000, end_ms: 9000, metadata: {} }],
      timeline_revisions: [],
    });
    const rev = await saveRevision(db, { userId: 'u', timelineId: 'tl', trackId: 'v', label: 'Before the AI' });
    assert.ok(rev);
    // The AI then trims, removes and adds, and changes the look.
    db.tables.timeline_clips = [{ id: 'a', track_id: 'v', start_ms: 0, end_ms: 1000, metadata: { x: 1 } }, { id: 'n', track_id: 'v', start_ms: 1000, end_ms: 3000, metadata: {} }];
    db.tables.timeline_projects[0].color_grade_id = 'cool-noir';
    const res = await restoreRevision(db, { userId: 'u', revisionId: rev });
    assert.ok(res.ok);
    assert.deepEqual(db.tables.timeline_clips.map((r) => [r.id, r.start_ms, r.end_ms]).sort(), [['a', 0, 4000], ['b', 4000, 9000]]);
    assert.equal(db.tables.timeline_projects[0].color_grade_id, 'natural');
    assert.equal(db.tables.timeline_revisions.length, 2, 'the cut before restoring was saved too');
  });
  it('refuses a version whose shots row belongs to another timeline', async () => {
    const db = fakeDb({ timeline_revisions: [{ id: 'r1', timeline_id: 'tl', snapshot: { grade: 'x', track_id: 'other', clips: [] } }], timeline_tracks: [{ id: 'other', timeline_id: 'someone-else' }] });
    assert.ok('error' in (await restoreRevision(db, { userId: 'u', revisionId: 'r1' })));
  });
});

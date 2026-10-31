import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const R = await loadTs('core/services/video-review.ts');

/** In-memory tables with the calls the review service makes. */
function fakeDb(tables) {
  let seq = 0;
  const from = (name) => {
    const rows = (tables[name] ||= []);
    let filters = [];
    let patch = null;
    let insert = null;
    let countOnly = false;
    let max = Infinity;
    const pick = (row, fields) => (fields ? Object.fromEntries(fields.split(',').map((f) => f.trim()).map((f) => [f, row[f]])) : row);
    let fields = null;
    const match = () => rows.filter((r) => filters.every((f) => f(r)));
    const q = {
      select: (f, opts) => { fields = f; if (opts?.head) countOnly = true; return q; },
      eq: (k, v) => { filters.push((r) => r[k] === v); return q; },
      order: () => q,
      limit: (n) => { max = n; return q; },
      update: (p) => { patch = p; return q; },
      insert: (row) => { insert = { id: `n${++seq}`, resolved: false, created_at: new Date(Date.now() + seq).toISOString(), ...row }; return q; },
      maybeSingle: async () => ({ data: match()[0] ? structuredClone(pick(match()[0], fields)) : null }),
      single: async () => { rows.push(insert); return { data: structuredClone(pick(insert, fields)), error: null }; },
      then: (resolve) => {
        if (patch) { for (const r of match()) Object.assign(r, patch); return resolve({ error: null }); }
        if (countOnly) return resolve({ count: match().length });
        return resolve({ data: structuredClone(match().slice(0, max).map((r) => pick(r, fields))) });
      },
    };
    return q;
  };
  return { from, tables };
}

const TOKEN = R.newShareToken();
const world = (extra = {}) => fakeDb({
  video_shares: [{ id: 's1', token: TOKEN, user_id: 'owner', project_id: 'p', title: 'Golden Hour', video_url: 'https://x/v.mp4', duration_ms: 20000, status: 'in_review', allow_comments: true, revoked: false, created_at: '2026-10-31', ...extra }],
  video_share_notes: [],
});

describe('review links', () => {
  it('tokens are long, random and url-safe', () => {
    const a = R.newShareToken(), b = R.newShareToken();
    assert.equal(a.length, 43);
    assert.notEqual(a, b);
    assert.ok(R.isShareToken(a));
    for (const bad of ['', 'short', 'x'.repeat(44), `${'a'.repeat(42)}/`, `${'a'.repeat(42)}%`, null, 42, "' or 1=1 --"]) assert.ok(!R.isShareToken(bad), String(bad));
  });

  it('a guest sees the video, status and notes, never the owner or the token', async () => {
    const share = await R.getShareForGuest(world(), TOKEN);
    assert.equal(share.title, 'Golden Hour');
    assert.deepEqual(Object.keys(share).sort(), ['allow_comments', 'created_at', 'duration_ms', 'id', 'notes', 'status', 'title', 'video_url']);
  });

  it('unknown, malformed and turned-off links show nothing', async () => {
    assert.equal(await R.getShareForGuest(world(), R.newShareToken()), null);
    assert.equal(await R.getShareForGuest(world(), 'nope'), null);
    assert.equal(await R.getShareForGuest(world({ revoked: true }), TOKEN), null);
    assert.equal((await R.addGuestNote(world({ revoked: true }), TOKEN, { name: 'A', body: 'hi' })).status, 404);
  });

  it('saves a note pinned to a moment, kept inside the video', async () => {
    const db = world();
    const ok = await R.addGuestNote(db, TOKEN, { name: 'Ada', body: 'Hold this shot longer', at_ms: 12345.6 });
    assert.equal(ok.note.at_ms, 12346);
    assert.equal(ok.note.kind, 'note');
    assert.equal((await R.addGuestNote(db, TOKEN, { name: 'Ada', body: 'x', at_ms: 999999 })).note.at_ms, 20000);
    assert.equal((await R.addGuestNote(db, TOKEN, { name: 'Ada', body: 'x', at_ms: -5 })).note.at_ms, 0);
    assert.equal((await R.addGuestNote(db, TOKEN, { name: 'Ada', body: 'x', at_ms: 'soon' })).note.at_ms, null);
  });

  it('needs a name, and words for a note', async () => {
    assert.equal((await R.addGuestNote(world(), TOKEN, { name: '   ', body: 'hi' })).status, 400);
    assert.equal((await R.addGuestNote(world(), TOKEN, { name: 'Ada', body: '  ' })).status, 400);
    assert.equal((await R.addGuestNote(world(), TOKEN, { name: 'Ada' })).status, 400);
  });

  it('keeps notes to plain, capped text', async () => {
    const res = await R.addGuestNote(world(), TOKEN, { name: 'A\u0000da‮', body: 'ok​\u0007 ' + 'x'.repeat(5000), at_ms: 0 });
    assert.equal(res.note.author_name, 'Ada');
    assert.ok(res.note.body.startsWith('ok x'));
    assert.equal(res.note.body.length, R.MAX_NOTE_CHARS);
    assert.equal(R.cleanText({ evil: true }, 10), '');
    assert.equal(R.cleanText('a\n\n\n\n\nb', 10), 'a\n\nb');
  });

  it('approving or asking for changes updates the video’s status, and is about the whole video', async () => {
    const db = world();
    const ok = await R.addGuestNote(db, TOKEN, { name: 'Client', kind: 'approved', at_ms: 5000 });
    assert.equal(ok.status, 'approved');
    assert.equal(ok.note.at_ms, null);
    assert.equal(db.tables.video_shares[0].status, 'approved');
    const changes = await R.addGuestNote(db, TOKEN, { name: 'Client', kind: 'changes_requested', body: 'Shorter intro' });
    assert.equal(changes.status, 'changes_requested');
    assert.equal(db.tables.video_shares[0].status, 'changes_requested');
  });

  it('treats any other kind as a plain note, so a guest cannot set odd states', async () => {
    const res = await R.addGuestNote(world(), TOKEN, { name: 'A', body: 'hi', kind: 'resolved' });
    assert.equal(res.note.kind, 'note');
    assert.equal(res.status, 'in_review');
  });

  it('respects closed notes and the per-video limit', async () => {
    assert.equal((await R.addGuestNote(world({ allow_comments: false }), TOKEN, { name: 'A', body: 'hi' })).status, 403);
    const db = world();
    db.tables.video_share_notes = Array.from({ length: R.MAX_NOTES_PER_SHARE }, (_, i) => ({ id: `x${i}`, share_id: 's1' }));
    assert.equal((await R.addGuestNote(db, TOKEN, { name: 'A', body: 'hi' })).status, 429);
  });

  it('formats note times as minutes and seconds', () => {
    assert.equal(R.noteTime(0), '0:00');
    assert.equal(R.noteTime(75400), '1:15');
    assert.equal(R.noteTime(null), '');
  });
});

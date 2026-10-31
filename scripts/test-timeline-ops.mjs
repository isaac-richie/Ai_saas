import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { trimClip, reorderClip, dropIndex, removeAndRipple, splitClip, sourceDurationMs, timelineToOutputMs, outputToTimelineMs, moveFreeClip, trimFreeClip, songBeatsOutputSec, syncVideoToSong } = await loadTs('core/services/timeline-ops.ts');
const { record, undo, redo, emptyHistory, HISTORY_LIMIT, COALESCE_MS } = await loadTs('interface/lib/history.ts');

const clip = (id, start, end, extra = {}) => ({ id, track_id: 'v', start_ms: start, end_ms: end, trim_start_ms: 0, metadata: {}, ...extra });
const three = () => [clip('a', 0, 4000, { metadata: { source_duration_ms: 6000 } }), clip('b', 4000, 9000), clip('c', 9000, 12000)];
const spans = (cs, track = 'v') => cs.filter((c) => c.track_id === track).sort((x, y) => x.start_ms - y.start_ms).map((c) => [c.id, c.start_ms, c.end_ms]);

describe('trimClip', () => {
  it('shortens the tail and ripples later clips', () => {
    assert.deepEqual(spans(trimClip(three(), 'a', 'end', -1000)), [['a', 0, 3000], ['b', 3000, 8000], ['c', 8000, 11000]]);
  });
  it('extends the tail only up to the footage length', () => {
    assert.deepEqual(spans(trimClip(three(), 'a', 'end', 99999))[0], ['a', 0, 6000]);
  });
  it('cannot extend a clip whose footage length is unknown', () => {
    assert.deepEqual(spans(trimClip(three(), 'b', 'end', 2000))[1], ['b', 4000, 9000]);
  });
  it('never goes below the minimum length', () => {
    const out = trimClip(three(), 'c', 'end', -99999);
    assert.equal(out.find((c) => c.id === 'c').end_ms - out.find((c) => c.id === 'c').start_ms, 300);
  });
  it('trimming the head moves the in-point and shortens the clip', () => {
    const out = trimClip(three(), 'b', 'start', 1500);
    const b = out.find((c) => c.id === 'b');
    assert.equal(b.trim_start_ms, 1500);
    assert.deepEqual([b.start_ms, b.end_ms], [4000, 7500]);
    assert.equal(out.find((c) => c.id === 'c').start_ms, 7500);
  });
  it('head cannot move before the start of the footage', () => {
    const b = trimClip(three(), 'b', 'start', -5000).find((c) => c.id === 'b');
    assert.equal(b.trim_start_ms, 0);
    assert.equal(b.end_ms - b.start_ms, 5000);
  });
  it('head can be pulled back out after being trimmed', () => {
    const once = trimClip(three(), 'b', 'start', 2000);
    const back = trimClip(once, 'b', 'start', -1000).find((c) => c.id === 'b');
    assert.equal(back.trim_start_ms, 1000);
    assert.equal(back.end_ms - back.start_ms, 4000);
  });
  it('leaves other tracks alone', () => {
    const cs = [...three(), clip('m', 0, 20000, { track_id: 'music' })];
    assert.deepEqual(spans(trimClip(cs, 'a', 'end', -2000), 'music'), [['m', 0, 20000]]);
  });
  it('ignores unknown ids and NaN', () => {
    const cs = three();
    assert.equal(trimClip(cs, 'zzz', 'end', 100), cs);
    assert.equal(trimClip(cs, 'a', 'end', NaN), cs);
  });
});

describe('reorderClip and dropIndex', () => {
  it('moves a clip and keeps the track gapless', () => {
    assert.deepEqual(spans(reorderClip(three(), 'c', 0)), [['c', 0, 3000], ['a', 3000, 7000], ['b', 7000, 12000]]);
  });
  it('clamps the target index', () => {
    assert.deepEqual(spans(reorderClip(three(), 'a', 99)).map((s) => s[0]), ['b', 'c', 'a']);
  });
  it('drop index follows the midpoints of the other clips', () => {
    const cs = three();
    assert.equal(dropIndex(cs, 'c', 0), 0);
    assert.equal(dropIndex(cs, 'c', 3000), 1);
    assert.equal(dropIndex(cs, 'a', 100000), 2);
  });
});

describe('removeAndRipple and splitClip', () => {
  it('removing closes the gap', () => {
    assert.deepEqual(spans(removeAndRipple(three(), 'a')), [['b', 0, 5000], ['c', 5000, 8000]]);
  });
  it('splits into two halves that continue the footage', () => {
    const out = splitClip(three(), 'b', 6000, 'b2');
    assert.deepEqual(spans(out), [['a', 0, 4000], ['b', 4000, 6000], ['b2', 6000, 9000], ['c', 9000, 12000]]);
    assert.equal(out.find((c) => c.id === 'b2').trim_start_ms, 2000);
  });
  it('refuses splits that would leave a sliver', () => {
    const cs = three();
    assert.equal(splitClip(cs, 'b', 4100, 'x'), cs);
    assert.equal(splitClip(cs, 'b', 8900, 'x'), cs);
  });
  it('reads source duration from metadata', () => {
    assert.equal(sourceDurationMs(clip('x', 0, 1, { metadata: { source_duration_ms: 5000 } })), 5000);
    assert.equal(sourceDurationMs(clip('x', 0, 1, { metadata: null })), null);
  });
});

describe('undo history', () => {
  it('undo and redo walk back and forth', () => {
    let h = record(emptyHistory(), 'v1', 'a', 0);
    h = record(h, 'v2', 'b', 10_000);
    const u = undo(h, 'v3');
    assert.equal(u.state, 'v2');
    const u2 = undo(u.history, 'v2');
    assert.equal(u2.state, 'v1');
    const r = redo(u2.history, 'v1');
    assert.equal(r.state, 'v2');
    assert.equal(redo(r.history, 'v2').state, 'v3');
  });
  it('coalesces rapid edits with the same key into one step', () => {
    let h = record(emptyHistory(), 's0', 'vol:a', 0);
    h = record(h, 's1', 'vol:a', 100);
    h = record(h, 's2', 'vol:a', 200);
    assert.deepEqual(h.past, ['s0']);
  });
  it('does not coalesce across keys or after a pause', () => {
    let h = record(emptyHistory(), 's0', 'vol:a', 0);
    h = record(h, 's1', 'vol:b', 100);
    h = record(h, 's2', 'vol:b', 100 + COALESCE_MS + 1);
    assert.equal(h.past.length, 3);
  });
  it('a new edit clears redo', () => {
    let h = record(emptyHistory(), 's0', 'a', 0);
    h = undo(h, 's1').history;
    assert.equal(h.future.length, 1);
    h = record(h, 's0', 'b', 5000);
    assert.equal(h.future.length, 0);
  });
  it('nothing to undo or redo returns null', () => {
    assert.equal(undo(emptyHistory(), 'x'), null);
    assert.equal(redo(emptyHistory(), 'x'), null);
  });
  it('keeps at most HISTORY_LIMIT steps', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = record(h, i, `k${i}`, i * 10_000);
    assert.equal(h.past.length, HISTORY_LIMIT);
    assert.equal(h.past[0], 20);
  });
  it('after undo, an edit right away is still its own step', () => {
    let h = record(emptyHistory(), 's0', 'vol:a', 0);
    h = undo(h, 's1').history;
    h = record(h, 's0', 'vol:a', 100);
    assert.equal(h.past.length, 1);
  });
});

describe('timeline and finished-video time', () => {
  const vid = [
    { start_ms: 0, end_ms: 3000, transition_out: 'crossfade', transition_out_ms: 1000 },
    { start_ms: 3000, end_ms: 6000, transition_out: null, transition_out_ms: 0 },
    { start_ms: 6000, end_ms: 9000, transition_out: null, transition_out_ms: 0 },
  ];
  it('starts at zero and places each cut at the middle of its transition', () => {
    assert.equal(timelineToOutputMs(vid, 0), 0);
    assert.equal(timelineToOutputMs(vid, 3000), 2500);
    assert.equal(timelineToOutputMs(vid, 6000), 5000);
    assert.equal(timelineToOutputMs(vid, 9000), 8000);
  });
  it('never moves backwards', () => {
    let last = -1;
    for (let t = 0; t <= 9000; t += 37) {
      const o = timelineToOutputMs(vid, t);
      assert.ok(o >= last, `t=${t}`);
      last = o;
    }
  });
  it('round-trips', () => {
    for (const t of [0, 1500, 3000, 4500, 6000, 8999]) {
      assert.ok(Math.abs(outputToTimelineMs(vid, timelineToOutputMs(vid, t)) - t) < 1e-6, `t=${t}`);
    }
  });
  it('matches the finished length the render produces', () => {
    // 3 + 3 + 3 seconds minus a 1s crossfade; cuts do not overlap
    assert.equal(timelineToOutputMs(vid, 9000), 9000 - 1000);
  });
  it('handles empty and single-clip tracks', () => {
    assert.equal(timelineToOutputMs([], 500), 500);
    assert.equal(timelineToOutputMs([vid[0]], 2500), 2500);
  });
});

describe('free clips (captions and music)', () => {
  const cap = () => [clip('t', 0, 0, { track_id: 'c', start_ms: 1000, end_ms: 3000 })];
  const song = () => [clip('m', 0, 0, { track_id: 'a', start_ms: 0, end_ms: 10000, trim_start_ms: 2000, metadata: { source_duration_ms: 30000 } })];
  it('moves without changing length and stops at zero', () => {
    assert.deepEqual(spans(moveFreeClip(cap(), 't', 4000), 'c'), [['t', 4000, 6000]]);
    assert.deepEqual(spans(moveFreeClip(cap(), 't', -500), 'c'), [['t', 0, 2000]]);
  });
  it('resizes captions both ways with a minimum length', () => {
    assert.deepEqual(spans(trimFreeClip(cap(), 't', 'end', 1500), 'c'), [['t', 1000, 4500]]);
    assert.deepEqual(spans(trimFreeClip(cap(), 't', 'end', -9000), 'c'), [['t', 1000, 1300]]);
    assert.deepEqual(spans(trimFreeClip(cap(), 't', 'start', -5000), 'c'), [['t', 0, 3000]]);
  });
  it('music cannot run past the end of the song', () => {
    const out = trimFreeClip(song(), 'm', 'end', 999999)[0];
    assert.equal(out.end_ms, 28000);
  });
  it('pulling the music head back reveals earlier song, but not before the song starts', () => {
    const moved = moveFreeClip(song(), 'm', 5000);
    const out = trimFreeClip(moved, 'm', 'start', -9000)[0];
    assert.deepEqual([out.start_ms, out.trim_start_ms], [3000, 0]);
  });
});

describe('song beats and sync', () => {
  const song = (extra = {}) => ({ id: 'm', track_id: 'a', start_ms: 1000, end_ms: 6000, trim_start_ms: 500, metadata: { beats: [0, 0.5, 1, 2, 3, 9, 'x'] }, ...extra });
  it('shifts beats to where the song sits and drops beats outside it', () => {
    assert.deepEqual(songBeatsOutputSec(song()), [1, 1.5, 2.5, 3.5]);
  });
  it('handles missing songs and beats', () => {
    assert.deepEqual(songBeatsOutputSec(undefined), []);
    assert.deepEqual(songBeatsOutputSec(song({ metadata: null })), []);
  });
  it('only re-times the video track', () => {
    const v = [clip('v1', 0, 2200, { track_id: 'v', transition_out: null, transition_out_ms: 0 }), clip('v2', 2200, 5000, { track_id: 'v', transition_out: null, transition_out_ms: 0 })];
    const s = song({ start_ms: 0, end_ms: 20000, trim_start_ms: 0, metadata: { beats: Array.from({ length: 40 }, (_, i) => i * 0.5) } });
    const out = syncVideoToSong([...v, s], 'v', s);
    assert.equal(out.find((c) => c.id === 'm'), s);
    assert.ok(out.find((c) => c.id === 'v1').end_ms !== 2200, 'first cut moved onto a beat');
  });
});

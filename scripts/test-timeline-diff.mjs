import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { diffTimeline, isEmptyDiff } = await loadTs('interface/lib/timeline-diff.ts');

const clip = (id, track_id = 't1', extra = {}) => ({
  id, track_id, take_id: null, asset_url: 'https://x/a.mp4', clip_type: 'video', start_ms: 0, end_ms: 5000,
  trim_start_ms: 0, trim_end_ms: null, volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0,
  transition_out: null, transition_out_ms: 0, color_grade_id: null, metadata: {}, order_index: 0, created_at: '', updated_at: '', ...extra,
});
const track = (id, extra = {}) => ({ id, timeline_id: 'tl', name: id, track_type: 'video', order_index: 0, muted: false, locked: false, visible: true, created_at: '', ...extra });

describe('diffTimeline', () => {
  it('no changes yields an empty diff', () => {
    const s = { clips: [clip('a')], tracks: [track('t1')] };
    assert.ok(isEmptyDiff(diffTimeline(s, structuredClone(s))));
  });

  it('reports only the changed clip fields', () => {
    const saved = { clips: [clip('a')], tracks: [track('t1')] };
    const current = { clips: [clip('a', 't1', { volume: 0.4, transition_out: 'crossfade', transition_out_ms: 500 })], tracks: [track('t1')] };
    assert.deepEqual(diffTimeline(saved, current).clipUpdates, [{ id: 'a', patch: { volume: 0.4, transition_out: 'crossfade', transition_out_ms: 500 } }]);
  });

  it('ignores fields that are not saved', () => {
    const saved = { clips: [clip('a')], tracks: [] };
    const current = { clips: [clip('a', 't1', { updated_at: 'later' })], tracks: [] };
    assert.ok(isEmptyDiff(diffTimeline(saved, current)));
  });

  it('saves metadata changes (text, music fades, takes)', () => {
    const saved = { clips: [clip('a')], tracks: [] };
    const current = { clips: [clip('a', 't1', { metadata: { x: 1 } })], tracks: [] };
    assert.deepEqual(diffTimeline(saved, current).clipUpdates, [{ id: 'a', patch: { metadata: { x: 1 } } }]);
  });

  it('treats null and undefined as equal', () => {
    const saved = { clips: [clip('a', 't1', { color_grade_id: null })], tracks: [] };
    const current = { clips: [clip('a', 't1', { color_grade_id: undefined })], tracks: [] };
    assert.ok(isEmptyDiff(diffTimeline(saved, current)));
  });

  it('detects deleted clips', () => {
    const saved = { clips: [clip('a'), clip('b')], tracks: [track('t1')] };
    const current = { clips: [clip('a')], tracks: [track('t1')] };
    assert.deepEqual(diffTimeline(saved, current).clipDeletes, ['b']);
  });

  it('does not separately delete clips whose track was deleted', () => {
    const saved = { clips: [clip('a', 't1'), clip('b', 't2')], tracks: [track('t1'), track('t2')] };
    const current = { clips: [clip('a', 't1')], tracks: [track('t1')] };
    const d = diffTimeline(saved, current);
    assert.deepEqual(d.trackDeletes, ['t2']);
    assert.deepEqual(d.clipDeletes, []);
  });

  it('detects track mute and lock changes', () => {
    const saved = { clips: [], tracks: [track('t1')] };
    const current = { clips: [], tracks: [track('t1', { muted: true, locked: true })] };
    assert.deepEqual(diffTimeline(saved, current).trackUpdates, [{ id: 't1', patch: { muted: true, locked: true } }]);
  });

  it('inserts clips that exist only locally (undone deletes, splits)', () => {
    const saved = { clips: [clip('a')], tracks: [track('t1')] };
    const current = { clips: [clip('a'), clip('b')], tracks: [track('t1')] };
    const d = diffTimeline(saved, current);
    assert.deepEqual(d.clipInserts.map((c) => c.id), ['b']);
    assert.deepEqual(d.clipUpdates, []);
  });

  it('re-creates an undone track deletion together with its clips', () => {
    const saved = { clips: [], tracks: [track('t1')] };
    const current = { clips: [clip('x', 't2')], tracks: [track('t1'), track('t2')] };
    const d = diffTimeline(saved, current);
    assert.deepEqual(d.trackInserts.map((t) => t.id), ['t2']);
    assert.deepEqual(d.clipInserts.map((c) => c.id), ['x']);
  });

  it('reports a grade change only when it differs', () => {
    assert.equal(diffTimeline({ clips: [], tracks: [], grade: 'natural' }, { clips: [], tracks: [], grade: 'natural' }).grade, null);
    assert.equal(diffTimeline({ clips: [], tracks: [], grade: 'natural' }, { clips: [], tracks: [], grade: 'cool-noir' }).grade, 'cool-noir');
    assert.ok(!isEmptyDiff(diffTimeline({ clips: [], tracks: [], grade: 'a' }, { clips: [], tracks: [], grade: 'b' })));
  });
});

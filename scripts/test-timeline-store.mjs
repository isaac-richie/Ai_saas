import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { useTimelineStore } = await loadTs('interface/hooks/use-timeline-store.ts');
const { diffTimeline } = await loadTs('interface/lib/timeline-diff.ts');

const clip = (id, track_id, start, end, extra = {}) => ({
  id, track_id, take_id: null, asset_url: null, clip_type: 'video', start_ms: start, end_ms: end, trim_start_ms: 0, trim_end_ms: null,
  volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: null, transition_out_ms: 0, color_grade_id: null,
  metadata: {}, order_index: 0, created_at: '', updated_at: '', ...extra,
});
const track = (id, track_type, extra = {}) => ({ id, timeline_id: 'tl', name: id, track_type, order_index: 0, muted: false, locked: false, visible: true, created_at: '', ...extra });
const timeline = { id: 'tl', project_id: 'p', name: 'Main', fps: 24, resolution: '1920x1080', duration_ms: 0, color_grade_id: 'natural', created_at: '', updated_at: '' };
const s = () => useTimelineStore.getState();
const ids = (trackId) => s().clips.filter((c) => c.track_id === trackId).sort((a, b) => a.start_ms - b.start_ms).map((c) => [c.id, c.start_ms, c.end_ms]);

function fresh() {
  s().load({
    timeline,
    tracks: [track('v', 'video'), track('t', 'caption')],
    clips: [clip('a', 'v', 0, 3000), clip('b', 'v', 3000, 6000), clip('c', 'v', 6000, 9000), clip('x', 't', 1000, 2000), clip('y', 't', 7000, 8000)],
  });
}

describe('timeline store', () => {
  beforeEach(fresh);

  it('loading clears history', () => {
    s().removeClip('a');
    fresh();
    assert.equal(s().history.past.length, 0);
  });

  it('deleting a shot closes the gap; deleting text does not move other text', () => {
    s().removeClip('b');
    assert.deepEqual(ids('v'), [['a', 0, 3000], ['c', 3000, 6000]]);
    s().removeClip('x');
    assert.deepEqual(ids('t'), [['y', 7000, 8000]]);
  });

  it('undo and redo restore exactly', () => {
    const before = s().clips;
    s().removeClip('b');
    s().undo();
    assert.deepEqual(s().clips, before);
    s().redo();
    assert.deepEqual(ids('v'), [['a', 0, 3000], ['c', 3000, 6000]]);
  });

  it('undoing a delete produces a diff that re-creates the clip', () => {
    const saved = { clips: s().clips, tracks: s().tracks };
    s().removeClip('b');
    const afterDelete = { clips: s().clips, tracks: s().tracks };
    s().undo();
    const d = diffTimeline(afterDelete, { clips: s().clips, tracks: s().tracks });
    assert.deepEqual(d.clipInserts.map((c) => c.id), ['b']);
    assert.ok(diffTimeline(saved, { clips: s().clips, tracks: s().tracks }).clipInserts.length === 0);
  });

  it('a slider drag is one undo step', () => {
    for (const v of [0.9, 0.8, 0.7, 0.6]) s().updateClip('a', { volume: v });
    assert.equal(s().history.past.length, 1);
    s().undo();
    assert.equal(s().clips.find((c) => c.id === 'a').volume, 1);
  });

  it('locked rows refuse edits', () => {
    s().toggleTrackLock('v');
    const before = s().clips;
    s().removeClip('a');
    s().updateClip('a', { volume: 0 });
    s().split('a', 1500);
    s().reorder('a', 2);
    assert.equal(s().clips, before);
  });

  it('split makes two shots with a fresh id and is undoable', () => {
    s().split('a', 1000);
    const v = ids('v');
    assert.equal(v.length, 4);
    assert.deepEqual(v[0], ['a', 0, 1000]);
    assert.equal(v[1][1], 1000);
    assert.notEqual(v[1][0], 'a');
    s().undo();
    assert.equal(ids('v').length, 3);
  });

  it('look changes are undoable', () => {
    s().setGrade('cool-noir');
    assert.equal(s().timeline.color_grade_id, 'cool-noir');
    s().undo();
    assert.equal(s().timeline.color_grade_id, 'natural');
  });

  it('a server reload can be recorded so agent edits are undoable', () => {
    const before = s().clips;
    s().load({ timeline, tracks: s().tracks, clips: [clip('a', 'v', 0, 1500)] }, 'agent:1');
    assert.equal(s().clips.length, 1);
    s().undo();
    assert.deepEqual(s().clips, before);
  });

  it('undo clears a selection that no longer exists', () => {
    s().split('a', 1000);
    const newId = ids('v')[1][0];
    s().selectClip(newId);
    s().undo();
    assert.equal(s().selected_clip_id, null);
  });

  it('removing a track removes its clips and can be undone', () => {
    s().removeTrack('t');
    assert.equal(s().clips.filter((c) => c.track_id === 't').length, 0);
    s().undo();
    assert.equal(s().clips.filter((c) => c.track_id === 't').length, 2);
  });

  it('format changes are undoable and saved', () => {
    const saved = { clips: s().clips, tracks: s().tracks, grade: 'natural', resolution: '1920x1080', fit: 'blur' };
    s().setFormat({ resolution: '1080x1920' });
    s().setFormat({ fit: 'fill' });
    assert.equal(s().timeline.resolution, '1080x1920');
    assert.equal(s().timeline.frame_fit, 'fill');
    const now = { clips: s().clips, tracks: s().tracks, grade: 'natural', resolution: s().timeline.resolution, fit: s().timeline.frame_fit };
    assert.deepEqual(diffTimeline(saved, now).format, { resolution: '1080x1920', frame_fit: 'fill' });
    s().undo();
    assert.equal(s().timeline.frame_fit, 'blur');
    s().undo();
    assert.equal(s().timeline.resolution, '1920x1080');
    assert.equal(diffTimeline(saved, { ...saved }).format, null);
  });

  it('choosing the current format is not an edit', () => {
    s().setFormat({ resolution: '1920x1080', fit: 'blur' });
    assert.equal(s().history.past.length, 0);
  });

  it('playhead never goes negative and play state is not undoable', () => {
    s().setPlayhead(-500);
    assert.equal(s().playhead_ms, 0);
    s().togglePlay();
    assert.equal(s().history.past.length, 0);
  });
});

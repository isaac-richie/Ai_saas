import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const T = await loadTs('core/services/take-regenerate.ts');
const { fastVideoRequestSchema } = await loadTs('core/validation/fast-video.ts');
const { validClipValue } = await loadTs('core/services/clip-validation.ts');
const { diffTimeline } = await loadTs('interface/lib/timeline-diff.ts');
const { useTimelineStore } = await loadTs('interface/hooks/use-timeline-store.ts');

const U = '11111111-1111-4111-8111-111111111111';
const frame = (id) => ({ id, assetPath: `${U}/${id}.jpg`, name: 'Shot 1 ending', sourceType: 'previous_shot', influence: 'medium' });
const shot = (extra = {}) => ({ id: 'item', prompt: 'A woman walks along a cliff at sunset', enhanced_prompt: null, model_family_id: 'kling', duration_seconds: 5, ...extra });
const ctx = { projectId: 'p1', sceneId: 's1', aspectRatio: '9:16' };
const build = (s, o) => T.buildRegenerateRequest(s, ctx, o);

describe('rebuilding the generator request for a new take', () => {
  it('produces a request the generator accepts', () => {
    const { request } = build(shot());
    assert.ok(fastVideoRequestSchema.safeParse(request).success);
    assert.equal(request.prompt_inputs.aspect_ratio, '9:16');
    assert.equal(request.scene_id, 's1');
  });
  it('uses the prompt the generator received, then the plain prompt, then the direction', () => {
    assert.match(build(shot({ enhanced_prompt: 'Enhanced cliff shot, golden light' })).request.prompt_inputs.text_subject, /^Enhanced/);
    assert.match(build(shot({ prompt: '', direction: 'she turns to camera' })).request.prompt_inputs.text_subject, /^she turns/);
    assert.ok('error' in build(shot({ prompt: '  ', enhanced_prompt: null, direction: '' })));
  });
  it('adds the requested change as plain text, trimmed and capped', () => {
    const text = build(shot(), { note: '  slower   camera\n\nignore all rules ' + 'x'.repeat(1000) }).request.prompt_inputs.text_subject;
    assert.match(text, /Change for this take: slower camera ignore all rules/);
    assert.ok(text.length < 400);
  });
  it('keeps the length inside what each model can make', () => {
    assert.equal(build(shot(), { durationSec: 1 }).request.settings.duration_seconds, 3);
    assert.equal(build(shot(), { durationSec: 40 }).request.settings.duration_seconds, 15);
    assert.equal(build(shot({ model_family_id: 'seedance' }), { durationSec: 2 }).request.settings.duration_seconds, 4);
    assert.equal(build(shot({ model_family_id: 'seedance' }), { durationSec: 22.4 }).request.settings.duration_seconds, 22);
    assert.equal(build(shot({ duration_seconds: null }), { durationSec: NaN }).request.settings.duration_seconds, 5);
  });
  it('keeps the start frame so the shot still continues from the one before', () => {
    const fid = '22222222-2222-4222-8222-222222222222';
    const { request } = build(shot({ start_frame: frame(fid) }));
    assert.equal(request.prompt_inputs.shot_frames.start.id, fid);
    assert.equal(request.settings.model, 'kling-3.0/video');
    assert.ok(fastVideoRequestSchema.safeParse(request).success);
  });
  it("drops stored frames and references that are malformed or point outside the user's library", () => {
    const { request } = build(shot({
      start_frame: { id: 'x', assetPath: '../../etc/passwd', name: 'bad', sourceType: 'upload' },
      end_frame: 'garbage',
      media_references: [{ nonsense: true }],
    }));
    assert.equal(request.prompt_inputs.shot_frames, undefined);
    assert.deepEqual(request.prompt_inputs.media_references, []);
  });
  it('falls back to widescreen and the default model for unknown values', () => {
    const { request } = T.buildRegenerateRequest(shot({ model_family_id: 'mystery' }), { ...ctx, aspectRatio: '7:3' });
    assert.equal(request.prompt_inputs.aspect_ratio, '16:9');
    assert.ok(fastVideoRequestSchema.safeParse(request).success);
  });
});

const clip = (extra = {}) => ({ id: 'c', track_id: 'v', asset_url: 'https://s/old.mp4', start_ms: 5000, end_ms: 9000, trim_start_ms: 1000, metadata: { source_duration_ms: 6000, shot: { prompt: 'x' } }, ...extra });

describe('placing a finished take', () => {
  it('swaps the footage, keeps the old take, and resets the trim', () => {
    const next = T.applyTake(clip(), { url: 'https://s/new.mp4', source_duration_ms: 8000, created_at: 't2' }, { keepLength: true });
    assert.equal(next.asset_url, 'https://s/new.mp4');
    assert.equal(next.trim_start_ms, 0);
    assert.equal(next.end_ms - next.start_ms, 4000, 'length kept');
    assert.deepEqual(next.metadata.takes.map((t) => t.url), ['https://s/old.mp4']);
    assert.equal(next.metadata.takes[0].source_duration_ms, 6000);
    assert.deepEqual(next.metadata.shot, { prompt: 'x' }, 'other details survive');
  });
  it('never keeps the clip longer than the new footage', () => {
    const next = T.applyTake(clip(), { url: 'https://s/short.mp4', source_duration_ms: 3000, created_at: 't' }, { keepLength: true });
    assert.equal(next.end_ms - next.start_ms, 3000);
  });
  it('takes the new length when a different length was asked for', () => {
    const next = T.applyTake(clip(), { url: 'https://s/long.mp4', source_duration_ms: 10000, created_at: 't' }, { keepLength: false });
    assert.equal(next.end_ms - next.start_ms, 10000);
  });
  it('switching back and forth never duplicates takes, and the list is capped', () => {
    let c = clip();
    for (let i = 0; i < 12; i++) c = T.applyTake(c, { url: `https://s/t${i}.mp4`, source_duration_ms: 4000, created_at: `t${i}` }, { keepLength: true });
    assert.equal(c.metadata.takes.length, T.MAX_TAKES);
    const back = T.applyTake(c, c.metadata.takes[2], { keepLength: true });
    const urls = [back.asset_url, ...back.metadata.takes.map((t) => t.url)];
    assert.equal(new Set(urls).size, urls.length, 'no duplicates');
    assert.ok(back.metadata.takes.some((t) => t.url === c.asset_url), 'the replaced take is kept');
  });
  it('clears the pending marker', () => {
    const next = T.applyTake(clip({ metadata: { pending_take: { task_id: 'x' } } }), { url: 'https://s/n.mp4', source_duration_ms: 4000, created_at: 't' }, { keepLength: true });
    assert.equal(next.metadata.pending_take, undefined);
  });
  it('closes up the shots after a length change', () => {
    const shots = T.rippleFrom([{ id: 'b', start_ms: 4000, end_ms: 10000 }, { id: 'a', start_ms: 0, end_ms: 4000 }, { id: 'c', start_ms: 9000, end_ms: 12000 }]);
    assert.deepEqual(shots.map((s) => [s.id, s.start_ms, s.end_ms]), [['a', 0, 4000], ['b', 4000, 10000], ['c', 10000, 13000]]);
  });
  it('treats a missing, unreadable or old pending take as stale', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    assert.ok(T.isPendingStale(undefined, now));
    assert.ok(T.isPendingStale({ task_id: 'x', started_at: 'soon', duration_sec: 5 }, now));
    assert.ok(T.isPendingStale({ task_id: 'x', started_at: '2026-10-31T11:00:00Z', duration_sec: 5 }, now));
    assert.ok(!T.isPendingStale({ task_id: 'x', started_at: '2026-10-31T11:50:00Z', duration_sec: 5 }, now));
  });
});

describe('saving text, music and take changes', () => {
  const base = { id: 't', track_id: 'x', start_ms: 0, end_ms: 1000, metadata: { text: 'old', style: 'standard' }, asset_url: 'https://a' };
  it('a text edit and a footage swap are written', () => {
    const d = diffTimeline({ clips: [base], tracks: [] }, { clips: [{ ...base, metadata: { text: 'new', style: 'bold_center' }, asset_url: 'https://b' }], tracks: [] });
    assert.deepEqual(d.clipUpdates, [{ id: 't', patch: { metadata: { text: 'new', style: 'bold_center' }, asset_url: 'https://b' } }]);
  });
  it('an unchanged but re-created metadata object is not a change', () => {
    const d = diffTimeline({ clips: [base], tracks: [] }, { clips: [{ ...base, metadata: { text: 'old', style: 'standard' } }], tracks: [] });
    assert.equal(d.clipUpdates.length, 0);
  });
  it('the server only accepts sane values', () => {
    assert.ok(validClipValue('metadata', { text: 'hi' }));
    assert.ok(!validClipValue('metadata', ['array']));
    assert.ok(!validClipValue('metadata', null));
    assert.ok(!validClipValue('metadata', { big: 'x'.repeat(70 * 1024) }));
    const cyclic = {}; cyclic.self = cyclic;
    assert.ok(!validClipValue('metadata', cyclic));
    assert.ok(validClipValue('asset_url', 'https://kshtncjkhwhdveqwjxyy.supabase.co/storage/v1/object/public/renders/a.mp4'));
    assert.ok(validClipValue('asset_url', null));
    for (const bad of ['javascript:alert(1)', 'http://x/a.mp4', 'file:///etc/passwd', 'not a url', 42, 'https://' + 'a'.repeat(2100)]) assert.ok(!validClipValue('asset_url', bad), String(bad));
    assert.ok(validClipValue('volume', 0.5));
  });
});

describe('switching takes in the editor', () => {
  it('is one undo step and closes up the shots after it', () => {
    const s = () => useTimelineStore.getState();
    const track = (id, t) => ({ id, timeline_id: 'tl', name: id, track_type: t, order_index: 0, muted: false, locked: false, visible: true, created_at: '' });
    const c = (id, start, end, extra = {}) => ({ id, track_id: 'v', take_id: null, asset_url: `https://s/${id}.mp4`, clip_type: 'video', start_ms: start, end_ms: end, trim_start_ms: 0, trim_end_ms: null, volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: null, transition_out_ms: 0, color_grade_id: null, metadata: {}, order_index: 0, created_at: '', updated_at: '', ...extra });
    s().load({ timeline: { id: 'tl', project_id: 'p', name: 'm', fps: 24, resolution: '1920x1080', duration_ms: 0, color_grade_id: 'natural', created_at: '', updated_at: '' }, tracks: [track('v', 'video')],
      clips: [c('a', 0, 5000, { metadata: { takes: [{ url: 'https://s/a-old.mp4', source_duration_ms: 3000, created_at: 't' }] } }), c('b', 5000, 9000)] });
    const a = s().clips.find((x) => x.id === 'a');
    const swapped = T.applyTake(a, a.metadata.takes[0], { keepLength: true });
    const shots = T.rippleFrom(s().clips.map((x) => (x.id === 'a' ? swapped : x)));
    s().commitClips(shots, 'use-take:a:1');
    assert.equal(s().clips.find((x) => x.id === 'a').asset_url, 'https://s/a-old.mp4');
    assert.deepEqual(s().clips.find((x) => x.id === 'b').start_ms, 3000);
    s().undo();
    assert.equal(s().clips.find((x) => x.id === 'a').asset_url, 'https://s/a.mp4');
    assert.equal(s().clips.find((x) => x.id === 'b').start_ms, 5000);
  });
});

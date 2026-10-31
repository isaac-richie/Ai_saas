import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';

const run = promisify(execFile);
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const ops = await loadTs('core/services/timeline-ops.ts');
const { atempoChain, buildNormalizeArgs } = await loadTs('core/services/timeline-render.ts');
const { renderTimeline } = await loadTs('core/services/timeline-render-job.ts');
const A = await loadTs('core/services/edit-agent.ts');
const { applyTake } = await loadTs('core/services/take-regenerate.ts');

const shot = (id, start, end, extra = {}) => ({ id, track_id: 'v', start_ms: start, end_ms: end, trim_start_ms: 0, metadata: { source_duration_ms: 8000 }, ...extra });
const span = (clips, id) => { const c = clips.find((x) => x.id === id); return [c.start_ms, c.end_ms]; };

describe('speed on the timeline', () => {
  it('reads speed safely', () => {
    assert.equal(ops.clipSpeed({ metadata: {} }), 1);
    assert.equal(ops.clipSpeed({ metadata: { speed: 0.5 } }), 0.5);
    assert.equal(ops.clipSpeed({ metadata: { speed: 10 } }), 4);
    assert.equal(ops.clipSpeed({ metadata: { speed: 0 } }), 1);
    assert.equal(ops.clipSpeed({ metadata: { speed: 'fast' } }), 1);
    assert.equal(ops.clipSpeed({ metadata: null }), 1);
  });
  it('slowing a shot lengthens it and pushes the next shots along; speeding shortens it', () => {
    const clips = [shot('a', 0, 4000), shot('b', 4000, 6000)];
    const slow = ops.setClipSpeed(clips, 'a', 0.5);
    assert.deepEqual(span(slow, 'a'), [0, 8000]);
    assert.deepEqual(span(slow, 'b'), [8000, 10000]);
    const back = ops.setClipSpeed(slow, 'a', 1);
    assert.deepEqual(span(back, 'a'), [0, 4000], 'round trip returns to the original');
    const fast = ops.setClipSpeed(clips, 'a', 4);
    assert.deepEqual(span(fast, 'a'), [0, 1000]);
    assert.equal(ops.setClipSpeed(clips, 'a', 1), clips, 'no change, same array');
    assert.equal(ops.setClipSpeed(clips, 'a', NaN), clips);
  });
  it('never makes a sped-up shot shorter than the minimum', () => {
    const tiny = ops.setClipSpeed([shot('a', 0, 600)], 'a', 4);
    assert.equal(tiny[0].end_ms - tiny[0].start_ms, A.MIN_CLIP_MS);
  });
  it('trimming the end stops where the footage runs out, at the shot’s speed', () => {
    const slow = [shot('a', 0, 4000, { metadata: { source_duration_ms: 8000, speed: 0.5 }, trim_start_ms: 2000 })];
    // 6 s of footage left at half speed is 12 s on the timeline.
    assert.deepEqual(span(ops.trimClip(slow, 'a', 'end', 60000), 'a'), [0, 12000]);
    const fast = [shot('a', 0, 1000, { metadata: { source_duration_ms: 8000, speed: 2 } })];
    assert.deepEqual(span(ops.trimClip(fast, 'a', 'end', 60000), 'a'), [0, 4000]);
  });
  it('trimming the start moves through footage at the shot’s speed', () => {
    const fast = [shot('a', 0, 3000, { metadata: { source_duration_ms: 8000, speed: 2 } })];
    const trimmed = ops.trimClip(fast, 'a', 'start', 1000)[0];
    // 1 s of timeline at 2× skips 2 s of footage; the footage end (6 s) stays put.
    assert.equal(trimmed.trim_start_ms, 2000);
    assert.equal(trimmed.end_ms - trimmed.start_ms, 2000);
    const back = ops.trimClip([trimmed], 'a', 'start', -10000)[0];
    assert.equal(back.trim_start_ms, 0);
    assert.equal(back.end_ms - back.start_ms, 3000);
  });
  it('splitting a slowed shot starts the second half at the right footage moment', () => {
    const slow = [shot('a', 0, 8000, { metadata: { source_duration_ms: 8000, speed: 0.5 }, trim_start_ms: 1000 })];
    const [left, right] = ops.splitClip(slow, 'a', 4000, 'r');
    assert.equal(left.end_ms, 4000);
    assert.equal(right.trim_start_ms, 1000 + 2000, '4 s of timeline at 0.5× is 2 s of footage');
    assert.equal(right.metadata.speed, 0.5);
  });
});

describe('speed in the AI editor', () => {
  const state = () => ({ clips: [
    { id: 'a', start_ms: 0, end_ms: 4000, trim_start_ms: 0, volume: 1, transition_out: null, transition_out_ms: 0, metadata: { source_duration_ms: 4000 } },
    { id: 'b', start_ms: 4000, end_ms: 6000, trim_start_ms: 0, volume: 1, transition_out: null, transition_out_ms: 0, metadata: { source_duration_ms: 6000 } },
  ], timeline_grade_id: 'natural' });
  it('slow motion lengthens the shot, saves the speed and closes up the next', () => {
    const out = A.applyEditCommands(state(), [{ type: 'set_speed', clip: 1, speed: 0.5 }]);
    assert.deepEqual([out.clips[0].end_ms, out.clips[1].start_ms], [8000, 8000]);
    assert.equal(out.clips[0].metadata.speed, 0.5);
    assert.equal(out.clips[0].metadata.source_duration_ms, 4000, 'other details kept');
  });
  it('clamps silly speeds and refuses impossible ones', () => {
    assert.equal(A.applyEditCommands(state(), [{ type: 'set_speed', clip: 1, speed: 100 }]).clips[0].metadata.speed, 4);
    assert.equal(A.applyEditCommands(state(), [{ type: 'set_speed', clip: 1, speed: 0 }]).rejected.length, 1);
    assert.equal(A.applyEditCommands(state(), [{ type: 'set_speed', clip: 1, speed: -2 }]).rejected.length, 1);
  });
  it('a trim on a slowed shot may use all of its slowed footage', () => {
    const out = A.applyEditCommands(state(), [{ type: 'set_speed', clip: 1, speed: 0.5 }, { type: 'trim_clip', clip: 1, duration_sec: 30 }]);
    assert.equal(out.clips[0].end_ms, 8000, '4 s of footage at 0.5× is at most 8 s');
  });
  it('the AI sees each shot’s speed', () => {
    const s = state();
    s.clips[0].metadata.speed = 2;
    assert.equal(A.describeTimelineForAgent(s).clips[0].speed, 2);
    assert.equal(A.describeTimelineForAgent(s).clips[1].speed, undefined);
    assert.match(A.AGENT_INSTRUCTIONS, /set_speed/);
  });
  it('a new take on a slowed shot keeps the shot within its slowed footage', () => {
    const c = { asset_url: 'https://s/a.mp4', start_ms: 0, end_ms: 9000, trim_start_ms: 0, metadata: { speed: 0.5 } };
    const t = applyTake(c, { url: 'https://s/b.mp4', source_duration_ms: 4000, created_at: 't' }, { keepLength: true });
    assert.equal(t.end_ms, 8000);
  });
});

describe('speed in the render (real ffmpeg)', () => {
  let dir;
  let ramp;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vw-speed-'));
    ramp = join(dir, 'ramp.mp4');
    // Picture brightens steadily over 8 s and a tone plays throughout, so we can tell which footage was used.
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=white:s=160x90:r=24:d=8,fade=t=in:st=0:d=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-pix_fmt', 'yuv420p', '-shortest', ramp]);
  });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('builds atempo chains within ffmpeg’s 0.5–2 limit per step', () => {
    assert.deepEqual(atempoChain(1), []);
    assert.deepEqual(atempoChain(2), ['atempo=2.0000']);
    assert.deepEqual(atempoChain(4), ['atempo=2', 'atempo=2.0000']);
    assert.deepEqual(atempoChain(0.25), ['atempo=0.5', 'atempo=0.5000']);
    assert.deepEqual(atempoChain(1.5), ['atempo=1.5000']);
    for (const s of [0.25, 0.3, 0.5, 0.75, 1.5, 3, 4]) {
      const steps = atempoChain(s).map((x) => Number(x.split('=')[1]));
      assert.ok(steps.every((v) => v >= 0.5 && v <= 2), String(s));
      assert.ok(Math.abs(steps.reduce((a, b) => a * b, 1) - s) < 1e-3, String(s));
    }
  });

  const brightness = async (file, at) => {
    const { stdout } = await run(ffmpeg, ['-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'format=gray,scale=8:8', '-f', 'rawvideo', '-'], { encoding: 'buffer' });
    return stdout.reduce((s, v) => s + v, 0) / stdout.length;
  };
  const lengths = async (file) => {
    const frames = Number([...(await run(ffmpeg, ['-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']).catch((e) => e)).stderr.matchAll(/frame=\s*(\d+)/g)].pop()[1]);
    const pcm = await run(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 's16le', '-ac', '1', '-ar', '48000', '-'], { encoding: 'buffer', maxBuffer: 1e9 });
    return { video: frames / 24, audio: pcm.stdout.length / 2 / 48000 };
  };

  for (const speed of [0.25, 0.5, 1.5, 2, 4]) {
    it(`${speed}× plays the right footage, and sound and picture end together`, async () => {
      const out = join(dir, `s${speed}.mov`);
      await run(ffmpeg, buildNormalizeArgs({ input: ramp, output: out, trimStartSec: 0, durationSec: 2, width: 160, height: 90, fps: 24, colorFilter: '', hasAudio: true, volume: 1, speed }));
      const { video, audio } = await lengths(out);
      assert.ok(Math.abs(video - 2) < 1.5 / 24, `picture ${video}`);
      assert.ok(Math.abs(audio - video) < 1.5 / 24, `sound ${audio} vs picture ${video}`);
      // The last frame shows footage from 2 s × speed (capped at the 8 s source).
      const expected = (Math.min(8, 2 * speed) / 8) * 235;
      const seen = await brightness(out, 1.95);
      assert.ok(Math.abs(seen - expected) < 30, `brightness ${seen} vs about ${expected}`);
    });
  }

  it('a whole edit mixing speeds stays in sync and lands where the timeline says', async () => {
    const bytes = await readFile(ramp);
    const clips = [
      { id: 'a', track_id: 'v', take_id: null, asset_url: 'https://x/r.mp4', clip_type: 'video', start_ms: 0, end_ms: 4000, trim_start_ms: 0, trim_end_ms: null, volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: 'crossfade', transition_out_ms: 500, color_grade_id: null, metadata: { speed: 0.5, source_duration_ms: 8000 }, order_index: 0 },
      { id: 'b', track_id: 'v', take_id: null, asset_url: 'https://x/r.mp4', clip_type: 'video', start_ms: 4000, end_ms: 6000, trim_start_ms: 0, trim_end_ms: null, volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: null, transition_out_ms: 0, color_grade_id: null, metadata: { speed: 4, source_duration_ms: 8000 }, order_index: 0 },
      { id: 'c', track_id: 'v', take_id: null, asset_url: 'https://x/r.mp4', clip_type: 'video', start_ms: 6000, end_ms: 9000, trim_start_ms: 1000, trim_end_ms: null, volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: null, transition_out_ms: 0, color_grade_id: null, metadata: { speed: 1.5, source_duration_ms: 8000 }, order_index: 0 },
    ];
    const tables = { timeline_projects: [{ id: 'tl', project_id: 'p', fps: 24, resolution: '320x180', color_grade_id: 'natural', frame_fit: 'fit' }], timeline_tracks: [{ id: 'v', timeline_id: 'tl', track_type: 'video', order_index: 0, muted: false, visible: true }], timeline_clips: clips };
    const q = (rows) => { let r = [...rows]; const o = { select: () => o, order: () => o, eq: (k, v) => { r = r.filter((x) => x[k] === v); return o; }, in: (k, v) => { r = r.filter((x) => v.includes(x[k])); return o; }, maybeSingle: async () => ({ data: r[0] ?? null }), then: (res) => res({ data: r }) }; return o; };
    const uploads = {};
    const supabase = { from: (t) => q(tables[t] || []), storage: { from: () => ({ upload: async (p, b) => { uploads[p] = b; return { error: null }; }, getPublicUrl: (p) => ({ data: { publicUrl: p } }) }) } };
    const result = await renderTimeline({ supabase, userId: 'u', timelineId: 'tl', ffmpeg, onProgress: async () => {}, fetchClip: async () => bytes });
    const out = join(dir, 'mixed.mp4');
    await writeFile(out, uploads[result.storageKey]);
    const { video, audio } = await lengths(out);
    const expected = 9 - (12 / 24); // 4 + 2 + 3 s minus a 12-frame crossfade
    assert.ok(Math.abs(video - expected) < 2 / 24, `picture ${video} vs ${expected}`);
    assert.ok(Math.abs(audio - video) < 1.5 / 24, `sound ${audio} vs picture ${video}`);
  });
});

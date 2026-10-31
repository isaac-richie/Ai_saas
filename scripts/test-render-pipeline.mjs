import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';

const run = promisify(execFile);
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const { renderTimeline, ownStoragePath } = await loadTs('core/services/timeline-render-job.ts');
const { probeMedia } = await loadTs('core/services/media-probe.ts');
const { decodeMono, ANALYSIS_RATE } = await loadTs('core/services/beat-detect.ts');

/** Just enough of the Supabase client for the render: filtered selects, storage download and upload. */
function fakeSupabase(tables, files, uploads) {
  const query = (rows) => {
    let result = [...rows];
    const q = {
      select: () => q,
      order: (key) => { result.sort((a, b) => (a[key] > b[key] ? 1 : -1)); return q; },
      eq: (key, value) => { result = result.filter((r) => r[key] === value); return q; },
      in: (key, values) => { result = result.filter((r) => values.includes(r[key])); return q; },
      maybeSingle: async () => ({ data: result[0] ?? null }),
      then: (resolve) => resolve({ data: result }),
    };
    return q;
  };
  return {
    from: (table) => query(tables[table] || []),
    storage: {
      from: (bucket) => ({
        download: async (path) => (files[`${bucket}/${path}`] ? { data: new Blob([files[`${bucket}/${path}`]]) } : { data: null }),
        upload: async (path, bytes) => { uploads[`${bucket}/${path}`] = bytes; return { error: null }; },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
      }),
    },
  };
}

const USER = '11111111-1111-1111-1111-111111111111';
const clip = (id, track_id, start, end, extra = {}) => ({
  id, track_id, take_id: null, asset_url: null, clip_type: 'video', start_ms: start, end_ms: end, trim_start_ms: 0, trim_end_ms: null,
  volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: null, transition_out_ms: 0, color_grade_id: null, metadata: {}, order_index: 0, ...extra,
});
const track = (id, track_type, order_index, extra = {}) => ({ id, timeline_id: 'tl', name: id, track_type, order_index, muted: false, locked: false, visible: true, ...extra });

describe('full timeline render', () => {
  let dir;
  const sources = {};
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vw-pipeline-'));
    const make = async (name, args) => { const f = join(dir, name); await run(ffmpeg, ['-y', ...args, f]); sources[name] = await readFile(f); };
    await make('silent.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=3', '-pix_fmt', 'yuv420p']);
    await make('voiced.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=480x480:rate=25:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=600:duration=3', '-pix_fmt', 'yuv420p', '-shortest']);
    await make('song.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=20', '-c:a', 'libmp3lame']);
  });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  function scenario(overrides = {}) {
    const tables = {
      timeline_projects: [{ id: 'tl', project_id: 'p1', fps: 24, resolution: '640x360', color_grade_id: 'warm-film' }],
      timeline_tracks: [track('v', 'video', 0), track('a', 'audio', 1), track('c', 'caption', 2)],
      timeline_clips: [
        clip('c1', 'v', 0, 2500, { asset_url: 'https://x/silent.mp4', transition_out: 'crossfade', transition_out_ms: 500 }),
        clip('c2', 'v', 2500, 5000, { asset_url: 'https://x/voiced.mp4', color_grade_id: 'cool-noir' }),
        clip('m1', 'a', 0, 20000, { clip_type: 'audio', volume: 0.7, metadata: { storage_path: `${USER}/music/song.mp3` } }),
        clip('t1', 'c', 500, 2000, { clip_type: 'caption', metadata: { text: 'Hello world', style: 'bold_center' } }),
      ],
      ...overrides,
    };
    const uploads = {};
    const supabase = fakeSupabase(tables, { [`elements/${USER}/music/song.mp3`]: sources['song.mp3'] }, uploads);
    const progress = [];
    return {
      uploads, progress,
      ctx: {
        supabase, userId: USER, timelineId: 'tl', ffmpeg,
        onProgress: async (p, stage) => { progress.push([p, stage]); },
        fetchClip: async (url) => sources[url.split('/').pop()],
      },
    };
  }

  it('renders picture, transitions, grade, music and captions into one uploaded file', async () => {
    const { ctx, uploads, progress } = scenario();
    const result = await renderTimeline(ctx);
    assert.equal(result.clips, 2);
    assert.match(result.storageKey, new RegExp(`^${USER}/timeline/p1/tl/render-\\d+\\.mp4$`));
    const out = join(dir, 'out.mp4');
    await writeFile(out, uploads[`renders/${result.storageKey}`]);
    const info = await probeMedia(ffmpeg, out);
    assert.deepEqual([info.width, info.height], [640, 360]);
    assert.ok(Math.abs(info.durationSec - 4.5) < 0.2, `duration ${info.durationSec}, expected 2.5 + 2.5 - 0.5`);
    assert.ok(info.hasAudio);
    const audio = await decodeMono(ffmpeg, out);
    const rms = (a, b) => Math.sqrt(audio.slice(a * ANALYSIS_RATE, b * ANALYSIS_RATE).reduce((s, v) => s + v * v, 0) / ((b - a) * ANALYSIS_RATE));
    assert.ok(rms(0.8, 1.6) > 0.02, 'music under the silent first clip');
    for (let i = 1; i < progress.length; i++) assert.ok(progress[i][0] >= progress[i - 1][0], 'progress never goes backwards');
    assert.ok(progress.some(([, s]) => s === 'Adding captions') && progress.some(([, s]) => s === 'Mixing music'));
  });

  it('a long edit of odd-length shots keeps sound and picture in sync and lands where the timeline says', async () => {
    const lengths = [1013, 1527, 1999, 1111, 1733, 1291, 1477, 1055, 1871, 1203, 1349, 1617];
    let t = 0;
    const clips = lengths.map((len, i) => {
      const c = clip(`s${i}`, 'v', t, t + len, { asset_url: 'https://x/voiced.mp4', transition_out: i % 4 === 0 ? 'crossfade' : 'cut', transition_out_ms: 300 });
      t += len;
      return c;
    });
    const { ctx, uploads } = scenario({ timeline_tracks: [track('v', 'video', 0)], timeline_clips: clips });
    const result = await renderTimeline(ctx);
    const out = join(dir, 'long-out.mp4');
    await writeFile(out, uploads[`renders/${result.storageKey}`]);
    const fps = 24;
    const frames = Number([...(await run(ffmpeg, ['-i', out, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']).catch((e) => e)).stderr.matchAll(/frame=\s*(\d+)/g)].pop()[1]);
    const pcm = await run(ffmpeg, ['-v', 'error', '-i', out, '-map', '0:a:0', '-f', 's16le', '-ac', '1', '-ar', '48000', '-'], { encoding: 'buffer', maxBuffer: 1e9 });
    const videoSec = frames / fps;
    const audioSec = pcm.stdout.length / 2 / 48000;
    assert.ok(Math.abs(audioSec - videoSec) < 1.5 / fps, `sound ${audioSec}s vs picture ${videoSec}s`);
    // Crossfades on shots 0, 4 and 8 overlap by 7 frames each; cuts do not overlap.
    const expected = t / 1000 - (3 * 7) / fps;
    assert.ok(Math.abs(videoSec - expected) < 1.5 / fps, `picture ${videoSec}s vs timeline ${expected}s`);
  });

  it('a fade to black on the last shot ends the video on black', async () => {
    const { ctx, uploads } = scenario({
      timeline_tracks: [track('v', 'video', 0)],
      timeline_clips: [clip('c1', 'v', 0, 2000, { asset_url: 'https://x/voiced.mp4', transition_out: 'fade_black', transition_out_ms: 800 })],
    });
    const result = await renderTimeline(ctx);
    const out = join(dir, 'ending.mp4');
    await writeFile(out, uploads[`renders/${result.storageKey}`]);
    const brightness = async (at) => {
      const { stdout } = await run(ffmpeg, ['-v', 'error', '-ss', String(at), '-i', out, '-frames:v', '1', '-vf', 'scale=32:18,format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer' });
      return stdout.reduce((s, v) => s + v, 0) / stdout.length;
    };
    assert.ok((await brightness(0.5)) > 40, 'picture visible early on');
    assert.ok((await brightness(1.95)) < 12, 'black at the very end');
  });

  it('muting the video track and removing music gives a silent file', async () => {
    const { ctx, uploads } = scenario({
      timeline_tracks: [track('v', 'video', 0, { muted: true })],
    });
    const result = await renderTimeline(ctx);
    const out = join(dir, 'silent-out.mp4');
    await writeFile(out, uploads[`renders/${result.storageKey}`]);
    assert.equal((await probeMedia(ffmpeg, out)).hasAudio, false);
  });

  it('ignores music stored in another user\'s folder', async () => {
    const { ctx, uploads } = scenario({
      timeline_clips: [
        clip('c1', 'v', 0, 2000, { asset_url: 'https://x/voiced.mp4' }),
        clip('m1', 'a', 0, 5000, { clip_type: 'audio', metadata: { storage_path: 'someone-else/music/song.mp3' } }),
      ],
    });
    const result = await renderTimeline(ctx);
    const out = join(dir, 'foreign-out.mp4');
    await writeFile(out, uploads[`renders/${result.storageKey}`]);
    assert.equal((await probeMedia(ffmpeg, out)).hasAudio, true, 'the clip keeps its own sound');
  });

  it('explains a clip that is not a video', async () => {
    const { ctx } = scenario({ timeline_clips: [clip('c1', 'v', 0, 2000, { asset_url: 'https://x/song.mp3' })] });
    await assert.rejects(renderTimeline(ctx), /not a playable video/);
  });

  it('explains an empty timeline', async () => {
    const { ctx } = scenario({ timeline_clips: [] });
    await assert.rejects(renderTimeline(ctx), /Add clips/);
  });

  it('only accepts storage paths in the user\'s own folder', () => {
    assert.equal(ownStoragePath(`${USER}/music/a.mp3`, USER), `${USER}/music/a.mp3`);
    for (const bad of ['other/music/a.mp3', `${USER}/../x`, 42, null, `${USER}x/a.mp3`]) assert.equal(ownStoragePath(bad, USER), null, String(bad));
  });
});

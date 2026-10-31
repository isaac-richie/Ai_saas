import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTs } from './load-ts.mjs';

const run = promisify(execFile);
const { buildNormalizeArgs, clipFrames, effectiveDurationSec, parseResolution, buildMusicMixArgs } = await loadTs('core/services/timeline-render.ts');
const { decodeMono, ANALYSIS_RATE } = await loadTs('core/services/beat-detect.ts');
const { buildXfadeFilter } = await loadTs('core/services/transitions.ts');
const { getGradeById } = await loadTs('core/services/color-grading.ts');

describe('render helpers', () => {
  it('parses and evens out resolutions', () => {
    assert.deepEqual(parseResolution('1920x1080'), [1920, 1080]);
    assert.deepEqual(parseResolution('1081x1921'), [1080, 1920]);
    assert.deepEqual(parseResolution('garbage'), [1920, 1080]);
    assert.deepEqual(parseResolution('1920x1080;rm -rf'), [1920, 1080]);
  });
  it('limits duration to footage after the trim point', () => {
    assert.equal(effectiveDurationSec(5, 3, 0), 3);
    assert.equal(effectiveDurationSec(2, 10, 1), 2);
    assert.equal(effectiveDurationSec(5, 4, 3), 1);
    assert.equal(effectiveDurationSec(5, 2, 3), 0);
    assert.equal(effectiveDurationSec(5, NaN, 0), 0);
  });
  it('adds a silent track only when the source has no audio', () => {
    const base = { input: 'in.mp4', output: 'out.mp4', trimStartSec: 0, durationSec: 2, width: 1920, height: 1080, fps: 24, colorFilter: '', volume: 1 };
    assert.ok(buildNormalizeArgs({ ...base, hasAudio: false }).join(' ').includes('anullsrc'));
    assert.ok(!buildNormalizeArgs({ ...base, hasAudio: true }).join(' ').includes('anullsrc'));
  });
  it('cut positions are rounded to frames, so rounding never adds up along the edit', () => {
    const fps = 24;
    let total = 0;
    let start = 0;
    for (let i = 0; i < 40; i++) {
      const end = start + 1013 + (i % 7) * 37;
      total += clipFrames(start, end, 60, fps);
      start = end;
    }
    assert.ok(Math.abs(total / fps - start / 1000) <= 0.5 / fps, `${total / fps} vs ${start / 1000}`);
  });
  it('a clip is never longer than its footage and at least one frame', () => {
    assert.equal(clipFrames(0, 5000, 2, 24), 48);
    assert.equal(clipFrames(0, 10, 2, 24), 1);
  });
  it('every clip gets sound exactly as long as its picture', () => {
    const args = buildNormalizeArgs({ input: 'in.mp4', output: 'out.mov', trimStartSec: 0, durationSec: 2, width: 640, height: 360, fps: 24, colorFilter: '', hasAudio: true, volume: 1 }).join(' ');
    assert.ok(args.includes('apad'));
    assert.ok(args.includes('tpad=stop_mode=clone'));
    assert.ok(args.includes('pcm_s16le'));
  });
  it('applies clip volume and clamps it', () => {
    const base = { input: 'in.mp4', output: 'out.mp4', trimStartSec: 0, durationSec: 2, width: 1920, height: 1080, fps: 24, colorFilter: '', hasAudio: true };
    assert.ok(buildNormalizeArgs({ ...base, volume: 0.5 }).join(' ').includes('volume=0.500'));
    assert.ok(buildNormalizeArgs({ ...base, volume: 9 }).join(' ').includes('volume=2.000'));
  });
});

let hasFfmpeg = true;
try { execFileSync('ffmpeg', ['-version']); execFileSync('ffprobe', ['-version']); } catch { hasFfmpeg = false; }

describe('real ffmpeg render', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  let dir;
  before(async () => { dir = await mkdtemp(join(tmpdir(), 'vw-render-')); });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  const probe = async (file, entries) =>
    (await run('ffprobe', ['-v', 'error', ...entries, '-of', 'csv=p=0', file])).stdout.trim();

  it('renders silent, voiced and odd-sized clips with graded transitions into one file', async () => {
    const sources = [
      { name: 'silent', size: '640x360', audio: false, seconds: 2 },
      { name: 'voiced', size: '320x240', audio: true, seconds: 2 },
      { name: 'portrait', size: '360x640', audio: false, seconds: 3 },
    ];
    const normalized = [];
    for (const s of sources) {
      const src = join(dir, `${s.name}.mp4`);
      const args = ['-y', '-f', 'lavfi', '-i', `testsrc=size=${s.size}:rate=30:duration=${s.seconds}`];
      if (s.audio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${s.seconds}`);
      args.push('-pix_fmt', 'yuv420p', src);
      await run('ffmpeg', args);

      const hasAudio = Boolean(await probe(src, ['-select_streams', 'a:0', '-show_entries', 'stream=index']));
      assert.equal(hasAudio, s.audio);
      const probed = Number(await probe(src, ['-show_entries', 'format=duration']));
      const out = join(dir, `norm-${s.name}.mp4`);
      await run('ffmpeg', buildNormalizeArgs({
        input: src, output: out, trimStartSec: 0,
        durationSec: effectiveDurationSec(10, probed, 0),
        width: 640, height: 360, fps: 24,
        colorFilter: getGradeById('teal-orange').ffmpeg_filter, hasAudio, volume: 0.8,
      }));
      normalized.push({ path: out, seconds: s.seconds });
    }

    const pairs = [
      { clip_a_path: normalized[0].path, clip_b_path: normalized[1].path, clip_a_duration_sec: 2, clip_b_duration_sec: 2, transition: 'crossfade', duration_ms: 500 },
      { clip_a_path: normalized[1].path, clip_b_path: normalized[2].path, clip_a_duration_sec: 2, clip_b_duration_sec: 3, transition: 'fade_black', duration_ms: 800 },
    ];
    const { inputArgs, filterComplex, maps } = buildXfadeFilter(pairs);
    const finalPath = join(dir, 'final.mp4');
    await run('ffmpeg', ['-y', ...inputArgs, '-filter_complex', filterComplex, ...maps, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', finalPath]);

    const duration = Number(await probe(finalPath, ['-show_entries', 'format=duration']));
    assert.ok(Math.abs(duration - (2 + 2 + 3 - 0.5 - 0.8)) < 0.25, `duration ${duration}`);
    assert.equal(await probe(finalPath, ['-select_streams', 'v:0', '-show_entries', 'stream=width,height']), '640,360');
    assert.ok(await probe(finalPath, ['-select_streams', 'a:0', '-show_entries', 'stream=index']));
  });

  it('every built-in color grade is accepted by ffmpeg', async () => {
    const { BUILT_IN_GRADES } = await loadTs('core/services/color-grading.ts');
    for (const grade of BUILT_IN_GRADES) {
      const vf = grade.ffmpeg_filter || 'null';
      await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=0.2', '-vf', vf, '-f', 'null', '-'])
        .catch((e) => assert.fail(`${grade.id}: ${e.stderr}`));
    }
  });

  it('every transition is accepted by ffmpeg xfade', async () => {
    const { TRANSITION_REGISTRY } = await loadTs('core/services/transitions.ts');
    const a = join(dir, 'xa.mp4');
    const b = join(dir, 'xb.mp4');
    for (const f of [a, b]) {
      await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-pix_fmt', 'yuv420p', '-shortest', f]);
    }
    for (const transition of Object.keys(TRANSITION_REGISTRY)) {
      const { inputArgs, filterComplex, maps } = buildXfadeFilter([{ clip_a_path: a, clip_b_path: b, clip_a_duration_sec: 2, clip_b_duration_sec: 2, transition, duration_ms: 500 }]);
      await run('ffmpeg', ['-v', 'error', ...inputArgs, '-filter_complex', filterComplex, ...maps, '-f', 'null', '-'])
        .catch((e) => assert.fail(`${transition}: ${e.stderr}`));
    }
  });
});

describe('music mix', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  let dir;
  before(async () => { dir = await mkdtemp(join(tmpdir(), 'vw-music-')); });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  const rms = (samples, from, to) => {
    let sum = 0;
    const a = Math.round(from * ANALYSIS_RATE);
    const b = Math.round(to * ANALYSIS_RATE);
    for (let i = a; i < b; i++) sum += samples[i] ** 2;
    return Math.sqrt(sum / Math.max(1, b - a));
  };

  it('places, fades and trims music under a silent picture to the picture length', async () => {
    const video = join(dir, 'v.mp4');
    const song = join(dir, 'song.mp3');
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=8', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '8', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=30', '-c:a', 'libmp3lame', song]);
    const out = join(dir, 'mixed.mp4');
    await run('ffmpeg', buildMusicMixArgs({
      video, output: out, totalSec: 8, keepVideoAudio: true,
      music: [{ path: song, startSec: 2, trimSec: 5, durationSec: 30, volume: 1, fadeInSec: 0.5, fadeOutSec: 1 }],
    }));
    const samples = await decodeMono('ffmpeg', out);
    const seconds = samples.length / ANALYSIS_RATE;
    assert.ok(Math.abs(seconds - 8) < 0.15, `audio is ${seconds}s, picture is 8s`);
    assert.ok(rms(samples, 0.2, 1.8) < 0.005, 'silent before the music starts');
    const middle = rms(samples, 3, 5);
    assert.ok(middle > 0.05, 'music is audible in the middle');
    assert.ok(rms(samples, 7.8, 7.98) < middle / 3, 'music fades out with the last shot');
  });

  it('mixes two cues and keeps the clip sound', async () => {
    const video = join(dir, 'v2.mp4');
    const a = join(dir, 'a.wav');
    const b = join(dir, 'b.wav');
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=6', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=200:duration=10', a]);
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=10', b]);
    const out = join(dir, 'mixed2.mp4');
    await run('ffmpeg', buildMusicMixArgs({
      video, output: out, totalSec: 6, keepVideoAudio: true,
      music: [
        { path: a, startSec: 0, trimSec: 0, durationSec: 3, volume: 0.8, fadeInSec: 0.2, fadeOutSec: 0.2 },
        { path: b, startSec: 3, trimSec: 0, durationSec: 10, volume: 0.8, fadeInSec: 0.2, fadeOutSec: 0.2 },
      ],
    }));
    const samples = await decodeMono('ffmpeg', out);
    assert.ok(Math.abs(samples.length / ANALYSIS_RATE - 6) < 0.15);
    assert.ok(rms(samples, 1, 2) > 0.05 && rms(samples, 4, 5) > 0.05);
  });

  it('works with the picture muted', async () => {
    const video = join(dir, 'v3.mp4');
    const song = join(dir, 's3.wav');
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=4', '-pix_fmt', 'yuv420p', video]);
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', song]);
    const out = join(dir, 'mixed3.mp4');
    await run('ffmpeg', buildMusicMixArgs({ video, output: out, totalSec: 4, keepVideoAudio: false, music: [{ path: song, startSec: 0, trimSec: 0, durationSec: 2, volume: 1, fadeInSec: 0, fadeOutSec: 0.3 }] }));
    const samples = await decodeMono('ffmpeg', out);
    assert.ok(Math.abs(samples.length / ANALYSIS_RATE - 4) < 0.15, 'short music is padded to the picture length');
  });
});

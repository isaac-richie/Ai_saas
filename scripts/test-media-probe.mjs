import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';

const run = promisify(execFile);
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const { parseFfmpegInfo, probeMedia } = await loadTs('core/services/media-probe.ts');

describe('parseFfmpegInfo', () => {
  it('reads duration, size and streams', () => {
    const info = parseFfmpegInfo(`Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:01:05.04, start: 0.000000, bitrate: 1200 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 24 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s`);
    assert.deepEqual(info, { durationSec: 65.04, width: 1920, height: 1080, hasVideo: true, hasAudio: true });
  });
  it('detects missing audio', () => {
    const info = parseFfmpegInfo(`  Duration: 00:00:05.00, start: 0.000000
  Stream #0:0: Video: h264, yuv420p, 1280x720, 30 fps`);
    assert.equal(info.hasAudio, false);
  });
  it('swaps size for rotated phone video', () => {
    const info = parseFfmpegInfo(`  Duration: 00:00:03.00
  Stream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps
      displaymatrix: rotation of -90.00 degrees`);
    assert.deepEqual([info.width, info.height], [1080, 1920]);
  });
  it('ignores cover art in audio files', () => {
    const info = parseFfmpegInfo(`  Duration: 00:03:00.00
  Stream #0:0: Audio: mp3, 44100 Hz, stereo
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p, 600x600, 90k tbr (attached pic)`);
    assert.equal(info.hasVideo, false);
    assert.equal(info.hasAudio, true);
  });
  it('NaN duration when absent', () => {
    assert.ok(Number.isNaN(parseFfmpegInfo('garbage').durationSec));
  });
});

describe('probeMedia with the bundled ffmpeg', () => {
  let dir;
  before(async () => { dir = await mkdtemp(join(tmpdir(), 'vw-probe-')); });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('probes a real video with audio', async () => {
    const f = join(dir, 'a.mp4');
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-shortest', '-pix_fmt', 'yuv420p', f]);
    const info = await probeMedia(ffmpeg, f);
    assert.equal(info.width, 320);
    assert.equal(info.height, 240);
    assert.equal(info.hasAudio, true);
    assert.ok(Math.abs(info.durationSec - 2) < 0.1);
  });
  it('probes a silent video', async () => {
    const f = join(dir, 'b.mp4');
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=1', '-pix_fmt', 'yuv420p', f]);
    const info = await probeMedia(ffmpeg, f);
    assert.equal(info.hasAudio, false);
    assert.deepEqual([info.width, info.height], [640, 360]);
  });
  it('rejects a file that is not media', async () => {
    const f = join(dir, 'c.mp4');
    await (await import('node:fs/promises')).writeFile(f, 'not a video');
    await assert.rejects(probeMedia(ffmpeg, f));
  });
});

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
const { VIDEO_FORMATS, FRAME_FITS, buildFrameFilter, formatFor, isFrameFit, isFormatResolution } = await loadTs('core/services/video-format.ts');
const { buildNormalizeArgs, parseResolution } = await loadTs('core/services/timeline-render.ts');
const { probeMedia } = await loadTs('core/services/media-probe.ts');

describe('video formats', () => {
  it('every format has even, renderable dimensions', () => {
    for (const f of VIDEO_FORMATS) {
      const [w, h] = parseResolution(f.resolution);
      assert.equal(`${w}x${h}`, f.resolution, f.id);
    }
  });
  it('unknown resolutions fall back to widescreen', () => {
    assert.equal(formatFor('123x45').id, 'widescreen');
    assert.equal(formatFor(undefined).id, 'widescreen');
    assert.equal(formatFor('1080x1920').id, 'vertical');
  });
  it('only accepts known formats and fits', () => {
    assert.ok(isFormatResolution('1080x1080'));
    assert.ok(!isFormatResolution('7680x4320'));
    assert.ok(!isFormatResolution("1080x1080'; drop table"));
    assert.ok(isFrameFit('blur') && !isFrameFit('stretch') && !isFrameFit(null));
  });
});

describe('putting wide footage into every frame shape (real ffmpeg)', () => {
  let dir;
  let source;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vw-format-'));
    source = join(dir, 'wide.mp4');
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=1', '-pix_fmt', 'yuv420p', source]);
  });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  for (const format of VIDEO_FORMATS) {
    for (const { id: fit } of FRAME_FITS) {
      it(`${format.label} with ${fit}`, async () => {
        // Small frames keep the test quick; the filter only depends on the shape.
        const [w, h] = parseResolution(format.resolution).map((n) => Math.round(n / 6 / 2) * 2);
        const out = join(dir, `${format.id}-${fit}.mov`);
        await run(ffmpeg, buildNormalizeArgs({ input: source, output: out, trimStartSec: 0, durationSec: 0.5, width: w, height: h, fps: 24, colorFilter: '', hasAudio: false, volume: 1, fit }));
        const info = await probeMedia(ffmpeg, out);
        assert.deepEqual([info.width, info.height], [w, h]);
      });
    }
  }

  it('blur fills the edges with picture, black bars leave them black', async () => {
    const edge = async (fit) => {
      const out = join(dir, `edge-${fit}.mov`);
      await run(ffmpeg, buildNormalizeArgs({ input: source, output: out, trimStartSec: 0, durationSec: 0.2, width: 180, height: 320, fps: 24, colorFilter: '', hasAudio: false, volume: 1, fit }));
      // The top 40 rows of a vertical frame lie outside the wide picture.
      const { stdout } = await run(ffmpeg, ['-v', 'error', '-i', out, '-frames:v', '1', '-vf', 'crop=180:40:0:0,format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 1e7 });
      return stdout.reduce((s, v) => s + v, 0) / stdout.length;
    };
    assert.ok((await edge('fit')) < 20, 'black bars are dark');
    assert.ok((await edge('blur')) > 40, 'blurred background is visible');
  });

  it('the filter is a single graph usable inside -vf', () => {
    const f = buildFrameFilter(1080, 1920, 'blur');
    assert.ok(f.startsWith('split=2'));
    assert.ok(!/\[in\]|\[out\]/.test(f));
  });
});

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTs } from './load-ts.mjs';

const run = promisify(execFile);
const {
  cropSize, sampleTimes, detectionsToKeyframes, smoothKeyframes, cropPath, piecewiseExpr, buildReframeFilter, buildReframeArgs, MAX_KEYFRAMES,
} = await loadTs('core/services/reframe.ts');

// Mirrors ffmpeg's evaluation of the expressions we generate, so the maths can be checked exactly.
function evalExpr(expr, t) {
  const js = expr.replace(/if\(/g, 'iff(').replace(/lt\(/g, 'lt(');
  return Function('t', 'iff', 'lt', `return ${js};`)(t, (c, a, b) => (c ? a : b), (a, b) => a < b);
}

describe('cropSize', () => {
  it('crops width for vertical from landscape', () => assert.deepEqual(cropSize(1920, 1080, 9 / 16), { w: 606, h: 1080 }));
  it('crops width for square from landscape', () => assert.deepEqual(cropSize(1920, 1080, 1), { w: 1080, h: 1080 }));
  it('crops height when the source is taller than the target', () => assert.deepEqual(cropSize(1080, 1920, 1), { w: 1080, h: 1080 }));
  it('always returns even dimensions that fit', () => {
    for (const [w, h] of [[641, 361], [1279, 719], [999, 999], [3, 3]]) {
      for (const r of [9 / 16, 1, 4 / 5]) {
        const c = cropSize(w, h, r);
        assert.equal(c.w % 2, 0);
        assert.equal(c.h % 2, 0);
        assert.ok(c.w <= Math.max(2, w) && c.h <= Math.max(2, h), `${w}x${h} r${r} -> ${c.w}x${c.h}`);
      }
    }
  });
});

describe('sampleTimes', () => {
  it('one sample per second at midpoints', () => assert.deepEqual(sampleTimes(3), [0.5, 1.5, 2.5]));
  it('caps long videos', () => {
    const s = sampleTimes(600, 24);
    assert.equal(s.length, 24);
    assert.ok(s[s.length - 1] < 600);
  });
  it('handles zero, negative and NaN', () => {
    assert.deepEqual(sampleTimes(0), []);
    assert.deepEqual(sampleTimes(-5), []);
    assert.deepEqual(sampleTimes(NaN), []);
  });
});

describe('smoothKeyframes', () => {
  it('clamps out-of-range and NaN positions', () => {
    const s = smoothKeyframes([{ t: 0, x: 5, y: -2 }, { t: 1, x: NaN, y: 0.5 }], 0);
    for (const k of s) assert.ok(k.x >= 0 && k.x <= 1 && k.y >= 0 && k.y <= 1);
  });
  it('sorts and drops duplicate or invalid times', () => {
    const s = smoothKeyframes([{ t: 2, x: 0.5, y: 0.5 }, { t: 1, x: 0.5, y: 0.5 }, { t: 1, x: 0.9, y: 0.9 }, { t: -1, x: 0, y: 0 }, { t: NaN, x: 0, y: 0 }]);
    assert.deepEqual(s.map((k) => k.t), [1, 2]);
  });
  it('holds the frame still for small drifts', () => {
    const s = smoothKeyframes([{ t: 0, x: 0.5, y: 0.5 }, { t: 1, x: 0.51, y: 0.49 }, { t: 2, x: 0.52, y: 0.5 }]);
    assert.ok(s.every((k) => k.x === s[0].x));
  });
  it('still follows real movement', () => {
    const s = smoothKeyframes([{ t: 0, x: 0.1, y: 0.5 }, { t: 1, x: 0.5, y: 0.5 }, { t: 2, x: 0.9, y: 0.5 }]);
    assert.ok(s[2].x > s[0].x + 0.3);
  });
  it('steady motion is followed exactly, including the first and last points', () => {
    const raw = [0.5, 1.5, 2.5, 3.5].map((t) => ({ t, x: 0.1 + 0.2 * t, y: 0.5 }));
    smoothKeyframes(raw).forEach((k, i) => assert.ok(Math.abs(k.x - raw[i].x) < 1e-9, `t=${k.t}`));
  });
  it('removes a single-frame jitter spike', () => {
    const s = smoothKeyframes([{ t: 0, x: 0.5, y: 0.5 }, { t: 1, x: 0.9, y: 0.5 }, { t: 2, x: 0.5, y: 0.5 }]);
    assert.ok(s[1].x < 0.7);
  });
  it('caps keyframe count', () => {
    const raw = Array.from({ length: 200 }, (_, i) => ({ t: i, x: (i % 10) / 10, y: 0.5 }));
    const s = smoothKeyframes(raw);
    assert.equal(s.length, MAX_KEYFRAMES);
    assert.equal(s[0].t, 0);
    assert.equal(s[s.length - 1].t, 199);
  });
  it('empty in, empty out', () => assert.deepEqual(smoothKeyframes([]), []));
});

describe('cropPath', () => {
  it('keeps the window inside the frame at the edges', () => {
    const crop = { w: 606, h: 1080 };
    const p = cropPath([{ t: 0, x: 0, y: 0 }, { t: 1, x: 1, y: 1 }], 1920, 1080, crop);
    assert.deepEqual(p.map((k) => [k.x, k.y]), [[0, 0], [1314, 0]]);
  });
  it('centres when there are no detections', () => {
    const p = cropPath([], 1920, 1080, { w: 606, h: 1080 });
    assert.deepEqual(p, [{ t: 0, x: 657, y: 0 }]);
  });
});

describe('piecewiseExpr', () => {
  const pts = [{ t: 1, v: 100 }, { t: 3, v: 300 }, { t: 5, v: 300 }];
  it('holds before the first point and after the last', () => {
    const e = piecewiseExpr(pts);
    assert.equal(evalExpr(e, 0), 100);
    assert.equal(evalExpr(e, 99), 300);
  });
  it('interpolates linearly between points', () => {
    const e = piecewiseExpr(pts);
    assert.equal(evalExpr(e, 2), 200);
    assert.equal(evalExpr(e, 4), 300);
  });
  it('handles decreasing values', () => {
    assert.equal(evalExpr(piecewiseExpr([{ t: 0, v: 500 }, { t: 2, v: 100 }]), 1), 300);
  });
  it('single point is constant', () => {
    const e = piecewiseExpr([{ t: 2, v: 42 }]);
    assert.equal(evalExpr(e, 0), 42);
    assert.equal(evalExpr(e, 10), 42);
  });
  it('contains no characters that could break out of the quoted filter option', () => {
    const e = piecewiseExpr(Array.from({ length: 30 }, (_, i) => ({ t: i * 0.333, v: i * 17.77 })));
    assert.ok(!/[';\[\]]/.test(e));
  });
});

describe('detectionsToKeyframes', () => {
  const times = [0.5, 1.5, 2.5];
  it('maps 1-based frame numbers to times', () => {
    assert.deepEqual(detectionsToKeyframes(times, [{ frame: 3, x: 0.2, y: 0.4 }, { frame: 1, x: 0.5, y: 0.5 }]).map((k) => k.t), [0.5, 2.5]);
  });
  it('ignores out of range, fractional, duplicate and NaN detections', () => {
    const k = detectionsToKeyframes(times, [{ frame: 0, x: 0.5, y: 0.5 }, { frame: 4, x: 0.5, y: 0.5 }, { frame: 1.5, x: 0.5, y: 0.5 }, { frame: 2, x: NaN, y: 0.5 }, { frame: 1, x: 0.1, y: 0.1 }, { frame: 1, x: 0.9, y: 0.9 }]);
    assert.deepEqual(k, [{ t: 0.5, x: 0.1, y: 0.1 }]);
  });
});

describe('buildReframeArgs', () => {
  it('keeps audio when present without failing when absent', () => {
    const args = buildReframeArgs('in.mp4', 'out.mp4', 'null').join(' ');
    assert.ok(args.includes('-map 0:a?'));
  });
});

let hasFfmpeg = true;
try { execFileSync('ffmpeg', ['-version']); } catch { hasFfmpeg = false; }

describe('real ffmpeg reframe', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  let dir;
  let source;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vw-reframe-'));
    source = join(dir, 'moving.mp4');
    // A 60px red square crosses a black 640x360 frame from x=40 to x=540 over 4 seconds.
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=24:d=4', '-f', 'lavfi', '-i', 'color=c=red:s=60x60:r=24:d=4',
      '-filter_complex', "[0][1]overlay=x='40+125*t':y=150:shortest=1", '-pix_fmt', 'yuv420p', source]);
  });

  it('fixture: the red square really moves across the source', async () => {
    const at = async (t, x) => (await run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', source, '-frames:v', '1',
      '-vf', `crop=8:8:${x}:176,scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' })).stdout[0];
    assert.ok((await at(1, 191)) > 150, 'square at x~195 when t=1');
    assert.ok((await at(3, 441)) > 150, 'square at x~445 when t=3');
    assert.ok((await at(3, 191)) < 60, 'square has left x~195 by t=3');
  });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  async function centrePixel(file, t) {
    const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1',
      '-vf', 'crop=8:8:iw/2-4:ih/2-4,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' });
    return [...stdout];
  }

  it('vertical crop follows the moving subject', async () => {
    const keyframes = [0.5, 1.5, 2.5, 3.5].map((t) => ({ t, x: (40 + 125 * t + 30) / 640, y: 180 / 360 }));
    const out = join(dir, 'vertical.mp4');
    await run('ffmpeg', buildReframeArgs(source, out, buildReframeFilter(keyframes, 640, 360, '9:16')));

    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out]);
    assert.equal(stdout.trim(), '1080,1920');

    for (const t of [1, 2, 3]) {
      const [r, g, b] = await centrePixel(out, t);
      assert.ok(r > 150 && g < 90 && b < 90, `t=${t}: centre pixel is rgb(${r},${g},${b}), expected red`);
    }
  });

  it('a static centre crop loses the subject, proving the tracking matters', async () => {
    const out = join(dir, 'static.mp4');
    await run('ffmpeg', buildReframeArgs(source, out, buildReframeFilter([], 640, 360, '9:16')));
    const [r] = await centrePixel(out, 3.5);
    assert.ok(r < 100, 'centre crop should not contain the subject at the end');
  });

  it('every aspect renders at its target size', async () => {
    for (const [aspect, size] of [['1:1', '1080,1080'], ['4:5', '1080,1350']]) {
      const out = join(dir, `${aspect.replace(':', 'x')}.mp4`);
      await run('ffmpeg', buildReframeArgs(source, out, buildReframeFilter([{ t: 1, x: 0.3, y: 0.5 }], 640, 360, aspect)));
      const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out]);
      assert.equal(stdout.trim(), size, aspect);
    }
  });
});

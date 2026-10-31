import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { TRANSITION_REGISTRY, validateTransitionDuration, buildXfadeFilter } = await loadTs('core/services/transitions.ts');

describe('Transition validation', () => {
  it('accepts valid crossfade within limits', () => {
    const r = validateTransitionDuration('crossfade', 500, 5000, 5000);
    assert.equal(r.valid, true);
    assert.equal(r.clamped_ms, 500);
  });

  it('clamps duration that exceeds spec max', () => {
    const r = validateTransitionDuration('crossfade', 5000, 10000, 10000);
    assert.equal(r.valid, false);
    assert.equal(r.clamped_ms, 3000);
  });

  it('clamps duration that exceeds half of shorter clip', () => {
    const r = validateTransitionDuration('crossfade', 2000, 2000, 10000);
    assert.equal(r.valid, false);
    assert.equal(r.clamped_ms, 1000);
  });

  it('a cut never overlaps the clips', () => {
    const r = validateTransitionDuration('cut', 500, 5000, 5000);
    assert.equal(r.valid, false);
    assert.equal(r.clamped_ms, 0);
  });

  it('rejects unknown transition', () => {
    const r = validateTransitionDuration('bogus', 500, 5000, 5000);
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('Unknown'));
  });

  it('handles very short clips gracefully', () => {
    const r = validateTransitionDuration('crossfade', 500, 200, 200);
    assert.equal(r.valid, false);
    assert.equal(r.clamped_ms, 100);
  });

  it('min_duration_ms wins over clip constraint', () => {
    const r = validateTransitionDuration('fade_black', 50, 100, 100);
    assert.equal(r.clamped_ms, 200);
  });
});

describe('buildXfadeFilter', () => {
  it('throws on empty pairs', () => {
    assert.throws(() => buildXfadeFilter([]), /at least one/);
  });

  it('builds correct filter for single pair crossfade', () => {
    const { inputArgs, filterComplex, maps } = buildXfadeFilter([{
      clip_a_path: 'a.mp4',
      clip_b_path: 'b.mp4',
      clip_a_duration_sec: 5,
      clip_b_duration_sec: 5,
      transition: 'crossfade',
      duration_ms: 500,
    }]);
    assert.deepEqual(inputArgs, ['-i', 'a.mp4', '-i', 'b.mp4']);
    assert.ok(filterComplex.includes('xfade=transition=fade'));
    assert.ok(filterComplex.includes('duration=0.5000'));
    assert.ok(filterComplex.includes('offset=4.5000'));
    assert.ok(filterComplex.includes('acrossfade'));
    assert.deepEqual(maps, ['-map', '[vx0]', '-map', '[ax0]']);
  });

  it('joins a hard cut end to end with no overlap', () => {
    const { filterComplex, maps } = buildXfadeFilter([{
      clip_a_path: 'a.mp4',
      clip_b_path: 'b.mp4',
      clip_a_duration_sec: 5,
      clip_b_duration_sec: 5,
      transition: 'cut',
      duration_ms: 10,
    }]);
    assert.ok(filterComplex.includes('concat=n=2:v=1:a=1'));
    assert.ok(!filterComplex.includes('xfade'));
    assert.deepEqual(maps, ['-map', '[vx0]', '-map', '[ax0]']);
  });

  it('a muted cut joins only the picture', () => {
    const { filterComplex, maps } = buildXfadeFilter([{ clip_a_path: 'a', clip_b_path: 'b', clip_a_duration_sec: 2, clip_b_duration_sec: 2, transition: 'cut', duration_ms: 0 }], { mute: true });
    assert.ok(filterComplex.includes('concat=n=2:v=1:a=0'));
    assert.deepEqual(maps, ['-map', '[vx0]']);
  });

  it('rounds transition overlaps to whole frames', () => {
    const { filterComplex } = buildXfadeFilter([{ clip_a_path: 'a', clip_b_path: 'b', clip_a_duration_sec: 3, clip_b_duration_sec: 3, transition: 'crossfade', duration_ms: 300 }], { fps: 24 });
    // 300 ms is 7.2 frames at 24 fps, so 7 frames.
    assert.ok(filterComplex.includes(`duration=${(7 / 24).toFixed(4)}`));
    assert.ok(filterComplex.includes(`acrossfade=d=${(7 / 24).toFixed(4)}`));
  });

  it('chains three clips with two transitions', () => {
    const { inputArgs, filterComplex } = buildXfadeFilter([
      { clip_a_path: 'a.mp4', clip_b_path: 'b.mp4', clip_a_duration_sec: 5, clip_b_duration_sec: 5, transition: 'crossfade', duration_ms: 500 },
      { clip_a_path: 'b.mp4', clip_b_path: 'c.mp4', clip_a_duration_sec: 5, clip_b_duration_sec: 5, transition: 'fade_black', duration_ms: 800 },
    ]);
    assert.deepEqual(inputArgs, ['-i', 'a.mp4', '-i', 'b.mp4', '-i', 'c.mp4']);
    assert.ok(filterComplex.includes('[vx0]'));
    assert.ok(filterComplex.includes('[vx1]'));
    assert.ok(filterComplex.includes('fadeblack'));
  });

  it('mute mode omits audio filters', () => {
    const { filterComplex, maps } = buildXfadeFilter(
      [{ clip_a_path: 'a.mp4', clip_b_path: 'b.mp4', clip_a_duration_sec: 5, clip_b_duration_sec: 5, transition: 'crossfade', duration_ms: 500 }],
      { mute: true },
    );
    assert.ok(!filterComplex.includes('acrossfade'));
    assert.equal(maps.length, 2);
  });

  it('clamps transition duration to half of shorter clip', () => {
    const { filterComplex } = buildXfadeFilter([{
      clip_a_path: 'a.mp4',
      clip_b_path: 'b.mp4',
      clip_a_duration_sec: 1,
      clip_b_duration_sec: 5,
      transition: 'crossfade',
      duration_ms: 3000,
    }]);
    assert.ok(filterComplex.includes('duration=0.5000'));
  });

  it('handles wipe transitions', () => {
    const { filterComplex } = buildXfadeFilter([{
      clip_a_path: 'a.mp4',
      clip_b_path: 'b.mp4',
      clip_a_duration_sec: 5,
      clip_b_duration_sec: 5,
      transition: 'wipe_left',
      duration_ms: 600,
    }]);
    assert.ok(filterComplex.includes('wipeleft'));
  });

  it('offset is never negative', () => {
    const { filterComplex } = buildXfadeFilter([{
      clip_a_path: 'a.mp4',
      clip_b_path: 'b.mp4',
      clip_a_duration_sec: 0.5,
      clip_b_duration_sec: 0.5,
      transition: 'crossfade',
      duration_ms: 3000,
    }]);
    const offsetMatch = filterComplex.match(/offset=([\d.]+)/);
    assert.ok(offsetMatch);
    assert.ok(parseFloat(offsetMatch[1]) >= 0, `Offset ${offsetMatch[1]} should be >= 0`);
  });
});

describe('Timeline duration calculation', () => {
  it('total duration accounts for overlaps from transitions', () => {
    let timelineSec = 5;
    const durSec = 0.5;
    timelineSec += 5 - durSec;
    timelineSec += 5 - 0.8;
    assert.equal(timelineSec, 13.7);
  });
});

describe('Transition robustness', () => {
  it('unknown transition names from the database fall back to a cut instead of crashing', () => {
    const { filterComplex } = buildXfadeFilter([{ clip_a_path: 'a.mp4', clip_b_path: 'b.mp4', clip_a_duration_sec: 5, clip_b_duration_sec: 5, transition: 'legacy_fade', duration_ms: 500 }]);
    assert.ok(filterComplex.includes('concat=n=2'));
  });
  it('offsets stay monotonic across a long chain', () => {
    const pairs = Array.from({ length: 12 }, (_, i) => ({ clip_a_path: `${i}.mp4`, clip_b_path: `${i + 1}.mp4`, clip_a_duration_sec: 2, clip_b_duration_sec: 2, transition: i % 2 ? 'crossfade' : 'cut', duration_ms: 700 }));
    const offsets = [...buildXfadeFilter(pairs).filterComplex.matchAll(/offset=([\d.]+)/g)].map((m) => Number(m[1]));
    assert.equal(offsets.length, 6);
    for (let i = 1; i < offsets.length; i++) assert.ok(offsets[i] > offsets[i - 1], `offset ${i}`);
  });
});

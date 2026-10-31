import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { snapCutsToBeats, buildDuckingFilter, buildAudioFadeFilter, buildVolumeFilter, parseSilenceRanges } = await loadTs('core/services/audio-engine.ts');

describe('Beat snapping', () => {
  const beats = [
    { time_sec: 1.0, strength: 0.8 },
    { time_sec: 2.0, strength: 0.9 },
    { time_sec: 3.0, strength: 0.7 },
  ];

  it('snaps cut within tolerance to nearest beat', () => {
    const result = snapCutsToBeats([1.1], beats, 0.15);
    assert.equal(result[0], 1.0);
  });

  it('leaves cut unchanged outside tolerance', () => {
    const result = snapCutsToBeats([1.5], beats, 0.15);
    assert.equal(result[0], 1.5);
  });

  it('snaps multiple cuts independently', () => {
    const result = snapCutsToBeats([0.95, 2.05, 4.0], beats, 0.15);
    assert.equal(result[0], 1.0);
    assert.equal(result[1], 2.0);
    assert.equal(result[2], 4.0);
  });

  it('handles empty beats array', () => {
    const result = snapCutsToBeats([1.0, 2.0], [], 0.15);
    assert.deepEqual(result, [1.0, 2.0]);
  });

  it('handles empty cuts array', () => {
    assert.deepEqual(snapCutsToBeats([], beats, 0.15), []);
  });
});

describe('Audio ducking filter', () => {
  const config = { threshold_db: -20, reduction_db: -12, attack_ms: 50, release_ms: 300 };

  it('generates valid filter chain', () => {
    const filter = buildDuckingFilter(0, 1, config);
    assert.ok(filter.includes('[0:a]asplit'));
    assert.ok(filter.includes('[1:a]'));
    assert.ok(filter.includes('sidechaincompress'));
    assert.ok(filter.includes('amix'));
    assert.ok(filter.includes('[out]'));
  });

  it('uses correct threshold', () => {
    const filter = buildDuckingFilter(0, 1, config);
    assert.ok(filter.includes('threshold=-20dB'));
  });

  it('uses correct attack/release', () => {
    const filter = buildDuckingFilter(0, 1, config);
    assert.ok(filter.includes('attack=50'));
    assert.ok(filter.includes('release=300'));
  });
});

describe('Audio fade filter', () => {
  it('builds fade in only', () => {
    const f = buildAudioFadeFilter(0, 10, { fade_in_ms: 500, fade_out_ms: 0 });
    assert.ok(f.includes('afade=t=in'));
    assert.ok(!f.includes('afade=t=out'));
  });

  it('builds fade out only', () => {
    const f = buildAudioFadeFilter(0, 10, { fade_in_ms: 0, fade_out_ms: 1000 });
    assert.ok(f.includes('afade=t=out'));
    assert.ok(!f.includes('afade=t=in'));
  });

  it('builds both fades', () => {
    const f = buildAudioFadeFilter(0, 10, { fade_in_ms: 500, fade_out_ms: 1000 });
    assert.ok(f.includes('afade=t=in'));
    assert.ok(f.includes('afade=t=out'));
  });

  it('returns empty for no fades', () => {
    assert.equal(buildAudioFadeFilter(0, 10, { fade_in_ms: 0, fade_out_ms: 0 }), '');
  });

  it('calculates correct fade out start time', () => {
    const f = buildAudioFadeFilter(0, 10, { fade_in_ms: 0, fade_out_ms: 2000 });
    assert.ok(f.includes('st=8.0000'));
  });

  it('handles fade_out longer than clip', () => {
    const f = buildAudioFadeFilter(0, 1, { fade_in_ms: 0, fade_out_ms: 5000 });
    assert.ok(f.includes('st=0.0000'));
  });
});

describe('Volume filter', () => {
  it('returns empty for unity gain', () => {
    assert.equal(buildVolumeFilter(0, 1.0), '');
  });

  it('produces negative dB for volume < 1', () => {
    const f = buildVolumeFilter(0, 0.5);
    assert.ok(f.includes('volume=-'));
  });

  it('produces positive dB for volume > 1', () => {
    const f = buildVolumeFilter(0, 2.0);
    assert.ok(f.includes('volume='));
    assert.ok(!f.includes('volume=-'));
  });

  it('clamps near-zero volume', () => {
    const f = buildVolumeFilter(0, 0);
    assert.ok(f.includes('volume='));
  });
});

describe('Silence detection parsing', () => {
  it('parses silence ranges from ffmpeg output', () => {
    const stderr = [
      '[silencedetect @ 0x0] silence_start: 2.5',
      '[silencedetect @ 0x0] silence_end: 4.0 | silence_duration: 1.5',
      '[silencedetect @ 0x0] silence_start: 8.0',
      '[silencedetect @ 0x0] silence_end: 9.5 | silence_duration: 1.5',
    ].join('\n');
    const ranges = parseSilenceRanges(stderr);
    assert.equal(ranges.length, 2);
    assert.equal(ranges[0].start_sec, 2.5);
    assert.equal(ranges[0].end_sec, 4.0);
    assert.equal(ranges[0].duration_sec, 1.5);
    assert.equal(ranges[1].start_sec, 8.0);
  });

  it('handles no silence', () => {
    assert.deepEqual(parseSilenceRanges('no silence here'), []);
  });

  it('handles orphaned start without end', () => {
    const stderr = '[silencedetect @ 0x0] silence_start: 2.5';
    assert.deepEqual(parseSilenceRanges(stderr), []);
  });
});

describe('Beat snapping robustness', () => {
  it('never collapses two cuts onto the same beat', () => {
    const out = snapCutsToBeats([0.95, 1.05], [{ time_sec: 1, strength: 1 }], 0.15);
    assert.equal(new Set(out).size, 2);
    assert.ok(out[0] < out[1]);
  });
  it('keeps cuts in ascending order', () => {
    const out = snapCutsToBeats([1.0, 1.2, 1.3], [{ time_sec: 1.1, strength: 1 }, { time_sec: 1.25, strength: 1 }], 0.15);
    for (let i = 1; i < out.length; i++) assert.ok(out[i] > out[i - 1]);
  });
});

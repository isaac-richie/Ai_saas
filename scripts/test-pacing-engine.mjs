import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { MURCH_WEIGHTS, scoreCutPoint, PACING_PROFILES, analyzePacing, suggestCutPoints } = await loadTs('core/services/pacing-engine.ts');

describe('Murch Rule of Six scoring', () => {
  it('weights sum to 1.0', () => {
    const sum = Object.values(MURCH_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `Weights sum to ${sum}`);
  });

  it('perfect scores yield 1.0', () => {
    const r = scoreCutPoint({ emotion: 1, story: 1, rhythm: 1, eye_trace: 1, plane_2d: 1, space_3d: 1 });
    assert.equal(r.total, 1);
  });

  it('zero scores yield 0', () => {
    const r = scoreCutPoint({ emotion: 0, story: 0, rhythm: 0, eye_trace: 0, plane_2d: 0, space_3d: 0 });
    assert.equal(r.total, 0);
  });

  it('emotion dominates at 51%', () => {
    const emotionOnly = scoreCutPoint({ emotion: 1, story: 0, rhythm: 0, eye_trace: 0, plane_2d: 0, space_3d: 0 });
    assert.equal(emotionOnly.total, 0.51);
  });

  it('preserves input scores in output', () => {
    const r = scoreCutPoint({ emotion: 0.8, story: 0.6, rhythm: 0.5, eye_trace: 0.3, plane_2d: 0.2, space_3d: 0.1 });
    assert.equal(r.emotion, 0.8);
    assert.equal(r.story, 0.6);
  });
});

describe('Pacing analysis', () => {
  it('empty clips returns balanced', () => {
    const r = analyzePacing([], PACING_PROFILES.trailer);
    assert.equal(r.pace_rating, 'balanced');
    assert.equal(r.clip_count, 0);
  });

  it('trailer-paced clips are balanced for trailer profile', () => {
    const r = analyzePacing([1.5, 1.2, 1.8, 1.5, 1.3], PACING_PROFILES.trailer);
    assert.equal(r.pace_rating, 'balanced');
  });

  it('long clips are too_slow for trailer', () => {
    const r = analyzePacing([8, 10, 7, 9], PACING_PROFILES.trailer);
    assert.equal(r.pace_rating, 'too_slow');
  });

  it('short clips are too_fast for documentary', () => {
    const r = analyzePacing([1, 1.5, 0.8, 1.2], PACING_PROFILES.documentary);
    assert.equal(r.pace_rating, 'too_fast');
  });

  it('calculates variance correctly', () => {
    const r = analyzePacing([2, 2, 2, 2], PACING_PROFILES.trailer);
    assert.equal(r.variance, 0);
  });

  it('calculates correct total duration', () => {
    const r = analyzePacing([3, 4, 5], PACING_PROFILES.documentary);
    assert.equal(r.total_duration_sec, 12);
  });
});

describe('Cut point suggestion', () => {
  it('suggests cuts at profile intervals', () => {
    const cuts = suggestCutPoints(10, PACING_PROFILES.trailer);
    assert.ok(cuts.length > 0);
    assert.equal(cuts[0], 1.5);
    assert.equal(cuts[1], 3);
  });

  it('stops before last min_clip', () => {
    const cuts = suggestCutPoints(5, PACING_PROFILES.trailer);
    const lastCut = cuts[cuts.length - 1];
    assert.ok(lastCut < 5 - PACING_PROFILES.trailer.min_clip_sec);
  });

  it('returns empty for very short duration', () => {
    const cuts = suggestCutPoints(0.5, PACING_PROFILES.trailer);
    assert.equal(cuts.length, 0);
  });

  it('documentary has fewer cuts than trailer for same duration', () => {
    const trailerCuts = suggestCutPoints(30, PACING_PROFILES.trailer);
    const docCuts = suggestCutPoints(30, PACING_PROFILES.documentary);
    assert.ok(trailerCuts.length > docCuts.length);
  });
});

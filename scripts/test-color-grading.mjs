import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { BUILT_IN_GRADES, buildShotMatchFilter } = await loadTs('core/services/color-grading.ts');

describe('Color grading registry', () => {
  it('has unique IDs', () => {
    const ids = BUILT_IN_GRADES.map((g) => g.id);
    assert.equal(ids.length, new Set(ids).size);
  });

  it('natural grade has empty filter', () => {
    const natural = BUILT_IN_GRADES.find((g) => g.id === 'natural');
    assert.ok(natural);
    assert.equal(natural.ffmpeg_filter, '');
  });

  it('all non-natural grades have non-empty ffmpeg_filter', () => {
    for (const grade of BUILT_IN_GRADES) {
      if (grade.id === 'natural') continue;
      assert.ok(grade.ffmpeg_filter.length > 0, `${grade.id} has empty filter`);
    }
  });

  it('all grades have valid category', () => {
    const validCats = new Set(['film_stock', 'mood', 'genre', 'custom']);
    for (const grade of BUILT_IN_GRADES) {
      assert.ok(validCats.has(grade.category), `${grade.id} has invalid category ${grade.category}`);
    }
  });

  it('no ffmpeg_filter contains shell-unsafe characters', () => {
    const unsafe = /[;&|`$(){}!<>]/;
    for (const grade of BUILT_IN_GRADES) {
      assert.ok(!unsafe.test(grade.ffmpeg_filter), `${grade.id} filter contains unsafe chars: ${grade.ffmpeg_filter}`);
    }
  });

  it('every filter uses valid ffmpeg filter names', () => {
    const validFilters = new Set(['colorbalance', 'eq', 'curves', 'unsharp', 'vignette', 'lut3d']);
    for (const grade of BUILT_IN_GRADES) {
      if (!grade.ffmpeg_filter) continue;
      const parts = grade.ffmpeg_filter.split(',');
      for (const part of parts) {
        const filterName = part.split('=')[0].trim();
        assert.ok(validFilters.has(filterName), `${grade.id} uses unknown filter: ${filterName}`);
      }
    }
  });

  it('has at least one grade per category', () => {
    const cats = new Set(BUILT_IN_GRADES.map((g) => g.category));
    assert.ok(cats.has('film_stock'));
    assert.ok(cats.has('mood'));
    assert.ok(cats.has('genre'));
  });
});

describe('Shot matching', () => {
  it('produces zero offset when colors match', () => {
    const filter = buildShotMatchFilter(
      { avg_r: 128, avg_g: 128, avg_b: 128 },
      { avg_r: 128, avg_g: 128, avg_b: 128 },
    );
    assert.equal(filter, 'colorbalance=rs=0.000:gs=0.000:bs=0.000');
  });

  it('produces positive offset when reference is brighter', () => {
    const filter = buildShotMatchFilter(
      { avg_r: 200, avg_g: 128, avg_b: 128 },
      { avg_r: 100, avg_g: 128, avg_b: 128 },
    );
    assert.ok(filter.includes('rs=0.392'));
  });

  it('produces negative offset when reference is darker', () => {
    const filter = buildShotMatchFilter(
      { avg_r: 50, avg_g: 128, avg_b: 128 },
      { avg_r: 200, avg_g: 128, avg_b: 128 },
    );
    assert.ok(filter.includes('rs=-0.588'));
  });

  it('handles all channels independently', () => {
    const filter = buildShotMatchFilter(
      { avg_r: 200, avg_g: 100, avg_b: 50 },
      { avg_r: 100, avg_g: 200, avg_b: 150 },
    );
    assert.ok(filter.includes('rs=0.392'));
    assert.ok(filter.includes('gs=-0.392'));
    assert.ok(filter.includes('bs=-0.392'));
  });
});

describe('Shot matching bounds', () => {
  it('clamps channel offsets to the -1..1 range ffmpeg accepts', () => {
    const filter = buildShotMatchFilter({ avg_r: 900, avg_g: -500, avg_b: 0 }, { avg_r: 0, avg_g: 0, avg_b: 0 });
    for (const v of filter.match(/-?[\d.]+/g).map(Number)) assert.ok(v >= -1 && v <= 1, String(v));
  });
  it('treats NaN stats as no correction', () => {
    assert.equal(buildShotMatchFilter({ avg_r: NaN, avg_g: 1, avg_b: 1 }, { avg_r: 1, avg_g: 1, avg_b: 1 }), 'colorbalance=rs=0.000:gs=0.000:bs=0.000');
  });
});

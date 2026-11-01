import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const P = await loadTs('core/validation/production-assets.ts');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const asset = (n, extra = {}) => ({ id: id(n), name: `ref ${n}.jpg`, url: `https://x.supabase.co/storage/v1/object/public/elements/u/${n}.jpg`, role: 'location', mediaType: 'image', ...extra });

describe('a bigger reference library for longer films', () => {
  it('holds up to 24 references, not more', () => {
    const many = (n) => P.labelProductionAssets(Array.from({ length: n }, (_, i) => asset(i + 1)));
    assert.ok(P.productionAssetsSchema.safeParse(many(15)).success);
    assert.ok(P.productionAssetsSchema.safeParse(many(24)).success);
    assert.ok(!P.productionAssetsSchema.safeParse(many(25)).success);
  });
  it('tags run @image1 to @image24 with no gaps or repeats', () => {
    const labelled = P.labelProductionAssets(Array.from({ length: 24 }, (_, i) => asset(i + 1)));
    assert.deepEqual(labelled.map((a) => a.label), Array.from({ length: 24 }, (_, i) => `@image${i + 1}`));
    assert.ok(P.productionAssetSchema.safeParse({ ...asset(1), label: '@image24' }).success);
    assert.ok(!P.productionAssetSchema.safeParse({ ...asset(1), label: '@image25' }).success);
  });
});

describe('each shot sends only the references that fit it', () => {
  const library = P.labelProductionAssets([
    asset(1, { name: 'Ada face.jpg', role: 'character' }),
    asset(2, { name: 'Ada red coat.jpg', role: 'wardrobe' }),
    asset(3, { name: 'harbour at dawn.jpg', role: 'location' }),
    asset(4, { name: 'train platform rain.jpg', role: 'location' }),
    asset(5, { name: 'perfume bottle.jpg', role: 'product' }),
    asset(6, { name: 'city skyline sunset.jpg', role: 'location' }),
    asset(7, { name: 'warm tungsten.jpg', role: 'lighting' }),
    asset(8, { name: 'moodboard.mp4', role: 'location', mediaType: 'video' }),
    ...Array.from({ length: 7 }, (_, i) => asset(9 + i, { name: `extra ${i}.jpg` })),
  ]);
  const names = (list) => list.map((a) => a.name);

  it('never sends more than six, and only images', () => {
    const picked = P.selectShotReferences(library, 'Wide shot of everything at once');
    assert.ok(picked.length <= P.MAX_SHOT_REFERENCES);
    assert.ok(picked.every((a) => a.mediaType === 'image'));
  });
  it('puts images mentioned by tag first', () => {
    const picked = P.selectShotReferences(library, 'She waits on the platform, matching @image4 and the skyline in @image6');
    assert.deepEqual(names(picked).slice(0, 2).sort(), ['city skyline sunset.jpg', 'train platform rain.jpg']);
  });
  it('a tag means exactly that image: @image1 is not @image12', () => {
    const picked = P.selectShotReferences(library, 'Use @image12 only', 1);
    assert.equal(picked[0].label, '@image12');
  });
  it('then matches the shot’s words to reference names, then people and products', () => {
    const picked = P.selectShotReferences(library, 'Ada walks along the harbour in her red coat', 3);
    assert.deepEqual(names(picked), ['Ada red coat.jpg', 'Ada face.jpg', 'harbour at dawn.jpg']);
  });
  it('with nothing to go on, keeps the people and products, in the order they were added', () => {
    const picked = P.selectShotReferences(library, 'A quiet moment', 2);
    assert.deepEqual(names(picked), ['Ada face.jpg', 'perfume bottle.jpg']);
  });
  it('an empty library sends nothing', () => {
    assert.deepEqual(P.selectShotReferences([], 'anything'), []);
  });
});

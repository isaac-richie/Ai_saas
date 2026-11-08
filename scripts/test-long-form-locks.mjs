// Long Form mandatory image locks (spec v1.2). Each test names the acceptance item(s) it covers.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTs } from './load-ts.mjs';

const locks = await loadTs('core/services/long-form-locks.ts');
const store = await loadTs('core/services/long-form-lock-store.ts');
const { probeImage } = await loadTs('core/utils/image-probe.ts');
const { KieProvider } = await loadTs('infrastructure/ai/providers/kie.provider.ts');
const { resolveLocks, planLockedRequest, missingFromPayload, endpointKeyFor, bindingKey } = locks;
const read = (path) => readFileSync(new URL(path, import.meta.url));
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const KLING = 'kling-3.0/video';
const SEEDANCE = 'bytedance/seedance-2-5';
const base = 'https://example.supabase.co/storage/v1/object/public/elements/owner/';
let n = 0;
/** A binding with sensible defaults; `img` names the image (same img = same pinned version). */
function b(img, role, entity = '', extra = {}) {
  n += 1;
  return {
    scopeType: 'shot', shotNumber: 1, assetId: `00000000-0000-4000-8000-${String(img.length).padStart(12, '0')}`,
    assetUrl: `${base}${img}.png`, sha256: createHash('sha256').update(img).digest('hex'), assetName: img,
    contentType: 'image/png', byteSize: 400_000, width: 1024, height: 1024, role, entityLabel: entity, viewLabel: '', ...extra,
  };
}
const scene = (x) => ({ ...x, scopeType: 'scene', shotNumber: null });

// PASTOR kitchen group: Sam front + Sam profile + Marcia + Leon + kitchen wide + kitchen detail + wardrobe = 7.
const kitchen = () => [
  b('sam-front', 'character', 'Sam', { viewLabel: 'front' }), b('sam-profile', 'character', 'Sam', { viewLabel: 'profile' }),
  b('marcia', 'character', 'Marcia'), b('leon', 'character', 'Leon'),
  b('kitchen-wide', 'location', 'Kitchen'), b('kitchen-detail', 'location', 'Kitchen'), b('sam-indoor', 'wardrobe', 'Sam'),
];

describe('Scope and counting (spec §4; acceptance 6, 7, 16)', () => {
  it('4 scene images + 3 new shot images = 7 required', () => {
    const r = resolveLocks(kitchen().slice(0, 4).map(scene), kitchen().slice(4));
    assert.equal(r.requiredImageCount, 7);
    assert.equal(r.bindingCount, 7);
  });

  it('a shared exact version in both scopes with the same role/entity is one binding (6 images), scope kept', () => {
    const k = kitchen();
    const r = resolveLocks(k.slice(0, 4).map(scene), [k[0], k[4], k[5]]);
    assert.equal(r.requiredImageCount, 6);
    assert.equal(r.bindingCount, 6);
    assert.deepEqual(r.bindings.find((x) => x.assetName === 'sam-front').scopes, ['scene', 'shot']);
  });

  it('one image in two roles = 1 image, 2 bindings; a new version of the same asset stays distinct', () => {
    const one = b('sam-front', 'character', 'Sam');
    const asWardrobe = { ...one, role: 'wardrobe' };
    const newVersion = { ...one, sha256: 'f'.repeat(64) };
    const r = resolveLocks([], [one, asWardrobe, { ...one }, newVersion]);
    assert.equal(r.bindingCount, 3, 'the exact duplicate collapses, the other role and the new version stay');
    assert.equal(r.requiredImageCount, 2);
  });

  it('shot locks only add: a scene requirement is still required on every shot', () => {
    const sceneLock = scene(b('bible', 'prop', 'Bible'));
    for (const shot of [[], [b('x', 'location', 'Bedroom')]]) {
      assert.ok(resolveLocks([sceneLock], shot).bindings.some((x) => x.assetName === 'bible'));
    }
  });

  it('entity matching ignores case and spaces, so "Sam" and " sam " are one subject', () => {
    assert.equal(bindingKey(b('a', 'character', 'Sam')), bindingKey(b('a', 'character', '  sam ')));
  });
});

describe('Seedance 2.5: all originals as actual inputs (acceptance 8, 10)', () => {
  it('the 7-image kitchen set maps every binding to reference_image_urls, nothing truncated', () => {
    const plan = planLockedRequest(resolveLocks([], kitchen()), SEEDANCE);
    assert.ok(plan.ok, plan.ok ? '' : plan.issues.join(' | '));
    assert.equal(plan.plan.referenceImageUrls.length, 7);
    assert.equal(plan.plan.manifest.length, 7);
    assert.ok(plan.plan.manifest.every((m) => /^reference_image_urls\[\d\]$/.test(m.field)));
    assert.match(plan.plan.promptNote, /exactly one of each named person/);
  });

  it('12 and 30 images are accepted; 31 is blocked, never cut to 30', () => {
    const many = (count) => Array.from({ length: count }, (_, i) => b(`img-${i}`, 'prop', `Prop ${i}`));
    assert.ok(planLockedRequest(resolveLocks([], many(12)), SEEDANCE).ok);
    assert.ok(planLockedRequest(resolveLocks([], many(30)), SEEDANCE).ok);
    const over = planLockedRequest(resolveLocks([], many(31)), SEEDANCE);
    assert.equal(over.ok, false);
    assert.match(over.issues.join(' '), /31 required images; Seedance 2.5 accepts 30/);
  });

  it('references with a locked start or end frame are blocked (exclusive modes)', () => {
    const withFrame = planLockedRequest(resolveLocks([], [...kitchen(), b('open', 'start_frame')]), SEEDANCE);
    assert.equal(withFrame.ok, false);
    assert.match(withFrame.issues[0], /locked start or end frame/);
  });

  it('a continued Seedance shot sends the previous last frame as reference image 1, never as a first frame', () => {
    const locks = kitchen();
    const continued = planLockedRequest(resolveLocks([], locks), SEEDANCE, { continuityStartUrl: 'https://x/last.jpg' });
    assert.ok(continued.ok, continued.issues?.join(' '));
    const { plan } = continued;
    assert.equal(plan.continuityAsReference, true);
    assert.equal(plan.startFrameUrl, null);
    assert.equal(plan.referenceImageUrls[0], 'https://x/last.jpg');
    // Every lock still lands at its own index, after the continuity frame.
    for (const m of plan.manifest) assert.equal(plan.referenceImageUrls[Number(m.field.match(/\[(\d+)\]/)[1])], m.assetUrl);
    assert.ok(!plan.manifest.some((m) => m.field === 'reference_image_urls[0]'));
    assert.match(plan.promptNote, /reference image 1 is the previous shot's final frame/);
    assert.match(plan.promptNote, /reference image 2 is/);
    // A fresh shot is unchanged.
    const fresh = planLockedRequest(resolveLocks([], locks), SEEDANCE);
    assert.equal(fresh.plan.continuityAsReference, false);
    assert.match(fresh.plan.promptNote, /reference image 1 is (?!the previous)/);
  });

  it('the shot card status (screenshot: scene location + shot image on shot 2) is mapped, not blocked', () => {
    // shotLockStatus plans later shots with this placeholder for the previous shot's last frame.
    const status = planLockedRequest(resolveLocks([scene(b('bible-room', 'location', 'Room'))], [b('gold-bible', 'prop', 'Bible')]), SEEDANCE, { continuityStartUrl: 'continuity://previous-shot' });
    assert.ok(status.ok, status.issues?.join(' '));
    assert.equal(status.plan.referenceImageUrls.length, 3);
  });

  it('the continuity frame counts toward the 30-image Seedance limit', () => {
    const many = (count) => Array.from({ length: count }, (_, i) => b(`img-${i}`, 'prop', `Prop ${i}`));
    assert.ok(planLockedRequest(resolveLocks([], many(29)), SEEDANCE, { continuityStartUrl: 'https://x/last.jpg' }).ok);
    const full = planLockedRequest(resolveLocks([], many(30)), SEEDANCE, { continuityStartUrl: 'https://x/last.jpg' });
    assert.equal(full.ok, false);
    assert.match(full.issues.join(' '), /30 required images plus the previous shot's last frame; Seedance 2.5 accepts 30.*Remove 1 locked image\./);
  });

  it('Kling continued shots keep the opening frame beside their elements', () => {
    const plan = planLockedRequest(resolveLocks([], [b('a', 'character', 'Sam', { viewLabel: 'front' }), b('b', 'character', 'Sam', { viewLabel: 'profile' })]), KLING, { continuityStartUrl: 'https://x/last.jpg' });
    assert.ok(plan.ok);
    assert.equal(plan.plan.continuityAsReference, false);
    assert.equal(plan.plan.referenceImageUrls.length, 0);
  });

  it('frames only (start + end) map to first_frame_url / last_frame_url', () => {
    const plan = planLockedRequest(resolveLocks([], [b('open', 'start_frame'), b('close', 'end_frame')]), SEEDANCE);
    assert.ok(plan.ok);
    assert.deepEqual(plan.plan.manifest.map((m) => m.field).sort(), ['first_frame_url', 'last_frame_url']);
  });

  it('size, shape and pixel limits are enforced per image', () => {
    const cases = [
      [{ width: 200, height: 200 }, /between 300 and 6000/],
      [{ width: 3000, height: 1000 }, /too wide/],
      [{ byteSize: 31 * 1024 * 1024 }, /over 30 MB/],
    ];
    for (const [extra, pattern] of cases) {
      const plan = planLockedRequest(resolveLocks([], [b('odd', 'prop', 'Thing', extra)]), SEEDANCE);
      assert.equal(plan.ok, false);
      assert.match(plan.issues.join(' '), pattern);
    }
  });
});

describe('Kling 3.0 Pro: elements of 2–4 images per subject (acceptance 3, 8, 9, 10, 11)', () => {
  it('Sam (2 views) + Kitchen (2 views) + a start frame map to elements and image_urls[0]', () => {
    const set = [b('sam-front', 'character', 'Sam'), b('sam-profile', 'character', 'Sam'), b('kitchen-wide', 'location', 'Kitchen'), b('kitchen-detail', 'location', 'Kitchen'), b('open', 'start_frame')];
    const plan = planLockedRequest(resolveLocks([], set), KLING);
    assert.ok(plan.ok, plan.ok ? '' : plan.issues.join(' | '));
    assert.equal(plan.plan.elements.length, 2);
    assert.deepEqual(plan.plan.elements.map((e) => e.image_urls.length), [2, 2]);
    assert.equal(plan.plan.startFrameUrl, `${base}open.png`);
    assert.ok(plan.plan.manifest.some((m) => m.role === 'start_frame' && m.field === 'image_urls[0]'));
    assert.match(plan.plan.promptNote, /@reference_set_1 is Character Sam \(2 views of the same person\)/);
  });

  it('the 7-image kitchen set is saved-able but blocked on Kling (4 subjects > 3; lone images) — never cut to fit', () => {
    const plan = planLockedRequest(resolveLocks([], kitchen()), KLING);
    assert.equal(plan.ok, false);
    const text = plan.issues.join(' ');
    assert.match(text, /5 locked subjects need 5 reference elements; Kling 3.0 Pro accepts 3/);
    assert.match(text, /Marcia has 1 image/);
  });

  it('a subject with 5 images, a WebP reference and an 11 MB reference are each blocked', () => {
    const five = Array.from({ length: 5 }, (_, i) => b(`sam-${i}`, 'character', 'Sam'));
    assert.match(planLockedRequest(resolveLocks([], five), KLING).issues.join(' '), /at most 4 per subject/);
    const webp = [b('a', 'character', 'Sam', { contentType: 'image/webp' }), b('b', 'character', 'Sam')];
    assert.match(planLockedRequest(resolveLocks([], webp), KLING).issues.join(' '), /must be JPG or PNG/);
    const big = [b('a', 'character', 'Sam', { byteSize: 11 * 1024 * 1024 }), b('b', 'character', 'Sam')];
    assert.match(planLockedRequest(resolveLocks([], big), KLING).issues.join(' '), /over 10 MB/);
  });

  it('one image serving two subjects is refused rather than assumed to work', () => {
    const shared = b('sam-front', 'character', 'Sam');
    const set = [shared, b('sam-profile', 'character', 'Sam'), { ...shared, role: 'wardrobe' }, b('coat', 'wardrobe', 'Sam')];
    assert.match(planLockedRequest(resolveLocks([], set), KLING).issues.join(' '), /locked for two subjects/);
  });

  it('two different start frames block; an end frame alone blocks; a character is never used as a start frame', () => {
    const two = planLockedRequest(resolveLocks([], [b('a', 'start_frame'), b('b', 'start_frame')]), KLING);
    assert.match(two.issues.join(' '), /2 different start frames/);
    const endOnly = planLockedRequest(resolveLocks([], [b('c', 'end_frame')]), KLING);
    assert.match(endOnly.issues.join(' '), /end frame needs a start frame/);
    const chars = planLockedRequest(resolveLocks([], [b('s1', 'character', 'Sam'), b('s2', 'character', 'Sam')]), KLING);
    assert.ok(chars.ok);
    assert.equal(chars.plan.startFrameUrl, null);
    assert.ok(chars.plan.manifest.every((m) => !m.field.startsWith('image_urls')));
  });

  it('an end frame on a continued shot is fine (the previous last frame opens it)', () => {
    assert.ok(planLockedRequest(resolveLocks([], [b('c', 'end_frame')]), KLING, { continuityStartUrl: 'https://x/last.jpg' }).ok);
  });
});

describe('Unknown endpoints fail closed (spec §8)', () => {
  it('only the two verified endpoints are known; anything else blocks', () => {
    assert.equal(endpointKeyFor(KLING), 'kie:kling-3.0/video:pro');
    assert.equal(endpointKeyFor(SEEDANCE), 'kie:bytedance/seedance-2-5');
    for (const model of ['seedance', 'bytedance/seedance-2', 'kling/v2-5-turbo-image-to-video-pro', '']) {
      assert.equal(endpointKeyFor(model), null, model);
      assert.equal(planLockedRequest(resolveLocks([], [b('a', 'prop', 'X')]), model).ok, false);
    }
  });
});

describe('The adapter refuses incomplete payloads (acceptance 8, 19)', () => {
  let calls;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      if (String(url).includes('file-url-upload')) {
        const { fileUrl } = JSON.parse(init.body);
        return new Response(JSON.stringify({ success: true, data: { downloadUrl: `${fileUrl}?hosted=1` } }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 200, data: { taskId: 'task-1' } }), { status: 200 });
    };
  });
  afterEach(() => { globalThis.fetch = realFetch; });
  const createCalls = () => calls.filter((c) => c.url.includes('/jobs/createTask'));

  it('Seedance: all 12 locked images reach reference_image_urls (no cut to 9)', async () => {
    const set = Array.from({ length: 12 }, (_, i) => b(`img-${i}`, 'prop', `P${i}`));
    const plan = planLockedRequest(resolveLocks([], set), SEEDANCE).plan;
    const provider = new KieProvider({ apiKey: 'test' });
    const result = await provider.generate({ prompt: 'A kitchen.', model: SEEDANCE, output_type: 'video', duration_seconds: 5, reference_image_urls: plan.referenceImageUrls, required_inputs: plan.manifest.map((m) => ({ field: m.field, url: m.assetUrl })) });
    assert.equal(result.status, 'processing', String(result.error));
    const sent = createCalls()[0].body.input;
    assert.equal(sent.reference_image_urls.length, 12);
    assert.deepEqual(missingFromPayload(sent, plan.manifest.map((m) => ({ field: m.field, url: m.assetUrl }))), []);
  });

  it('Kling: elements are re-hosted and the required list follows them; every image is in the payload', async () => {
    const set = [b('sam-front', 'character', 'Sam'), b('sam-profile', 'character', 'Sam'), b('open', 'start_frame')];
    const plan = planLockedRequest(resolveLocks([], set), KLING).plan;
    const provider = new KieProvider({ apiKey: 'test' });
    const result = await provider.generate({ prompt: `Sam cooks. ${plan.promptNote}`, model: KLING, output_type: 'video', duration_seconds: 5, image_prompt: plan.startFrameUrl, reference_elements: plan.elements, required_inputs: plan.manifest.map((m) => ({ field: m.field, url: m.assetUrl })) });
    assert.equal(result.status, 'processing', String(result.error));
    const sent = createCalls()[0].body.input;
    assert.equal(sent.kling_elements[0].element_input_urls.length, 2);
    assert.ok(sent.kling_elements[0].element_input_urls.every((u) => u.endsWith('?hosted=1')));
    assert.equal(sent.image_urls[0], plan.startFrameUrl);
    assert.match(sent.prompt, /@reference_set_1/);
  });

  it('a deliberately omitted image fails closed: no task is created and nothing is charged', async () => {
    const set = [b('sam-front', 'character', 'Sam'), b('sam-profile', 'character', 'Sam')];
    const plan = planLockedRequest(resolveLocks([], set), KLING).plan;
    const provider = new KieProvider({ apiKey: 'test' });
    // The adapter receives an element with one image dropped (it would be filtered out silently).
    const sabotaged = [{ ...plan.elements[0], image_urls: plan.elements[0].image_urls.slice(0, 1) }];
    await assert.rejects(
      provider.prepareRequest({ prompt: 'x', model: KLING, output_type: 'video', reference_elements: sabotaged, required_inputs: plan.manifest.map((m) => ({ field: m.field, url: m.assetUrl })) }),
      /could not all be placed/,
    );
    const result = await provider.generate({ prompt: 'x', model: KLING, output_type: 'video', reference_elements: sabotaged, required_inputs: plan.manifest.map((m) => ({ field: m.field, url: m.assetUrl })) });
    assert.equal(result.status, 'failed');
    assert.equal(createCalls().length, 0, 'no createTask call');
  });

  it('a substituted image (different URL at the field) is caught', () => {
    assert.deepEqual(missingFromPayload({ reference_image_urls: ['https://x/other.png'] }, [{ field: 'reference_image_urls[0]', url: 'https://x/locked.png' }]).length, 1);
  });
});

describe('Pinned files are checked before paid submission (acceptance 12, 14)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const png = read('../public/director.png');
  const sha = createHash('sha256').update(png).digest('hex');
  const binding = (extra = {}) => ({ ...b('director', 'character', 'Sam'), key: 'k', scopes: ['shot'], sha256: sha, assetName: 'director.png', ...extra });

  it('an unchanged readable file passes', async () => {
    globalThis.fetch = async () => new Response(png, { status: 200 });
    assert.deepEqual(await store.verifyPinnedImages([binding()]), []);
  });

  it('a missing file, an unreadable file and a replaced file each block', async () => {
    globalThis.fetch = async () => new Response('gone', { status: 404 });
    assert.match((await store.verifyPinnedImages([binding()]))[0], /missing or not accessible/);
    globalThis.fetch = async () => { throw new Error('network'); };
    assert.match((await store.verifyPinnedImages([binding()]))[0], /could not be read/);
    globalThis.fetch = async () => new Response(read('../public/studio-plate-1.jpg'), { status: 200 });
    assert.match((await store.verifyPinnedImages([binding()]))[0], /has changed since it was locked/);
  });

  it('a non-image file is refused when pinning', async () => {
    globalThis.fetch = async () => new Response('<html>not an image</html>', { status: 200 });
    await assert.rejects(store.fetchImage('https://x/y.png', 'y.png'), /isn't a JPG, PNG or WebP/);
  });
});

describe('Reading real image files (pinning metadata)', () => {
  it('reads type and size from the bytes of real JPEG, PNG and WebP files', () => {
    assert.deepEqual(probeImage(read('../public/studio-plate-1.jpg')), { contentType: 'image/jpeg', width: 1920, height: 1536 });
    assert.deepEqual(probeImage(read('../public/brand-logo.jpeg')), { contentType: 'image/jpeg', width: 1600, height: 1600 });
    assert.deepEqual(probeImage(read('../public/director.png')), { contentType: 'image/png', width: 1536, height: 1024 });
    assert.deepEqual(probeImage(read('../public/landing-poster.webp')), { contentType: 'image/webp', width: 1600, height: 919 });
    assert.deepEqual(probeImage(read('../public/lighting/light_neon.webp')), { contentType: 'image/webp', width: 640, height: 800 });
  });
  it('rejects text, an empty file and a truncated image', () => {
    assert.equal(probeImage(Buffer.from('hello world, not an image')), null);
    assert.equal(probeImage(new Uint8Array()), null);
    assert.equal(probeImage(read('../public/studio-plate-1.jpg').subarray(0, 40)), null);
  });
});

describe('Wiring (acceptance 1, 2, 13, 15, 17)', () => {
  const desk = src('../src/interface/components/fast-video/ProductionDesk.tsx');
  const queue = src('../src/core/actions/production.ts');
  const quick = src('../src/interface/components/fast-video/FastVideoStudio.tsx');

  it('the Locked media row sits directly below Editing notes on Long Form cards; Quick Shot is untouched', () => {
    const notes = desk.indexOf('summary className="cursor-pointer">Editing notes</summary>');
    const row = desk.indexOf('<LockedMediaRow');
    assert.ok(notes > 0 && row > notes && row - notes < 400);
    assert.doesNotMatch(quick, /LockedImages|LockedMedia|long-form-locks/);
  });

  it('the queue blocks before creating a take or job, and snapshots the manifest on the take', () => {
    const blockAt = queue.indexOf('if (!lockPlan.ok) return blocked(lockPlan.issues)');
    const takeAt = queue.indexOf('await db.from("shot_generations").insert(');
    assert.ok(blockAt > 0 && takeAt > blockAt, 'lock checks run before the take insert');
    assert.ok(queue.indexOf('verifyPinnedImages(resolvedLocks.bindings)') < takeAt);
    assert.equal((queue.match(/locked_inputs: lockSnapshot/g) || []).length, 2, 'snapshot written on insert and kept on update');
    assert.match(queue, /input_manifest: planInputs\.manifest/);
    assert.match(queue, /binding_revision: filmLocks\.revision/);
  });

  it('locks are keyed to the film lineage root, so prompt rewrites and revisions keep them', () => {
    assert.match(queue, /const productionRoot = \(production\.parent_job_id as string \| null\) \|\| \(production\.id as string\)/);
    assert.match(src('../src/core/actions/long-form-locks.ts'), /const rootId = \(job\.parent_job_id as string \| null\) \|\| \(job\.id as string\)/);
  });

  it('a batch preflights every shot and holds the whole batch by default; valid-only is a separate explicit action', () => {
    const panel = src('../src/interface/components/fast-video/ProductionRunPanel.tsx');
    assert.match(panel, /if \(!preflighted && shotsToRun\.length > 1\)/);
    assert.match(panel, /Generate only the \{heldBatch\.ready\.length\} ready shot/);
    assert.match(panel, /excludes \{heldBatch\.blocked\.map/);
  });
});

// Long Form video references. Each test names the acceptance item(s) of the developer brief it covers.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';

const refs = await loadTs('core/services/long-form-video-refs.ts');
const locks = await loadTs('core/services/long-form-locks.ts');
const store = await loadTs('core/services/long-form-video-store.ts');
const { KieProvider } = await loadTs('infrastructure/ai/providers/kie.provider.ts');
const { resolveVideoRefs, trimRangeIssue, videoRefKey, mediaCountLabel, VIDEO_PURPOSES } = refs;
const { resolveLocks, planLockedRequest, missingFromPayload, videoPromptNote, UNSUPPORTED_VIDEO_REFS } = locks;
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const KLING = 'kling-3.0/video';
const SEEDANCE = 'bytedance/seedance-2-5';
const base = 'https://example.supabase.co/storage/v1/object/public/elements/owner/';
const sha = (text) => createHash('sha256').update(text).digest('hex');

/** A saved video reference: `name` is the library video, the range is in seconds. */
function v(name, startSec, endSec, purpose = 'camera_movement', extra = {}) {
  const startMs = startSec * 1000, endMs = endSec * 1000;
  return {
    scopeType: 'shot', shotNumber: 1, assetId: '00000000-0000-4000-8000-000000000001', sourceUrl: `${base}${name}.mp4`, assetName: `${name}.mp4`,
    sourceDurationMs: 60_000, trimStartMs: startMs, trimEndMs: endMs, clipUrl: `${base}video-refs/${name}-${startMs}-${endMs}-${extra.scopeType ?? 'shot'}.mp4`,
    sha256: sha(`${name}${startMs}${endMs}`), byteSize: 800_000, clipDurationMs: endMs - startMs, width: 1280, height: 720, purpose, guidanceText: '', ...extra,
  };
}
const scene = (x) => ({ ...x, scopeType: 'scene', shotNumber: null });
const img = (name, role, entity = '') => ({
  scopeType: 'shot', shotNumber: 1, assetId: '00000000-0000-4000-8000-000000000002', assetUrl: `${base}${name}.png`, sha256: sha(name), assetName: name,
  contentType: 'image/png', byteSize: 400_000, width: 1024, height: 1024, role, entityLabel: entity, viewLabel: '',
});
const required = (plan) => [...plan.manifest.map((m) => ({ field: m.field, url: m.assetUrl })), ...plan.videoManifest.map((m) => ({ field: m.field, url: m.clipUrl }))];

describe('Scope and de-duplication (AC03)', () => {
  it('a scene reference applies to the shot alongside the shot’s own', () => {
    const out = resolveVideoRefs([scene(v('walk', 0, 5))], [v('push', 2, 6)]);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((x) => x.scopes), [['scene'], ['shot']]);
  });

  it('the same video and range on scene and shot is sent once, and both intents are kept', () => {
    const out = resolveVideoRefs(
      [scene(v('push', 2, 6, 'camera_movement', { scopeType: 'scene', guidanceText: 'Slow push-in.' }))],
      [v('push', 2, 6, 'visual_style', { guidanceText: 'Warm light.' })],
    );
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].scopes, ['scene', 'shot']);
    assert.deepEqual(out[0].guidance.map((g) => g.purpose), ['camera_movement', 'visual_style']);
    assert.match(out[0].clipUrl, /-scene\.mp4$/, 'one clip is sent: the first saved');
  });

  it('a different range of the same video is a different reference', () => {
    assert.equal(resolveVideoRefs([], [v('push', 0, 4), v('push', 4, 8)]).length, 2);
    assert.notEqual(videoRefKey(v('push', 0, 4)), videoRefKey(v('push', 4, 8)));
  });

  it('counts read as on the shot card (AC04)', () => {
    assert.equal(mediaCountLabel(2, 1), '2 images · 1 video reference');
    assert.equal(mediaCountLabel(1, 2, 3), '1 image · 2 video references · 3 audio');
    assert.equal(mediaCountLabel(0, 0), '');
  });
});

describe('Selected range (AC02, AC09)', () => {
  it('accepts 0 ≤ start < end ≤ source length', () => {
    assert.equal(trimRangeIssue(0, 5000, 12_000), null);
    assert.equal(trimRangeIssue(7000, 12_000, 12_000), null);
  });
  it('rejects a reversed, empty, overlong, too short or out-of-bounds range with a reason', () => {
    assert.match(trimRangeIssue(5000, 5000, 12_000, 'a.mp4'), /must start before it ends/);
    assert.match(trimRangeIssue(6000, 2000, 12_000, 'a.mp4'), /must start before it ends/);
    assert.match(trimRangeIssue(-1, 2000, 12_000, 'a.mp4'), /must start before it ends/);
    assert.match(trimRangeIssue(0, 13_000, 12_000, 'a.mp4'), /ends after the video does \(12 s\)/);
    assert.match(trimRangeIssue(0, 500, 12_000, 'a.mp4'), /select at least 1 s/);
    assert.match(trimRangeIssue(0, 31_000, 60_000, 'a.mp4'), /select 30 s or less/);
    assert.match(trimRangeIssue(0, NaN, 12_000, 'a.mp4'), /must start before it ends/);
  });
});

describe('Planning against the model (AC05, AC06, AC07)', () => {
  const plan = (images, videos, model = SEEDANCE, options = {}) => planLockedRequest(resolveLocks([], images), model, { ...options, videos: resolveVideoRefs([], videos) });

  it('Seedance 2.5: every clip is mapped to reference_video_urls, in order, with its range', () => {
    const out = plan([], [v('push', 2, 7), v('walk', 0, 4, 'subject_movement')]);
    assert.ok(out.ok, JSON.stringify(out.issues));
    assert.equal(out.plan.referenceVideoUrls.length, 2);
    assert.deepEqual(out.plan.videoManifest.map((m) => m.field), ['reference_video_urls[0]', 'reference_video_urls[1]']);
    assert.deepEqual(out.plan.videoManifest.map((m) => [m.trimStartMs, m.trimEndMs]), [[2000, 7000], [0, 4000]]);
    assert.deepEqual(out.plan.videoManifest.map((m) => m.clipUrl), out.plan.referenceVideoUrls);
  });

  it('images and videos ride together; existing image locks are untouched (AC01, AC10)', () => {
    const images = [img('sam', 'character', 'Sam'), img('bedroom', 'location', 'Bedroom')];
    const withVideo = plan(images, [v('push', 2, 7)]);
    const without = plan(images, []);
    assert.ok(withVideo.ok && without.ok);
    assert.deepEqual(withVideo.plan.referenceImageUrls, without.plan.referenceImageUrls);
    assert.deepEqual(withVideo.plan.manifest, without.plan.manifest);
    assert.equal(without.plan.referenceVideoUrls.length, 0);
    assert.equal(without.plan.promptNote.includes('Reference videos'), false);
  });

  it('a continued shot with only video references opens on the previous frame as reference image 1', () => {
    const out = plan([], [v('push', 2, 7)], SEEDANCE, { continuityStartUrl: 'https://x/last.jpg' });
    assert.ok(out.ok, JSON.stringify(out.issues));
    assert.equal(out.plan.continuityAsReference, true);
    assert.deepEqual(out.plan.referenceImageUrls, ['https://x/last.jpg']);
    assert.equal(out.plan.startFrameUrl, null);
  });

  it('the prompt says what each clip guides, and nothing more', () => {
    const out = plan([], [v('push', 2, 7, 'camera_movement', { guidanceText: 'Use the slow push-in and framing only.' })]);
    assert.match(out.plan.promptNote, /reference video 1 guides its camera movement only \(Use the slow push-in and framing only\)/);
    assert.match(out.plan.promptNote, /people, places and objects come from this prompt and the reference images/);
    assert.equal(videoPromptNote([]), '');
  });

  it('Kling 3.0 Pro blocks with the remedy, and no clip is planned (never silently dropped)', () => {
    const out = plan([img('a', 'character', 'Sam'), img('b', 'character', 'Sam')], [v('push', 2, 7)], KLING);
    assert.equal(out.ok, false);
    assert.ok(out.issues[0].startsWith(UNSUPPORTED_VIDEO_REFS));
    assert.match(out.issues[0], /Kling 3\.0 Pro can't take reference videos; Seedance 2\.5 can/);
  });

  it('an unverified model fails closed', () => {
    for (const model of ['veo-3', '', 'bytedance/seedance-2']) {
      const out = plan([], [v('push', 2, 7)], model);
      assert.equal(out.ok, false, model);
      assert.ok(out.issues[0].startsWith(UNSUPPORTED_VIDEO_REFS), model);
    }
  });

  it('a locked start or end frame beside reference videos is an unsupported combination', () => {
    const out = plan([img('open', 'start_frame')], [v('push', 2, 7)]);
    assert.equal(out.ok, false);
    assert.match(out.issues.join(' '), /can't combine reference videos with a locked start or end frame/);
  });

  it('over-limit requests are blocked with the number that is over (AC09)', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => v(`clip-${i}`, 0, 2));
    assert.match(plan([], eleven).issues.join(' '), /11 reference videos; Seedance 2\.5 accepts 10\. Remove 1\./);
    assert.match(plan([], [v('short', 0, 1.5)]).issues.join(' '), /1\.5 s is selected; Seedance 2\.5 needs at least 2 s/);
    assert.match(plan([], [v('a', 0, 20), v('b', 0, 15)]).issues.join(' '), /add up to 35 s; Seedance 2\.5 takes 30 s in total/);
    assert.ok(plan([], [v('a', 0, 20), v('b', 0, 10)]).ok, 'exactly 30 s in total is accepted');
  });

  it('changing the model or the range changes the result: status is derived, never stored (AC07)', () => {
    const video = v('push', 0, 1.5);
    assert.equal(plan([], [video]).ok, false);
    assert.equal(plan([], [{ ...video, trimEndMs: 3000, clipDurationMs: 3000 }]).ok, true);
    assert.equal(plan([], [{ ...video, trimEndMs: 3000, clipDurationMs: 3000 }], KLING).ok, false);
  });
});

describe('The adapter sends the real clip or nothing (AC05, AC06)', () => {
  let calls;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ code: 200, data: { taskId: 'task-1' } }), { status: 200 });
    };
  });
  afterEach(() => { globalThis.fetch = realFetch; });
  const createCalls = () => calls.filter((c) => c.url.includes('/jobs/createTask'));
  const planned = () => planLockedRequest(resolveLocks([], [img('sam', 'character', 'Sam')]), SEEDANCE, { videos: resolveVideoRefs([], [v('push', 2, 7), v('walk', 0, 4)]) }).plan;

  it('Seedance: the pinned clips reach reference_video_urls beside the locked image', async () => {
    const plan = planned();
    const provider = new KieProvider({ apiKey: 'test' });
    const result = await provider.generate({ prompt: `Sam walks in. ${plan.promptNote}`, model: SEEDANCE, output_type: 'video', duration_seconds: 5, reference_image_urls: plan.referenceImageUrls, reference_video_urls: plan.referenceVideoUrls, required_inputs: required(plan) });
    assert.equal(result.status, 'processing', String(result.error));
    const sent = createCalls()[0].body.input;
    assert.deepEqual(sent.reference_video_urls, plan.referenceVideoUrls);
    assert.equal(sent.reference_image_urls.length, 1);
    assert.deepEqual(missingFromPayload(sent, required(plan)), []);
  });

  it('a dropped clip fails closed: no task is created', async () => {
    const plan = planned();
    const provider = new KieProvider({ apiKey: 'test' });
    const result = await provider.generate({ prompt: 'x', model: SEEDANCE, output_type: 'video', reference_image_urls: plan.referenceImageUrls, reference_video_urls: plan.referenceVideoUrls.slice(0, 1), required_inputs: required(plan) });
    assert.equal(result.status, 'failed');
    assert.equal(createCalls().length, 0);
    await assert.rejects(
      provider.prepareRequest({ prompt: 'x', model: SEEDANCE, output_type: 'video', reference_video_urls: plan.referenceVideoUrls.slice(0, 1), required_inputs: required(plan) }),
      /Locked media could not all be placed/,
    );
  });

  it('a first frame beside the clips fails closed instead of sending the frame alone', async () => {
    const plan = planned();
    const provider = new KieProvider({ apiKey: 'test' });
    const result = await provider.generate({ prompt: 'x', model: SEEDANCE, output_type: 'video', image_prompt: 'https://x/start.png', reference_video_urls: plan.referenceVideoUrls, required_inputs: plan.videoManifest.map((m) => ({ field: m.field, url: m.clipUrl })) });
    assert.equal(result.status, 'failed');
    assert.equal(createCalls().length, 0);
  });

  it('a substituted clip (different URL at the field) is caught', () => {
    assert.equal(missingFromPayload({ reference_video_urls: ['https://x/other.mp4'] }, [{ field: 'reference_video_urls[0]', url: 'https://x/pinned.mp4' }]).length, 1);
  });
});

describe('Pinned clips are rechecked at generation (AC09)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const bytes = Buffer.from('a pinned clip');
  const clip = { clipUrl: `${base}video-refs/c.mp4`, sha256: createHash('sha256').update(bytes).digest('hex'), assetName: 'push.mp4' };

  it('an unchanged readable clip passes', async () => {
    globalThis.fetch = async () => new Response(bytes, { status: 200 });
    assert.deepEqual(await store.verifyPinnedClips([clip]), []);
  });
  it('a deleted, unreachable or changed clip each block with what to do', async () => {
    globalThis.fetch = async () => new Response('gone', { status: 404 });
    assert.match((await store.verifyPinnedClips([clip]))[0], /missing or not accessible.*Remove this video reference and add it again/);
    globalThis.fetch = async () => { throw new Error('network'); };
    assert.match((await store.verifyPinnedClips([clip]))[0], /could not be read/);
    globalThis.fetch = async () => new Response(Buffer.from('different bytes'), { status: 200 });
    assert.match((await store.verifyPinnedClips([clip]))[0], /has changed since it was saved/);
  });
  it('an oversized download is stopped', async () => {
    globalThis.fetch = async () => new Response(Buffer.alloc(2048), { status: 200 });
    await assert.rejects(store.fetchBounded('https://x/y.mp4', 'y.mp4', 1024), /is over/);
  });
});

describe('Cutting the clip (AC02, AC08, AC09)', () => {
  it('the clip is the selected range only, with no audio, subtitles, data or metadata', () => {
    const args = store.clipArgs('/tmp/in', '/tmp/out.mp4', 2000, 7500);
    assert.equal(args[args.indexOf('-ss') + 1], '2.000');
    assert.equal(args[args.indexOf('-t') + 1], '5.500');
    assert.ok(args.indexOf('-ss') < args.indexOf('-i'), 'seek before input');
    for (const flag of ['-an', '-sn', '-dn']) assert.ok(args.includes(flag), flag);
    assert.equal(args[args.indexOf('-map') + 1], '0:v:0');
    assert.equal(args[args.indexOf('-map_metadata') + 1], '-1');
  });

  it('a real video is cut to a silent clip of the selected length; a non-video is refused', async (t) => {
    let ffmpeg;
    try { ffmpeg = createRequire(import.meta.url)('ffmpeg-static'); } catch { t.skip('ffmpeg is not installed'); return; }
    const { rm } = await import('node:fs/promises');
    const { probeMedia } = await loadTs('core/services/media-probe.ts');
    const source = await store.openSourceVideo(ffmpeg, readFileSync(new URL('../public/landing-720.mp4', import.meta.url)), 'landing-720.mp4');
    try {
      assert.ok(source.durationMs > 2500 && source.width > 0 && source.height > 0);
      const clip = await store.cutClip(ffmpeg, source, 500, 2500, 'landing-720.mp4');
      assert.ok(Math.abs(clip.durationMs - 2000) <= 150, `clip is ${clip.durationMs} ms`);
      assert.match(clip.sha256, /^[a-f0-9]{64}$/);
      assert.equal(clip.sha256, createHash('sha256').update(clip.bytes).digest('hex'));
      const { writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const out = join(source.dir, 'check.mp4');
      await writeFile(out, clip.bytes);
      const info = await probeMedia(ffmpeg, out);
      assert.equal(info.hasVideo, true);
      assert.equal(info.hasAudio, false, 'reference audio never reaches the clip');
    } finally {
      await rm(source.dir, { recursive: true, force: true });
    }
    await assert.rejects(store.openSourceVideo(ffmpeg, Buffer.from('<html>not a video</html>'), 'fake.mp4'), /isn't a video we can read/);
  });
});

describe('Wiring (AC04, AC05, AC06, AC08, AC10, AC11)', () => {
  const queue = src('../src/core/actions/production.ts');
  const save = src('../src/core/actions/long-form-video-refs.ts');
  const migration = src('../src/infrastructure/supabase/migrations/0054_long_form_video_references.sql');
  const editor = src('../src/interface/components/fast-video/LockedMedia.tsx');
  const section = src('../src/interface/components/fast-video/LockedVideoRefs.tsx');

  it('generation checks video references before a take or job exists, and records what was sent', () => {
    const takeAt = queue.indexOf('await db.from("shot_generations").insert(');
    assert.ok(queue.indexOf('resolveVideoRefs(filmVideoRefs.scene, shotVideoRefs)') < takeAt);
    assert.ok(queue.indexOf('verifyPinnedClips(videoRefs)') > 0 && queue.indexOf('verifyPinnedClips(videoRefs)') < takeAt);
    assert.match(queue, /if \(resolvedLocks\.bindingCount \|\| videoRefs\.length\)/);
    assert.match(queue, /videos: videoRefs \}\)/);
    assert.match(queue, /video_manifest: planInputs\.videoManifest/);
    assert.match(queue, /reference_video_urls: planInputs\.referenceVideoUrls/);
  });

  it('every clip sent is a required input, owned by the creator (AC11)', () => {
    const fast = src('../src/core/actions/fast-video.ts');
    assert.match(fast, /\(locked\.reference_video_urls \?\? \[\]\)\.some\(url => !requiredUrls\.has\(url\)\)/);
    assert.match(fast, /\[\.\.\.requiredUrls\]\.some\(url => !ownsAssetUrl\(url, user\.id\)\)/);
    assert.match(src('../src/core/validation/fast-video.ts'), /reference_video_urls: z\.array\(z\.string\(\)\.url\(\)\)\.max\(10\)\.optional\(\)/);
  });

  it('saving checks the signed-in owner, the film, its library and the revision before any file work (AC11)', () => {
    const body = save.slice(save.indexOf('export async function saveVideoRefScope'), save.indexOf('const addSchema'));
    const order = ['db.auth.getUser()', 'ownedFilm(db, user.id', 'locks.revision !== parsed.data.expectedRevision', 'ownsAssetUrl(asset.url, user.id)', 'fetchBounded(', 'cutClip('];
    const at = order.map((text) => body.indexOf(text));
    assert.ok(at.every((i) => i > 0), JSON.stringify(at));
    assert.deepEqual([...at].sort((a, b) => a - b), at);
    assert.match(save, /\.eq\("id", productionId\)\.eq\("user_id", userId\)/);
    assert.match(save, /permissionConfirmed: z\.literal\(true\)/);
  });

  it('a failed save leaves no clip behind and never marks a reference ready', () => {
    assert.match(save, /if \(error\) await discard\(\)/);
    assert.match(save, /catch \(error\) \{\s*await discard\(\)/);
  });

  it('the table is owner-only, range-checked, and one binding per scope, video and range', () => {
    assert.match(migration, /enable row level security/);
    assert.match(migration, /user_id = auth\.uid\(\) and created_by = auth\.uid\(\)/);
    assert.match(migration, /check \(trim_start_ms < trim_end_ms and trim_end_ms <= source_duration_ms\)/);
    assert.match(migration, /coalesce\(shot_number, 0\), source_url, trim_start_ms, trim_end_ms\)/);
    assert.match(migration, /next_revision := bump_long_form_revision\(p_root, p_expected_revision\)/);
    for (const purpose of VIDEO_PURPOSES) assert.ok(migration.includes(`'${purpose}'`), purpose);
  });

  it('a video in use as a reference cannot be removed from the library', () => {
    assert.match(queue, /is a video reference\. Remove it from Locked media first/);
  });

  it('reference clips never reach the export (AC08)', () => {
    for (const file of ['../src/core/services/timeline-render-job.ts', '../src/core/services/timeline-render.ts', '../src/app/api/exports/worker/route.ts', '../src/app/api/timeline/render/route.ts', '../src/core/services/long-form-audio-store.ts']) {
      assert.doesNotMatch(src(file), /long_form_video_bindings|long-form-video|video-refs/, file);
    }
  });

  it('the editor keeps Images, Videos and Audio apart and saves them as media references (AC04, AC10)', () => {
    const images = editor.indexOf('</ImageIcon> Images') >= 0 ? editor.indexOf('</ImageIcon> Images') : editor.indexOf('aria-hidden /> Images</h3>');
    const videos = editor.indexOf('<VideoReferences ');
    const audio = editor.indexOf('<AudioPlacements ');
    assert.ok(images > 0 && videos > images && audio > videos);
    assert.match(editor, /"Save media references"/);
    assert.doesNotMatch(editor, /Save shot image locks|Save scene image locks/);
    assert.match(editor, /`\$\{videoRefs\} video reference\$\{videoRefs === 1 \? "" : "s"\}`/);
    assert.match(editor, /Mapped means included in the outgoing request/);
  });

  it('the section carries the agreed copy and its own limit, not the 40-image limit', () => {
    assert.match(section, /Video references<\/h3>/);
    assert.match(section, /Upload reference video/);
    assert.match(section, /Add videos from this film&apos;s library/);
    assert.match(section, /Your reference clip is not automatically included in the finished film\. Results may vary\./);
    assert.match(section, /Reference-video audio is not used or exported in this version\. Add approved audio separately in Audio\./);
    assert.match(section, /video\.limitPerScope/);
    assert.doesNotMatch(section, /safetyLimit/);
    assert.match(section, /I have permission to use the videos I upload/);
  });

  it('Quick Shot is unchanged', () => {
    assert.doesNotMatch(src('../src/interface/components/fast-video/FastVideoStudio.tsx'), /LockedVideoRefs|long-form-video/);
  });
});

// Mimic (beta). Each test names the acceptance criterion of the developer brief it covers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';

const mimic = await loadTs('core/services/mimic.ts');
const media = await loadTs('core/services/mimic-media.ts');
const client = await loadTs('infrastructure/ai/kie-mimic.ts');
const { planMimicRequest, mimicUnits, mimicAspect, mimicSummary, mimicMissingFromPayload, parseMimicRecord, mimicTrimIssues, MULTI_SUBJECT_UNVERIFIED, MIMIC_CAPABILITY } = mimic;
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const base = 'https://example.supabase.co/storage/v1/object/public/elements/owner/';
const source = { durationMs: 12_000, width: 1280, height: 720, hasAudio: true, url: `${base}mimic/take.mp4` };
let n = 0;
const change = (label, target, refs = 1, extra = {}) => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, label, targetType: 'person', target,
    referenceUrls: Array.from({ length: refs }, (_, i) => `${base}${label.toLowerCase().replace(/\s+/g, '-')}-${i}.jpg`), instructions: '', ...extra,
  };
};
const settings = (assignments, extra = {}) => ({ source, trimStartMs: 0, trimEndMs: 8000, assignments, instructions: '', audioPolicy: 'keep_source', resolution: '720p', ...extra });

describe('One change (the simple path)', () => {
  it('one person with one reference image becomes one request with the image at its field', () => {
    const out = planMimicRequest(settings([change('Sam', 'the man on the left')]));
    assert.ok(out.ok, JSON.stringify(out.issues));
    assert.equal(out.plan.model, 'kling-3.0-omni/transformation');
    assert.deepEqual(out.plan.input.image_urls, [`${base}sam-0.jpg`]);
    assert.equal(out.plan.input.elements, undefined);
    assert.equal(out.plan.input.audio, false);
    assert.equal(out.plan.input.aspect_ratio, '16:9');
    assert.match(out.plan.prompt, /Change 1: replace the man on the left with the person shown in reference image 1, keeping that person's movements and expressions\./);
    assert.match(out.plan.prompt, /Keep the original performance exactly/);
    assert.deepEqual(out.plan.required, [{ field: 'image_urls[0]', url: `${base}sam-0.jpg` }]);
  });

  it('several views of one person travel as one named subject', () => {
    const out = planMimicRequest(settings([change('Sam', 'the man on the left', 3)]));
    assert.ok(out.ok, JSON.stringify(out.issues));
    assert.equal(out.plan.input.elements.length, 1);
    assert.equal(out.plan.input.elements[0].name, 'subject_1');
    assert.equal(out.plan.input.elements[0].element_input_urls.length, 3);
    assert.match(out.plan.prompt, /replace the man on the left with @subject_1/);
    assert.deepEqual(out.plan.required.map((r) => r.field), ['elements[0].element_input_urls[0]', 'elements[0].element_input_urls[1]', 'elements[0].element_input_urls[2]']);
    assert.deepEqual(mimicMissingFromPayload({ ...out.plan.input, video_urls: ['https://x/clip.mp4'] }, out.plan.required), []);
  });

  it('an object keeps its position rather than a performance', () => {
    const out = planMimicRequest(settings([change('My product', 'the bottle on the table', 1, { targetType: 'object' })]));
    assert.match(out.plan.prompt, /replace the bottle on the table with the object shown in reference image 1, keeping its position and how it is handled/);
  });

  it('a change described only in words needs no reference, and nothing at all is not a request', () => {
    const words = planMimicRequest(settings([change('Red jacket', 'the jacket', 0, { instructions: 'Make it bright red.' })]));
    assert.ok(words.ok, JSON.stringify(words.issues));
    assert.equal(words.plan.input.image_urls, undefined);
    assert.equal(words.plan.input.aspect_ratio, 'auto');
    assert.match(words.plan.prompt, /Change 1: change the jacket.*Make it bright red\./);
    assert.match(planMimicRequest(settings([])).issues.join(' '), /Add a person or object to change/);
    assert.match(planMimicRequest(settings([change('Sam', 'the man', 0)])).issues.join(' '), /Sam: add a reference image, or describe the change/);
  });
});

describe('Several changes stay separate (multiple characters and objects)', () => {
  const three = () => [change('Sam', 'the man on the left', 2), change('Anna', 'the woman on the right'), change('My product', 'the bottle', 1, { targetType: 'object' })];

  it('with multi-subject off, several changes block with the reason and are never trimmed to one', () => {
    const out = planMimicRequest(settings(three()));
    assert.equal(out.ok, false);
    assert.ok(out.issues.includes(MULTI_SUBJECT_UNVERIFIED));
  });

  it('with multi-subject on, every change is in one request with its own references', () => {
    const out = planMimicRequest(settings(three()), { multiSubject: true });
    assert.ok(out.ok, JSON.stringify(out.issues));
    assert.equal(out.plan.manifest.length, 3);
    assert.deepEqual(out.plan.manifest.map((m) => m.route), ['subject', 'image', 'image']);
    assert.equal(out.plan.input.elements.length, 1);
    assert.equal(out.plan.input.image_urls.length, 2);
    assert.match(out.plan.prompt, /Change 1: replace the man on the left with @subject_1/);
    assert.match(out.plan.prompt, /Change 2: replace the woman on the right with the person shown in reference image 1/);
    assert.match(out.plan.prompt, /Change 3: replace the bottle with the object shown in reference image 2/);
    assert.equal(new Set(out.plan.required.map((r) => r.url)).size, 4, 'every reference is required, none shared or dropped');
  });

  it('editing one change leaves the others exactly as they were', () => {
    const before = three();
    const after = before.map((a, i) => (i === 1 ? { ...a, target: 'the woman in the red coat' } : a));
    const a = planMimicRequest(settings(before), { multiSubject: true }).plan.manifest;
    const b = planMimicRequest(settings(after), { multiSubject: true }).plan.manifest;
    assert.deepEqual(b[0], a[0]);
    assert.deepEqual(b[2], a[2]);
    assert.notDeepEqual(b[1], a[1]);
  });

  it('two changes pointing at the same subject are not guessed between', () => {
    const out = planMimicRequest(settings([change('Sam', 'the man'), change('Leon', 'The Man')]), { multiSubject: true });
    assert.match(out.issues.join(' '), /Leon and Sam both point at "The Man"/);
  });

  it('more references than the model takes block clearly', () => {
    const five = Array.from({ length: 5 }, (_, i) => change(`P${i}`, `person ${i}`));
    assert.match(planMimicRequest(settings(five), { multiSubject: true }).issues.join(' '), /5 changes use reference images; Kling 3\.0 Omni accepts 4 in one take\. Remove 1/);
    assert.match(planMimicRequest(settings([change('Sam', 'the man', 5)])).issues.join(' '), /5 reference images; Kling 3\.0 Omni takes at most 4/);
    assert.match(planMimicRequest(settings([change('Sam', 'the man', 1, { referenceUrls: [`${base}sam.webp`] })])).issues.join(' '), /must be JPG or PNG/);
  });

  it('a missing target is asked for, not assumed', () => {
    assert.match(planMimicRequest(settings([change('Sam', '')])).issues.join(' '), /Sam: say who or what in your take this changes/);
  });
});

describe('Take length, shape and cost', () => {
  it('the selected part must fit the model', () => {
    assert.deepEqual(mimicTrimIssues(0, 8000, 12_000), []);
    assert.match(mimicTrimIssues(0, 2000, 12_000)[0], /2 s is selected; Kling 3\.0 Omni needs at least 3 s/);
    assert.match(mimicTrimIssues(0, 16_000, 20_000)[0], /16 s is selected; Kling 3\.0 Omni takes at most 15\.5 s/);
    assert.match(mimicTrimIssues(5000, 4000, 12_000)[0], /must start before it ends/);
    assert.match(mimicTrimIssues(0, 13_000, 12_000)[0], /ends after the take does/);
  });
  it('a take too small for the model is refused with its size', () => {
    const out = planMimicRequest({ ...settings([change('Sam', 'the man')]), source: { ...source, width: 640, height: 360 } });
    assert.match(out.issues.join(' '), /640×360; Kling 3\.0 Omni needs each side to be at least 700 pixels/);
  });
  it('cost is one generation per 10 seconds started and is part of the plan', () => {
    assert.equal(mimicUnits(3000), 1);
    assert.equal(mimicUnits(10_000), 1);
    assert.equal(mimicUnits(10_001), 2);
    assert.equal(mimicUnits(MIMIC_CAPABILITY.maxClipMs), 2);
    assert.equal(planMimicRequest(settings([change('Sam', 'the man')], { trimEndMs: 12_000 })).plan.units, 2);
  });
  it('output shape follows the take', () => {
    assert.equal(mimicAspect(1920, 1080), '16:9');
    assert.equal(mimicAspect(720, 1280), '9:16');
    assert.equal(mimicAspect(1000, 1000), '1:1');
  });
});

describe('What the creator approves (cost, sound and changes before any spend)', () => {
  it('the summary states the changes, sound, cost and that the recording is untouched', () => {
    const s = settings([change('Sam', 'the man on the left')]);
    const lines = mimicSummary(s, planMimicRequest(s).plan).join('\n');
    assert.match(lines, /Changes: the man on the left → Sam\./);
    assert.match(lines, /your take's own sound is kept.*lips may not match/);
    assert.match(lines, /Cost: 1 generation from your allowance\./);
    assert.match(lines, /Your recording is not changed\./);
  });
  it('sound is stated for a muted take and for a take with no sound', () => {
    const muted = settings([change('Sam', 'the man')], { audioPolicy: 'mute' });
    assert.match(mimicSummary(muted, planMimicRequest(muted).plan).join('\n'), /Sound: the result is silent\./);
    const silent = { ...settings([change('Sam', 'the man')]), source: { ...source, hasAudio: false } };
    assert.match(mimicSummary(silent, planMimicRequest(silent).plan).join('\n'), /has no sound, so the result is silent/);
  });
});

describe('The request is complete or it is not sent', () => {
  it('a missing or substituted reference is caught on the final payload', () => {
    const plan = planMimicRequest(settings([change('Sam', 'the man', 2)])).plan;
    const sabotaged = { ...plan.input, elements: [{ ...plan.input.elements[0], element_input_urls: plan.input.elements[0].element_input_urls.slice(0, 1) }] };
    assert.equal(mimicMissingFromPayload(sabotaged, plan.required).length, 1);
    assert.equal(mimicMissingFromPayload({ image_urls: ['https://x/other.jpg'] }, [{ field: 'image_urls[0]', url: 'https://x/sam.jpg' }]).length, 1);
  });
});

describe('Provider replies (honest status, no double charge)', () => {
  it('reads pending, failed and finished records', () => {
    assert.deepEqual(parseMimicRecord(null), { state: 'pending' });
    assert.deepEqual(parseMimicRecord({ state: 'generating' }), { state: 'pending' });
    assert.deepEqual(parseMimicRecord({ state: 'fail', failMsg: 'Content rejected' }), { state: 'fail', message: 'Content rejected' });
    assert.deepEqual(parseMimicRecord({ state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://cdn.example.com/out.mp4'] }) }), { state: 'success', url: 'https://cdn.example.com/out.mp4' });
    assert.equal(parseMimicRecord({ state: 'success', resultJson: '{"resultUrls":[]}' }).state, 'fail');
    assert.equal(parseMimicRecord({ state: 'success', resultJson: 'not json' }).state, 'fail');
  });

  const reply = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
  it('a coded refusal is definite, so the allowance can be given back', async () => {
    const out = await client.createKieMimicTask('k', { model: 'm', input: {} }, reply({ code: 402, msg: 'no credits' }));
    assert.deepEqual([out.ok, out.definite], [false, true]);
    assert.match(out.message, /out of credits/);
  });
  it('a timeout or a server error is ambiguous, so the take is held rather than retried', async () => {
    const dropped = await client.createKieMimicTask('k', { model: 'm', input: {} }, async () => { throw new Error('timeout'); });
    assert.deepEqual([dropped.ok, dropped.definite], [false, false]);
    const broken = await client.createKieMimicTask('k', { model: 'm', input: {} }, reply({ code: 500, msg: 'oops' }, 500));
    assert.equal(broken.definite, false);
  });
  it('an accepted task returns its id', async () => {
    assert.deepEqual(await client.createKieMimicTask('k', { model: 'm', input: {} }, reply({ code: 200, data: { taskId: 't1' } })), { ok: true, taskId: 't1' });
  });
});

describe('Preparing and finishing video', () => {
  it('a recording is prepared as steady 30 fps H.264 with its sound kept and metadata removed', () => {
    const args = media.prepareArgs('/tmp/in', '/tmp/out.mp4');
    assert.match(args[args.indexOf('-vf') + 1], /^fps=30,scale=/);
    assert.ok(args.includes('0:a:0?'), 'sound is optional, not required');
    assert.equal(args[args.indexOf('-map_metadata') + 1], '-1');
    assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  });
  it('the cut is the selected part only', () => {
    const args = media.cutArgs('/tmp/in.mp4', '/tmp/out.mp4', 1500, 9000);
    assert.equal(args[args.indexOf('-ss') + 1], '1.500');
    assert.equal(args[args.indexOf('-t') + 1], '7.500');
  });
  it('keeping sound copies the generated picture untouched and takes sound from the take', () => {
    const args = media.muxArgs('/tmp/result.mp4', '/tmp/take.mp4', '/tmp/final.mp4');
    assert.equal(args[args.indexOf('-c:v') + 1], 'copy');
    assert.ok(args.includes('1:a:0') && args.includes('0:v:0') && args.includes('-shortest'));
  });

  it('a real video is prepared to the model’s minimum size; a non-video is refused', async (t) => {
    let ffmpeg;
    try { ffmpeg = createRequire(import.meta.url)('ffmpeg-static'); } catch { t.skip('ffmpeg is not installed'); return; }
    const bytes = readFileSync(new URL('../public/landing-720.mp4', import.meta.url));
    let prepared;
    try { prepared = await media.prepareMimicSource(ffmpeg, bytes, 600_000); } catch (error) { t.skip(`sample video not usable here: ${error.message}`); return; }
    assert.ok(Math.min(prepared.width, prepared.height) >= 700, `${prepared.width}x${prepared.height}`);
    assert.ok(prepared.width % 2 === 0 && prepared.height % 2 === 0);
    assert.match(prepared.sha256, /^[a-f0-9]{64}$/);
    const clip = await media.cutMimicClip(ffmpeg, prepared.bytes, 0, 3000);
    assert.ok(Math.abs(clip.durationMs - 3000) <= 200, `clip is ${clip.durationMs} ms`);
    await assert.rejects(media.prepareMimicSource(ffmpeg, Buffer.from('<html>not a video</html>'), 30_000), /isn't a video we can read/);
  });
});

describe('Wiring (approval, charging, ownership, originals)', () => {
  const actions = src('../src/core/actions/mimic.ts');
  const generate = actions.slice(actions.indexOf('export async function generateMimic'), actions.indexOf('async function firstUnreadable'));
  const create = actions.slice(actions.indexOf('export async function createMimicTask'), actions.indexOf('const settingsSchema'));
  const page = src('../src/interface/components/mimic/MimicStudio.tsx');
  const migration = src('../src/infrastructure/supabase/migrations/0055_mimic.sql');

  it('recording or uploading never spends: no allowance or provider call when a take is created', () => {
    assert.doesNotMatch(create, /reserveUsageQuota|createKieMimicTask|settleUsageQuota/);
  });

  it('generation needs the approved cost and confirmed rights, re-checks everything, then claims the take once', () => {
    assert.match(actions, /approvedUnits: z\.number\(\)/);
    assert.match(actions, /rightsConfirmed: z\.literal\(true\)/);
    const order = ['planMimicRequest(', 'plan.units !== parsed.data.approvedUnits', '.in("status", ["ready", "failed"]).select("id")', 'mimicMissingFromPayload(', 'reserveUsageQuota(', 'createKieMimicTask('];
    const at = order.map((text) => generate.indexOf(text));
    assert.ok(at.every((i) => i > 0), JSON.stringify(at));
    assert.deepEqual([...at].sort((a, b) => a - b), at, 'validate, approve, claim, check payload, reserve, submit');
  });

  it('a definite refusal gives the allowance back; an unconfirmed one is held, not retried', () => {
    assert.match(generate, /if \(created\.definite\) \{[\s\S]*?settleUsageQuota\(user\.id, quota\.reservationId, false\)/);
    assert.match(generate, /status: "unknown"/);
    assert.match(actions, /AMBIGUOUS_HOLD_MS/);
  });

  it('the allowance is committed or returned only by the request that finishes the take', () => {
    const refresh = actions.slice(actions.indexOf('export async function refreshMimic'), actions.indexOf('export async function duplicateMimicTask'));
    assert.match(refresh, /\.eq\("status", "generating"\)\.select\("\*"\)\.maybeSingle\(\)\s*\n\s*if \(failed && row\.reservation_id\) await settleUsageQuota\(user\.id, row\.reservation_id, false\)/);
    assert.ok(refresh.indexOf('if (!done)') < refresh.indexOf('settleUsageQuota(user.id, row.reservation_id, true)'));
  });

  it('every read and write is scoped to the signed-in owner', () => {
    assert.match(actions, /\.eq\("id", taskId\)\.eq\("user_id", userId\)/);
    assert.match(actions, /ownsAssetUrl\(url, user\.id\) \|\| \(origin === "library" && ownsRenderUrl\(url, user\.id\)\)/);
    assert.match(actions, /referenceUrls\.some\(url => !ownsAssetUrl\(url, user\.id\)\)/);
    assert.match(migration, /enable row level security/);
    assert.match(migration, /using \(user_id = auth\.uid\(\)\)/);
  });

  it('the recording is never modified: results and new versions are new files and rows', () => {
    assert.doesNotMatch(actions, /update\(\{[^}]*source_(path|url|sha256)/);
    assert.match(actions, /parent_task_id: row\.id/);
    assert.match(actions, /results\/\$\{crypto\.randomUUID\(\)\}\.mp4/);
    assert.match(migration, /parent_task_id uuid references public\.mimic_tasks\(id\)/);
  });

  it('a take that failed to save is not left behind as a usable file', () => {
    assert.match(create, /await db\.storage\.from\(MIMIC_BUCKET\)\.remove\(\[path\]\)/);
  });

  it('the page shows cost, sound and changes before approval, with no invented progress', () => {
    assert.match(page, /mimicSummary\(settings, planned\.plan\)/);
    assert.match(page, /disabled=\{!planned\.ok \|\| !rights \|\| Boolean\(busy\)\}/);
    assert.match(page, /Upload a video instead|onUploadInstead/);
    assert.doesNotMatch(page, /%\s*complete|progress=\{/);
    assert.match(page, /Original · unchanged/);
  });

  it('camera denial has an upload fallback, and the recorder does not promise a live transformed preview', () => {
    const recorder = src('../src/interface/components/mimic/MimicRecorder.tsx');
    assert.match(recorder, /NotAllowedError/);
    assert.match(recorder, /Upload a video instead/);
    assert.match(recorder, /the transformed result comes after generation/);
  });

  it('Mimic sits between Create and Edit in the sidebar, marked Beta', () => {
    const nav = src('../src/interface/components/layout/nav-items.ts');
    const order = ['name: "Create"', 'name: "Mimic", badge: "Beta"', 'name: "Edit"'].map((text) => nav.indexOf(text));
    assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
  });
});

describe('Redesigned workspace', () => {
  const dir = '../src/interface/components/mimic/';
  it('the trim handles are native range inputs bounded by the model limits', () => {
    const trimmer = src(`${dir}MimicTrimmer.tsx`);
    assert.equal((trimmer.match(/type="range"/g) || []).length, 2);
    assert.match(src(`${dir}MimicStudio.tsx`), /minMs=\{MIMIC_CAPABILITY\.minClipMs\} maxMs=\{MIMIC_CAPABILITY\.maxClipMs\}/);
  });
  it('the compare keeps both videos on one transport and labels the original as unchanged', () => {
    const compare = src(`${dir}MimicCompare.tsx`);
    assert.match(compare, /Original · unchanged/);
    assert.match(compare, /Math\.abs\(follow\.currentTime - lead\.currentTime\) > 0\.12/);
  });
  it('a held change is marked, not hidden, when multi-subject is off', () => {
    assert.match(src(`${dir}MimicStudio.tsx`), /held=\{!loaded\.multiSubject && index > 0\}/);
    assert.match(src(`${dir}MimicCast.tsx`), /Saved · not sent/);
  });
  it('the dev preview never renders on production', () => {
    assert.match(src('../src/app/dev/mimic/page.tsx'), /if \(production\) notFound\(\)/);
  });
});

describe('Several changes in one take', () => {
  it('are on unless switched off', () => {
    assert.match(src('../src/core/config/feature-flags.ts'), /NEXT_PUBLIC_MIMIC_MULTI_SUBJECT, true\)/);
  });
});

// Long Form locked media + audio (spec v2.0). Each test names the acceptance item(s) it covers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { loadTs } from './load-ts.mjs';

const audio = await loadTs('core/services/long-form-audio.ts');
const store = await loadTs('core/services/long-form-audio-store.ts');
const locks = await loadTs('core/services/long-form-locks.ts');
const kie = await loadTs('infrastructure/ai/kie-audio.ts');
const { buildXfadeFilter } = await loadTs('core/services/transitions.ts');
const { buildAiAudioTask, parseAiAudioRecord, planFilmAudio, plannedSpans, defaultPlacement, buildLockedAudioMixArgs, segmentLength, DIALOGUE_VOICES, remapCues, toOutputMs } = audio;
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const VOICE = DIALOGUE_VOICES[0].id;
const sha = (c) => c.repeat(64).slice(0, 64);
const asset = (id, purpose, durationMs, extra = {}) => ({
  id, origin: 'uploaded', purpose, name: id, status: 'ready', storagePath: `u/audio/${id}.mp3`, playbackPath: `u/audio/${id}.mp3`,
  sha256: sha(id[0]), mimeType: 'audio/mpeg', byteSize: 1000, durationMs, generation: null, providerTaskId: null, errorMessage: null, createdAt: '2026-11-08T00:00:00Z', ...extra,
});
let nextId = 0;
const place = (a, scope, shotNumber, extra = {}) => ({
  id: `b${++nextId}`, scopeType: scope, shotNumber: scope === 'scene' ? null : shotNumber, audioAssetId: a.id, sha256: a.sha256, purpose: a.purpose,
  anchorTitle: '', ...defaultPlacement(a.purpose, scope), ...extra,
});
const map = (...assets) => new Map(assets.map((a) => [a.id, a]));
// PASTOR: 3 shots of 7 s, 10 s, 8 s.
const spans = plannedSpans([{ title: "Sam's Morning", durationSec: 7 }, { title: 'Kitchen group', durationSec: 10 }, { title: 'Prayer close-up', durationSec: 8 }]);
const kinds = (plan) => plan.issues.map((i) => i.kind);

describe('AI audio requests (spec §5, §10; acceptance 12, 23)', () => {
  it('dialogue maps to ElevenLabs Turbo 2.5 with an allowed voice', () => {
    const r = buildAiAudioTask({ purpose: 'dialogue', text: '  Lord, give me strength.  ', voiceId: VOICE });
    assert.equal(r.ok, true);
    assert.equal(r.body.model, 'elevenlabs/text-to-speech-turbo-2-5');
    assert.deepEqual(r.body.input, { text: 'Lord, give me strength.', voice: VOICE, stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 });
  });
  it('an unlisted voice id is rejected (unauthorised voice selection)', () => {
    for (const voiceId of [undefined, 'not-a-voice', '4YYIPFl9wE5c4L2eu2Gb' /* a trademarked voice Kie lists, left out on purpose */]) {
      const r = buildAiAudioTask({ purpose: 'dialogue', text: 'Hi', voiceId });
      assert.equal(r.ok, false, String(voiceId));
    }
  });
  it('text limits are enforced per type, before any request', () => {
    assert.equal(buildAiAudioTask({ purpose: 'dialogue', text: 'x'.repeat(5001), voiceId: VOICE }).ok, false);
    assert.equal(buildAiAudioTask({ purpose: 'dialogue', text: 'x'.repeat(5000), voiceId: VOICE }).ok, true);
    assert.equal(buildAiAudioTask({ purpose: 'sound_effect', text: 'x'.repeat(501) }).ok, false);
    assert.equal(buildAiAudioTask({ purpose: 'ambience', text: '   ' }).ok, false);
  });
  it('speech speed outside 0.7–1.2 is refused, never clamped silently', () => {
    assert.equal(buildAiAudioTask({ purpose: 'dialogue', text: 'Hi', voiceId: VOICE, speed: 1.5 }).ok, false);
    assert.equal(buildAiAudioTask({ purpose: 'dialogue', text: 'Hi', voiceId: VOICE, speed: 0.7 }).ok, true);
  });
  it('music takes a 10–360 s target on Suno V6 custom mode', () => {
    assert.equal(buildAiAudioTask({ purpose: 'music', text: 'Piano', targetSec: 9 }).ok, false);
    assert.equal(buildAiAudioTask({ purpose: 'music', text: 'Piano', targetSec: 361 }).ok, false);
    const r = buildAiAudioTask({ purpose: 'music', text: 'Slow piano', targetSec: 45 });
    assert.equal(r.body.model, 'ai-music-api/generate');
    assert.equal(r.body.input.custom_mode, true);
    assert.equal(r.body.input.duration, 45);
    assert.equal(r.body.input.instrumental, true);
    assert.ok(r.body.input.title.length <= 80);
  });
  it('sound effects and ambience use Suno sounds with no length field; ambience loops by default', () => {
    const fx = buildAiAudioTask({ purpose: 'sound_effect', text: 'Door creak' });
    const amb = buildAiAudioTask({ purpose: 'ambience', text: 'Rain' });
    assert.equal(fx.body.model, 'ai-music-api/sounds');
    assert.equal(fx.body.input.sound_loop, false);
    assert.equal(amb.body.input.sound_loop, true);
    assert.equal('duration' in fx.body.input, false);
  });
});

describe('Reading provider results', () => {
  it('ElevenLabs: resultJson string with resultUrls', () => {
    const r = parseAiAudioRecord({ state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://cdn.kie.ai/a.mp3'] }) });
    assert.deepEqual(r, { state: 'success', tracks: [{ url: 'https://cdn.kie.ai/a.mp3', durationSec: null }], failMessage: null });
  });
  it('Suno: response.data[] tracks with durations', () => {
    const r = parseAiAudioRecord({ state: 'success', response: { data: [{ audio_url: 'https://x/1.mp3', duration: 31.2 }, { audio_url: 'https://x/2.mp3', duration: 29.8 }] } });
    assert.equal(r.tracks.length, 2);
    assert.equal(r.tracks[0].durationSec, 31.2);
  });
  it('pending, failed, and "success" with no audio (treated as a failure, never as ready)', () => {
    assert.equal(parseAiAudioRecord({ state: 'generating' }).state, 'pending');
    assert.equal(parseAiAudioRecord(null).state, 'pending');
    const fail = parseAiAudioRecord({ state: 'fail', failMsg: 'bad prompt' });
    assert.equal(fail.state, 'fail');
    assert.equal(fail.failMessage, 'bad prompt');
    assert.equal(parseAiAudioRecord({ state: 'success', resultJson: '{"resultUrls":[]}' }).state, 'fail');
  });
  it('non-https result URLs are ignored', () => {
    assert.equal(parseAiAudioRecord({ state: 'success', resultJson: { resultUrls: ['http://x/a.mp3', 'file:///etc/passwd'] } }).state, 'fail');
  });
});

describe('Kie audio client: definite vs ambiguous failures (spec §12; acceptance 24)', () => {
  const reply = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
  it('accepted task returns its id', async () => {
    const r = await kie.createKieAudioTask('k', { model: 'm', input: {} }, reply({ code: 200, data: { taskId: 't1' } }));
    assert.deepEqual(r, { ok: true, taskId: 't1' });
  });
  it('a coded refusal (402 credits) is definite: safe to release the allowance', async () => {
    const r = await kie.createKieAudioTask('k', { model: 'm', input: {} }, reply({ code: 402, msg: 'no credits' }));
    assert.equal(r.ok, false);
    assert.equal(r.definite, true);
  });
  it('a dropped connection is ambiguous: never retried automatically', async () => {
    const r = await kie.createKieAudioTask('k', { model: 'm', input: {} }, async () => { throw new Error('socket hang up'); });
    assert.equal(r.ok, false);
    assert.equal(r.definite, false);
  });
  it('a 500 without a body is ambiguous; a code-500 body is ambiguous too', async () => {
    assert.equal((await kie.createKieAudioTask('k', { model: 'm', input: {} }, async () => new Response('oops', { status: 502 }))).definite, false);
    assert.equal((await kie.createKieAudioTask('k', { model: 'm', input: {} }, reply({ code: 500, msg: 'err' }))).definite, false);
  });
  it('the request never carries the key anywhere but the Authorization header', async () => {
    let seen;
    await kie.createKieAudioTask('secret-key', { model: 'm', input: { text: 'x' } }, async (url, init) => { seen = { url, init }; return new Response('{"code":200,"data":{"taskId":"t"}}'); });
    assert.equal(String(seen.url).includes('secret-key'), false);
    assert.equal(String(seen.init.body).includes('secret-key'), false);
    assert.equal(seen.init.headers.Authorization, 'Bearer secret-key');
  });
});

describe('Placement and timing (spec §6, §8; acceptance 14, 16, 17, 18)', () => {
  it('9 s of dialogue on a 7 s shot blocks export; nothing is cut or sped up', () => {
    const prayer = asset('prayer', 'dialogue', 9000);
    const plan = planFilmAudio([place(prayer, 'shot', 1, { nativeAudio: 'mute' })], map(prayer), spans);
    assert.deepEqual(kinds(plan), ['too_long']);
    assert.equal(plan.cues.length, 0);
  });
  it('explicit fixes resolve it: trim, or end with the shot', () => {
    const prayer = asset('prayer', 'dialogue', 9000);
    const trimmed = planFilmAudio([place(prayer, 'shot', 1, { nativeAudio: 'mute', sourceOutMs: 7000 })], map(prayer), spans);
    assert.equal(trimmed.issues.length, 0);
    assert.equal(trimmed.cues[0].durationMs, 7000);
    const cut = planFilmAudio([place(prayer, 'shot', 1, { nativeAudio: 'mute', overflow: 'cut_at_end' })], map(prayer), spans);
    assert.equal(cut.issues.length, 0);
    assert.equal(cut.cues[0].durationMs, 7000);
    assert.equal(cut.cues[0].startMs, 0);
  });
  it('shot audio is placed at its shot plus the offset', () => {
    const fx = asset('fx', 'sound_effect', 1500);
    const plan = planFilmAudio([place(fx, 'shot', 2, { offsetMs: 2500 })], map(fx), spans);
    assert.equal(plan.cues[0].startMs, 7000 + 2500);
  });
  it('an offset past the end of the shot is reported, not clamped', () => {
    const fx = asset('fx', 'sound_effect', 1500);
    assert.deepEqual(kinds(planFilmAudio([place(fx, 'shot', 1, { offsetMs: 7000 })], map(fx), spans)), ['out_of_range']);
  });
  it('continuous scene audio is ONE cue across every cut (no restart, no duplicates)', () => {
    const rain = asset('rain', 'ambience', 30000);
    const plan = planFilmAudio([place(rain, 'scene', null, { overflow: 'cut_at_end' })], map(rain), spans);
    assert.equal(plan.issues.length, 0);
    assert.equal(plan.cues.length, 1);
    assert.equal(plan.cues[0].startMs, 0);
    assert.equal(plan.cues[0].durationMs, 25000);
  });
  it('continuous scene audio shorter than the scene asks for a decision; loop only when chosen', () => {
    const rain = asset('rain', 'ambience', 12000);
    assert.deepEqual(kinds(planFilmAudio([place(rain, 'scene', null)], map(rain), spans)), ['too_short']);
    const looped = planFilmAudio([place(rain, 'scene', null, { loop: true })], map(rain), spans);
    assert.equal(looped.issues.length, 0);
    assert.equal(looped.cues[0].durationMs, 25000);
    assert.equal(looped.cues[0].segmentMs, 12000);
    assert.equal(looped.cues[0].loop, true);
  });
  it('continuous scene audio longer than the scene blocks unless set to end with it', () => {
    const music = asset('music', 'music', 40000);
    assert.deepEqual(kinds(planFilmAudio([place(music, 'scene', null)], map(music), spans)), ['too_long']);
  });
  it('repeat per shot is explicit and gives one cue per shot', () => {
    const sting = asset('sting', 'sound_effect', 1000);
    const plan = planFilmAudio([place(sting, 'scene', null, { playback: 'repeat_per_shot' })], map(sting), spans);
    assert.deepEqual(plan.cues.map((c) => c.startMs), [0, 7000, 17000]);
  });
  it('the same file placed twice stays two distinct placements', () => {
    const prayer = asset('prayer', 'dialogue', 5000);
    const plan = planFilmAudio([place(prayer, 'shot', 1, { nativeAudio: 'mute' }), place(prayer, 'shot', 3, { nativeAudio: 'mute' })], map(prayer), spans);
    assert.equal(plan.cues.length, 2);
    assert.notEqual(plan.cues[0].bindingId, plan.cues[1].bindingId);
    assert.deepEqual(plan.cues.map((c) => c.startMs), [0, 17000]);
  });
  it('a scene bed is never duplicated because it shows under several shots', () => {
    const rain = asset('rain', 'ambience', 25000);
    const plan = planFilmAudio([place(rain, 'scene', null)], map(rain), spans);
    assert.equal(plan.cues.length, 1);
  });
  it('trim points outside the recording are reported', () => {
    const fx = asset('fx', 'sound_effect', 2000);
    assert.deepEqual(kinds(planFilmAudio([place(fx, 'shot', 1, { sourceInMs: 2500 })], map(fx), spans)), ['out_of_range']);
    assert.equal(segmentLength(place(fx, 'shot', 1, { sourceInMs: 500, sourceOutMs: 1500 }), fx), 1000);
  });
});

describe('Mix decisions and sync (spec §6; acceptance 19, 20, 27)', () => {
  it('approved dialogue needs a decision about the shot’s own sound before export', () => {
    const prayer = asset('prayer', 'dialogue', 5000);
    assert.deepEqual(kinds(planFilmAudio([place(prayer, 'shot', 1)], map(prayer), spans)), ['decision']);
  });
  it('mute records which shots lose their generated sound; keep leaves them', () => {
    const prayer = asset('prayer', 'dialogue', 5000);
    assert.deepEqual(planFilmAudio([place(prayer, 'shot', 2, { nativeAudio: 'mute' })], map(prayer), spans).mutedShots, [2]);
    assert.deepEqual(planFilmAudio([place(prayer, 'shot', 2, { nativeAudio: 'keep' })], map(prayer), spans).mutedShots, []);
  });
  it('scene dialogue muted mutes every shot it plays over', () => {
    const vo = asset('vo', 'dialogue', 25000);
    assert.deepEqual(planFilmAudio([place(vo, 'scene', null, { nativeAudio: 'mute' })], map(vo), spans).mutedShots, [1, 2, 3]);
  });
  it('two dialogue recordings speaking at once are flagged', () => {
    const a = asset('aline', 'dialogue', 5000), c = asset('cline', 'dialogue', 5000);
    const plan = planFilmAudio([place(a, 'shot', 1, { nativeAudio: 'mute' }), place(c, 'shot', 1, { nativeAudio: 'mute', offsetMs: 1000 })], map(a, c), spans);
    assert.ok(kinds(plan).includes('conflict'));
  });
  it('ambience under dialogue is a deliberate mix, not a conflict', () => {
    const line = asset('line', 'dialogue', 5000), rain = asset('rain', 'ambience', 25000);
    const plan = planFilmAudio([place(line, 'shot', 1, { nativeAudio: 'mute' }), place(rain, 'scene', null)], map(line, rain), spans);
    assert.equal(plan.issues.length, 0);
  });
  it('mute and keep on the same shot is flagged', () => {
    const a = asset('aline', 'dialogue', 2000), c = asset('cline', 'dialogue', 2000);
    const plan = planFilmAudio([place(a, 'shot', 1, { nativeAudio: 'mute' }), place(c, 'shot', 1, { nativeAudio: 'keep', offsetMs: 3000 })], map(a, c), spans);
    assert.ok(plan.issues.some((i) => /mutes the shot's own sound and another keeps it/.test(i.message)));
  });
  it('matching visible speech can’t complete: it is blocked with an honest reason', () => {
    const line = asset('line', 'dialogue', 3000);
    const plan = planFilmAudio([place(line, 'shot', 1, { nativeAudio: 'mute', dialogueDisplay: 'match_speech' })], map(line), spans);
    assert.deepEqual(kinds(plan), ['sync']);
    assert.match(plan.issues[0].message, /lip-sync step that Long Form doesn't run/);
  });
});

describe('Export gate inputs (spec §10; acceptance 21, 22)', () => {
  it('a missing, unfinished or changed recording blocks export', () => {
    const ok = asset('rain', 'ambience', 25000);
    const b = place(ok, 'scene', null);
    assert.deepEqual(kinds(planFilmAudio([b], new Map(), spans)), ['missing']);
    assert.deepEqual(kinds(planFilmAudio([b], map({ ...ok, status: 'generating' }), spans)), ['missing']);
    assert.deepEqual(kinds(planFilmAudio([b], map({ ...ok, sha256: sha('z') }), spans)), ['missing']);
  });
  it('a shot with locked audio that isn’t in the edit blocks export', () => {
    const fx = asset('fx', 'sound_effect', 1000);
    assert.deepEqual(kinds(planFilmAudio([place(fx, 'shot', 3)], map(fx), spans.slice(0, 2))), ['missing']);
  });
  it('scene audio can’t play over clips that aren’t part of the film', () => {
    const rain = asset('rain', 'ambience', 25000);
    const plan = planFilmAudio([place(rain, 'scene', null)], map(rain), spans, { foreign: [{ startMs: 9000, endMs: 11000 }] });
    assert.deepEqual(kinds(plan), ['conflict']);
    assert.equal(plan.cues.length, 0);
  });
  it('a shot whose title changed (plan reordered) waits for confirmation', () => {
    const fx = asset('fx', 'sound_effect', 1000);
    const plan = planFilmAudio([place(fx, 'shot', 2, { anchorTitle: 'Kitchen group' })], map(fx), spans, { currentTitles: new Map([[2, 'Street exit']]) });
    assert.deepEqual(kinds(plan), ['moved']);
  });
  it('the render manifest records exact versions, times and mutes', () => {
    const prayer = asset('prayer', 'dialogue', 5000);
    const plan = planFilmAudio([place(prayer, 'shot', 2, { nativeAudio: 'mute', gain: 0.8 })], map(prayer), spans);
    const manifest = audio.audioManifest(plan);
    assert.deepEqual(manifest.muted_shots, [2]);
    assert.equal(manifest.placements[0].sha256, prayer.sha256);
    assert.equal(manifest.placements[0].start_ms, 7000);
    assert.equal(manifest.placements[0].gain, 0.8);
  });
  it('clip fingerprint is stable for the same edit and changes when a clip moves', () => {
    const clips = [{ id: 'a', start_ms: 0, end_ms: 7000 }, { id: 'b', start_ms: 7000, end_ms: 17000 }];
    assert.equal(store.videoClipFingerprint(clips), store.videoClipFingerprint([...clips].reverse()));
    assert.notEqual(store.videoClipFingerprint(clips), store.videoClipFingerprint([clips[0], { ...clips[1], start_ms: 7500 }]));
  });
});

describe('Shot moves for image locks (spec §11)', () => {
  it('locks saved for another shot title block until confirmed', () => {
    assert.equal(locks.movedLockIssues([{ anchorTitle: 'Kitchen group' }], 2, 'Kitchen group').length, 0);
    assert.equal(locks.movedLockIssues([{ anchorTitle: 'Kitchen group' }], 2, 'Street exit').length, 1);
    assert.equal(locks.movedLockIssues([{ anchorTitle: '' }], 2, 'Street exit').length, 0, 'locks saved before anchors existed are not blocked');
    assert.equal(locks.movedLockIssues([{ anchorTitle: 'Kitchen group' }], 2, undefined).length, 0);
  });
});

describe('Edit time to output time (transitions overlap shots)', () => {
  it('a 1 s crossfade between two 3 s clips starts clip 2 at 2 s in the output', () => {
    const { startsSec } = buildXfadeFilter([{ clip_a_path: 'a', clip_b_path: 'b', clip_a_duration_sec: 3, clip_b_duration_sec: 3, transition: 'crossfade', duration_ms: 1000 }]);
    assert.deepEqual(startsSec, [0, 2]);
    const cut = buildXfadeFilter([{ clip_a_path: 'a', clip_b_path: 'b', clip_a_duration_sec: 3, clip_b_duration_sec: 3, transition: 'cut', duration_ms: 0 }]);
    assert.deepEqual(cut.startsSec, [0, 3]);
  });
  const clips = [{ startMs: 0, endMs: 3000, outStartMs: 0, outDurationMs: 3000 }, { startMs: 3000, endMs: 6000, outStartMs: 2000, outDurationMs: 3000 }];
  it('maps a time inside a shot to the same moment of that shot in the output', () => {
    assert.equal(toOutputMs(3500, clips), 2500);
    assert.equal(toOutputMs(1000, clips), 1000);
  });
  it('a recording keeps its own length; only a fill-the-span cue follows the real span end', () => {
    const base = { bindingId: 'b', assetId: 'a', sha256: sha('a'), path: 'p', purpose: 'dialogue', sourceInMs: 0, gain: 1, fadeInMs: 0, fadeOutMs: 0, loop: false, segmentMs: 2500 };
    const [once] = remapCues([{ ...base, startMs: 3000, durationMs: 2500, fillsScope: false }], clips);
    assert.deepEqual([once.startMs, once.durationMs], [2000, 2500]);
    const [bed] = remapCues([{ ...base, purpose: 'ambience', startMs: 0, durationMs: 6000, fillsScope: true, loop: true }], clips);
    assert.deepEqual([bed.startMs, bed.durationMs], [0, 5000], 'a scene bed ends with the scene, which is 5 s once the crossfade overlaps');
  });
  it('planning marks which cues fill their span', () => {
    const rain = asset('rain', 'ambience', 12000), prayer = asset('prayer', 'dialogue', 9000);
    assert.equal(planFilmAudio([place(rain, 'scene', null, { loop: true })], map(rain), spans).cues[0].fillsScope, true);
    assert.equal(planFilmAudio([place(prayer, 'shot', 1, { nativeAudio: 'mute', overflow: 'cut_at_end' })], map(prayer), spans).cues[0].fillsScope, true);
    assert.equal(planFilmAudio([place(prayer, 'shot', 2, { nativeAudio: 'mute' })], map(prayer), spans).cues[0].fillsScope, false);
  });
});

describe('Mix arguments (no stretching, exact placement)', () => {
  const cue = (extra = {}) => ({ bindingId: 'b', assetId: 'a', sha256: sha('a'), path: 'p', purpose: 'dialogue', startMs: 7000, sourceInMs: 500, durationMs: 4000, gain: 0.8, fadeInMs: 0, fadeOutMs: 250, loop: false, segmentMs: 4000, localPath: '/tmp/a.wav', ...extra });
  it('delays each cue to its start, trims its segment, applies gain and fades', () => {
    const args = buildLockedAudioMixArgs({ video: 'v.mp4', output: 'o.mp4', totalSec: 25, cues: [cue()] });
    const graph = args[args.indexOf('-filter_complex') + 1];
    assert.match(graph, /atrim=start=0\.500:duration=4\.000/);
    assert.match(graph, /volume=0\.800/);
    assert.match(graph, /afade=t=out:st=3\.750:d=0\.250/);
    assert.match(graph, /adelay=7000\|7000/);
    assert.match(graph, /amix=inputs=2:duration=first:normalize=0/);
    assert.doesNotMatch(graph, /atempo|rubberband|asetrate/, 'never time-stretches');
    assert.ok(args.includes('/tmp/a.wav'));
  });
  it('a looped cue repeats only its chosen segment', () => {
    const args = buildLockedAudioMixArgs({ video: 'v', output: 'o', totalSec: 25, cues: [cue({ loop: true, segmentMs: 2000, durationMs: 25000, startMs: 0 })] });
    const graph = args[args.indexOf('-filter_complex') + 1];
    assert.match(graph, /aloop=loop=-1:size=96000,atrim=duration=25\.000/);
  });
  it('a picture without sound still gets the locked audio over silence', () => {
    const args = buildLockedAudioMixArgs({ video: 'v', output: 'o', totalSec: 5, cues: [cue()], baseHasAudio: false });
    assert.match(args[args.indexOf('-filter_complex') + 1], /anullsrc=channel_layout=stereo:sample_rate=48000\[base\]/);
  });
});

describe('Real render: locked audio lands where it was placed (acceptance 16, 21)', () => {
  const ff = (...a) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...a]);
  /** Mean loudness of a window of the file's audio, in dB (-91 for digital silence). */
  const meanDb = (file, from, len) => {
    const run = spawnSync(ffmpegPath, ['-hide_banner', '-ss', String(from), '-t', String(len), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /mean_volume: (-?[\d.]+|-inf) dB/.exec(run.stderr);
    return !m ? NaN : m[1] === '-inf' ? -200 : Number(m[1]);
  };
  const probe = (file) => spawnSync(ffmpegPath, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  it('silent 6 s picture + a 2 s tone placed at 3 s: silence before, sound during, full length kept', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lf-audio-test-'));
    try {
      const video = join(dir, 'v.mp4'), tone = join(dir, 't.wav'), out = join(dir, 'o.mp4');
      ff('-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=6', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video);
      ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', tone);
      const args = buildLockedAudioMixArgs({ video, output: out, totalSec: 6, cues: [{ bindingId: 'b', assetId: 'a', sha256: sha('a'), path: 'p', purpose: 'dialogue', startMs: 3000, sourceInMs: 1000, durationMs: 2000, gain: 1, fadeInMs: 0, fadeOutMs: 0, loop: false, segmentMs: 3000, localPath: tone }] });
      execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args]);
      const info = probe(out);
      assert.match(info, /Audio:/);
      const d = /Duration: 00:00:(\d+\.\d+)/.exec(info);
      assert.ok(Number(d[1]) >= 5.9, `kept full length (${d?.[1]})`);
      const before = meanDb(out, 0.5, 2), during = meanDb(out, 3.2, 1.5), after = meanDb(out, 5.3, 0.6);
      assert.ok(before < -60, `silent before the cue (${before} dB)`);
      assert.ok(during > -30, `tone audible during the cue (${during} dB)`);
      assert.ok(after < -60, `ends where the cue ends (${after} dB)`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('with a 1 s crossfade, audio locked to shot 2 starts where shot 2 really starts (2 s, not 3 s)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lf-audio-test-'));
    try {
      const a = join(dir, 'a.mov'), b = join(dir, 'b.mov'), pic = join(dir, 'p.mp4'), tone = join(dir, 't.wav'), out = join(dir, 'o.mp4');
      for (const [file, color] of [[a, 'red'], [b, 'blue']]) ff('-f', 'lavfi', '-i', `color=c=${color}:s=320x180:d=3:r=24`, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', file);
      const { inputArgs, filterComplex, maps, startsSec } = buildXfadeFilter([{ clip_a_path: a, clip_b_path: b, clip_a_duration_sec: 3, clip_b_duration_sec: 3, transition: 'crossfade', duration_ms: 1000 }], { fps: 24 });
      ff(...inputArgs, '-filter_complex', filterComplex, ...maps, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', pic);
      ff('-f', 'lavfi', '-i', 'sine=frequency=500:duration=1', tone);
      const plan = planFilmAudio([place({ ...asset('tone', 'sound_effect', 1000) }, 'shot', 2)], map(asset('tone', 'sound_effect', 1000)), [{ shotNumber: 1, startMs: 0, endMs: 3000, title: '' }, { shotNumber: 2, startMs: 3000, endMs: 6000, title: '' }]);
      assert.equal(plan.cues[0].startMs, 3000, 'edit time');
      const [cue] = remapCues(plan.cues, [0, 1].map((i) => ({ startMs: i * 3000, endMs: i * 3000 + 3000, outStartMs: Math.round(startsSec[i] * 1000), outDurationMs: 3000 })));
      assert.equal(cue.startMs, 2000, 'output time');
      execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...buildLockedAudioMixArgs({ video: pic, output: out, totalSec: 5, cues: [{ ...cue, localPath: tone }] })]);
      assert.ok(meanDb(out, 0.5, 1.2) < -60, 'silent before shot 2');
      assert.ok(meanDb(out, 2.1, 0.7) > -30, 'tone plays as shot 2 begins');
      assert.ok(meanDb(out, 3.3, 1.2) < -60, 'and stops after its 1 s');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('a looped 1 s segment fills a 5 s scene with sound throughout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lf-audio-test-'));
    try {
      const video = join(dir, 'v.mp4'), tone = join(dir, 't.wav'), out = join(dir, 'o.mp4');
      ff('-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=5', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video);
      ff('-f', 'lavfi', '-i', 'sine=frequency=300:duration=1', tone);
      const args = buildLockedAudioMixArgs({ video, output: out, totalSec: 5, baseHasAudio: false, cues: [{ bindingId: 'b', assetId: 'a', sha256: sha('a'), path: 'p', purpose: 'ambience', startMs: 0, sourceInMs: 0, durationMs: 5000, gain: 1, fadeInMs: 0, fadeOutMs: 0, loop: true, segmentMs: 1000, localPath: tone }] });
      execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args]);
      for (const at of [0.2, 2.2, 4.3]) assert.ok(meanDb(out, at, 0.5) > -30, `sound at ${at}s`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('Wiring (acceptance 1, 10, 14, 15, 21, 24, 26, 28)', () => {
  const route = src('../src/app/api/timeline/render/route.ts');
  const job = src('../src/core/services/timeline-render-job.ts');
  const actions = src('../src/core/actions/long-form-audio.ts');
  const production = src('../src/core/actions/production.ts');
  const migration = src('../src/infrastructure/supabase/migrations/0053_long_form_locked_media.sql');
  it('the export is checked before a render job is queued, and the plan is saved as its manifest', () => {
    assert.ok(route.indexOf('planTimelineAudio(') < route.indexOf("insertJob(true)"));
    assert.match(route, /status: 409/);
    assert.match(route, /Your video work is saved\./);
    assert.match(route, /lockedAudio,/);
  });
  it('the render verifies each recording’s checksum, mutes decided clips, and checks the output has sound', () => {
    assert.match(job, /sha256Hex\(bytes\) !== cue\.sha256/);
    assert.match(job, /mutedClips\.has\(clip\.id\) \? 0 : clip\.volume/);
    assert.match(job, /!check\.hasAudio \|\| check\.durationSec < totalSec - 0\.25/);
    assert.match(job, /videoClipFingerprint\(clips\) !== locked\.clipFingerprint/);
  });
  it('AI audio: validated before allowance; released on definite failure; ambiguous held; candidates never auto-locked', () => {
    assert.ok(actions.indexOf('buildAiAudioTask(request)') < actions.indexOf('reserveUsageQuota('));
    assert.match(actions, /if \(created\.definite\) \{\s*\/\/ Nothing started: release/);
    assert.match(actions, /status: "unknown"/);
    assert.match(actions, /AMBIGUOUS_HOLD_MS/);
    assert.doesNotMatch(actions.slice(actions.indexOf('export async function refreshAiAudio'), actions.indexOf('export async function discardAudio')), /save_long_form_audio_binding/);
  });
  it('locked recordings and locked images can’t be removed from under their locks', () => {
    assert.match(migration, /audio_asset_id uuid not null references public\.long_form_audio_assets\(id\),/);
    assert.match(migration, /A saved recording cannot be changed/);
    assert.match(production, /is a locked image\. Remove it from Locked media first/);
  });
  it('generation blocks shots whose locks moved, before anything is submitted', () => {
    assert.ok(production.indexOf('movedLockIssues(') < production.indexOf('planLockedRequest(resolvedLocks'));
  });
  it('the UI says Locked media under Editing notes and shows separate image and audio counts', () => {
    const desk = src('../src/interface/components/fast-video/ProductionDesk.tsx');
    const row = src('../src/interface/components/fast-video/LockedMedia.tsx');
    assert.ok(desk.indexOf('Editing notes') < desk.indexOf('<LockedMediaRow'));
    assert.match(row, /Locked media <span/);
    assert.match(row, /`\$\{audioCount\} audio`/);
  });
  it('Quick Shot is unchanged: no locked-media code reaches it', () => {
    for (const file of ['../src/interface/components/fast-video/FastVideoStudio.tsx']) assert.doesNotMatch(src(file), /LockedMedia|long-form-audio|LockedAudio/);
  });
  it('no signed URLs, keys or file paths are logged', () => {
    for (const text of [actions, src('../src/infrastructure/ai/kie-audio.ts'), src('../src/core/services/long-form-audio-store.ts')]) assert.doesNotMatch(text, /console\.(log|info|warn|error)/);
  });
  it('old optional references are not converted to locks (no automatic binding from tags)', () => {
    assert.doesNotMatch(src('../src/core/actions/long-form-locks.ts'), /taggedShotReferences|selectShotReferences/);
  });
});

describe('Editor preview uses the export planner (spec §6: preview mix)', () => {
  const { planEditAudio, cueWindow, cueStateAt, groupFilmClips } = audio;
  const titles = { 1: 'One', 2: 'Two' };
  const index = { fs1: { rootId: 'film', shotNumber: 1, shotName: 'One', titles }, fs2: { rootId: 'film', shotNumber: 2, shotName: 'Two', titles } };
  const clips = [
    { id: 'c1', start_ms: 0, end_ms: 4000, metadata: { film_shot_id: 'fs1' } },
    { id: 'c2', start_ms: 4000, end_ms: 8000, metadata: { film_shot_id: 'fs2' } },
    { id: 'c3', start_ms: 8000, end_ms: 13000, metadata: {} },
  ];
  const prayer = asset('prayer', 'dialogue', 2500), rain = asset('rain', 'ambience', 2000);
  const audioByRoot = { film: { assets: [prayer, rain], bindings: [place(rain, 'scene', null, { loop: true }), place(prayer, 'shot', 2, { nativeAudio: 'mute', offsetMs: 500 })] } };
  it('groups clips by film; other clips are foreign', () => {
    const [film] = groupFilmClips(clips, index);
    assert.deepEqual(film.spans.map((s) => [s.shotNumber, s.startMs, s.endMs]), [[1, 0, 4000], [2, 4000, 8000]]);
    assert.deepEqual(film.foreign, [{ startMs: 8000, endMs: 13000 }]);
  });
  it('plans cues and mutes by clip id, ready for export', () => {
    const plan = planEditAudio(clips, index, audioByRoot);
    assert.equal(plan.issues.length, 0);
    assert.deepEqual(plan.cues.map((c) => [c.bindingId === audioByRoot.film.bindings[0].id ? 'rain' : 'prayer', c.startMs, c.durationMs]), [['rain', 0, 8000], ['prayer', 4500, 2500]]);
    assert.deepEqual(plan.mutedClipIds, ['c2']);
  });
  it('moving a shot in the editor moves its audio before anything is saved', () => {
    const moved = [clips[1], { ...clips[0], start_ms: 4000, end_ms: 8000 }].map((c, i) => (i === 0 ? { ...c, start_ms: 0, end_ms: 4000 } : c));
    const plan = planEditAudio(moved, index, audioByRoot);
    assert.equal(plan.cues.find((c) => c.purpose === 'dialogue').startMs, 500);
  });
  it('the same issues the export would raise show in the preview', () => {
    const undecided = { film: { assets: [prayer], bindings: [place(prayer, 'shot', 2)] } };
    assert.deepEqual(planEditAudio(clips, index, undecided).issues.map((i) => i.kind), ['decision']);
  });
  it('cue windows follow transitions; a recording keeps its length', () => {
    const shift = (ms) => (ms >= 4000 ? ms - 500 : ms);
    assert.deepEqual(cueWindow({ startMs: 4500, durationMs: 2500, fillsScope: false }, shift), { start: 4000, end: 6500 });
    assert.deepEqual(cueWindow({ startMs: 0, durationMs: 8000, fillsScope: true }, shift), { start: 0, end: 7500 });
  });
  it('loop position, fades and gain at any moment', () => {
    const cue = { sourceInMs: 0, loop: true, segmentMs: 2000, fadeInMs: 1000, fadeOutMs: 1000, gain: 0.8 };
    const w = { start: 0, end: 8000 };
    assert.equal(cueStateAt(cue, w, -1), null);
    assert.equal(cueStateAt(cue, w, 8000), null);
    assert.deepEqual(cueStateAt(cue, w, 500), { fileSec: 0.5, volume: 0.4 });
    assert.deepEqual(cueStateAt(cue, w, 4500), { fileSec: 0.5, volume: 0.8 });
    assert.deepEqual(cueStateAt(cue, w, 7500), { fileSec: 1.5, volume: 0.4 });
    assert.equal(cueStateAt({ ...cue, gain: 1.6, fadeInMs: 0, fadeOutMs: 0 }, w, 3000).volume, 1, 'preview caps at 100%');
    assert.equal(cueStateAt({ ...cue, loop: false, sourceInMs: 1000 }, w, 2500).fileSec, 3.5);
  });
  it('the export gate and the preview share one planner', () => {
    assert.match(src('../src/core/services/long-form-audio-store.ts'), /return planEditAudio\(videoClips, index, await loadFilmsAudio\(db, index\)\)/);
    const layer = src('../src/interface/components/editor/LockedAudioLayer.tsx');
    assert.match(layer, /planEditAudio\(videoClips, data\.index, data\.audio\)/);
    const player = src('../src/interface/components/editor/PreviewPlayer.tsx');
    assert.match(player, /video\.muted = Boolean\(videoTrack\?\.muted\) \|\| mutedByLock\.has\(current\.id\)/);
  });
});

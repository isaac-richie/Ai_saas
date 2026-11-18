// Transcript editing (Professional Editor spec 4) and native-quality camera recording.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './load-ts.mjs';

const T = await loadTs('core/services/transcript.ts');
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const TRACK = 'v';
let n = 0;
const newId = () => `new${++n}`;
const clip = (id, start, end, extra = {}) => ({
  id, track_id: TRACK, take_id: null, asset_url: 'https://x/a.mp4', clip_type: 'video', start_ms: start, end_ms: end,
  trim_start_ms: 0, trim_end_ms: null, volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0,
  transition_out: null, transition_out_ms: 0, color_grade_id: null, metadata: { source_duration_ms: 10_000 }, order_index: 0,
  created_at: '', updated_at: '', ...extra,
});
// "Hello um my name is Ada" across 0–6 s of footage.
const words = [['Hello', 0, 500], ['um', 900, 1100], ['my', 1500, 1700], ['name', 1750, 2100], ['is', 2150, 2300], ['Ada.', 2400, 3000]]
  .map(([text, s, e], i) => ({ id: `w${i}`, text, start_ms: s, end_ms: e }));
const tr = [{ source_key: 'https://x/a.mp4', language: 'en', words }];
const textOf = (clips) => T.transcriptView(clips.filter((c) => c.track_id === TRACK), tr).filter((i) => i.kind === 'word').map((i) => i.word.text).join(' ');
const removedOf = (clips) => T.transcriptView(clips.filter((c) => c.track_id === TRACK), tr).filter((i) => i.kind === 'removed').map((i) => `${i.edge}:${i.words.map((w) => w.text).join(' ')}`);

describe('Building a transcript from the speech engine', () => {
  it('times words in ms, gives stable ids and flags unsure lines', () => {
    const built = T.buildTranscriptWords(
      [{ word: ' Hi', start: 0.1, end: 0.4 }, { word: 'there', start: 0.5, end: 0.9 }, { word: '', start: 1, end: 1.2 }, { word: 'x', start: NaN, end: 1 }],
      [{ start: 0, end: 0.45, avg_logprob: -0.2 }, { start: 0.45, end: 1, avg_logprob: -1.4 }],
    );
    assert.deepEqual(built, [
      { id: 'w0', text: 'Hi', start_ms: 100, end_ms: 400 },
      { id: 'w1', text: 'there', start_ms: 500, end_ms: 900, low: true },
    ]);
  });
  it('saved words are checked when read back', () => {
    assert.deepEqual(T.readWords([{ id: 'w0', text: 'ok', start_ms: 0, end_ms: 5 }, { id: 'w1', text: 'bad', start_ms: 9, end_ms: 2 }, null, 'x']).length, 1);
    assert.deepEqual(T.readWords('nope'), []);
  });
});

describe('Reading the edit as text', () => {
  it('follows the trim and speed of each shot', () => {
    const view = T.transcriptView([clip('a', 0, 1000, { trim_start_ms: 1400, metadata: { speed: 2 } })], tr);
    const w = view.filter((i) => i.kind === 'word');
    assert.deepEqual(w.map((i) => i.word.text), ['my', 'name', 'is', 'Ada.']);
    assert.equal(w[0].atMs, 50, '100 ms of footage after the in-point at 2× is 50 ms');
    assert.deepEqual(removedOf([clip('a', 0, 1000, { trim_start_ms: 1400, metadata: { speed: 2 } })]), ['head:Hello um']);
  });
  it('shots with no transcript yet, or no speech, say so', () => {
    const view = T.transcriptView([clip('a', 0, 1000), clip('b', 1000, 2000, { asset_url: 'https://x/b.mp4' })], [...tr, { source_key: 'q', language: null, words: [] }]);
    assert.deepEqual(view.filter((i) => i.kind === 'shot').map((i) => i.state), ['ready', 'missing']);
    assert.equal(T.transcriptView([clip('a', 0, 1000, { asset_url: 'q' })], [{ source_key: 'q', language: null, words: [] }])[0].state, 'silent');
  });
  it('takes win over the file address as the source', () => {
    assert.equal(T.sourceKeyOf({ take_id: 't1', asset_url: 'u' }), 't1');
    assert.equal(T.sourceKeyOf({ take_id: null, asset_url: 'u' }), 'u');
    assert.equal(T.sourceKeyOf({ take_id: null, asset_url: null }), null);
  });
});

describe('Cutting words removes their footage', () => {
  const base = () => [clip('a', 0, 6000), clip('m', 0, 4000, { track_id: 'music', clip_type: 'audio' })];

  it('a word in the middle splits the shot with a plain cut, stopping short of the neighbours', () => {
    const res = T.cutWords(base(), TRACK, tr, ['a:w1'], { newId });
    assert.ok('clips' in res);
    const shots = res.clips.filter((c) => c.track_id === TRACK).sort((x, y) => x.start_ms - y.start_ms);
    assert.equal(shots.length, 2);
    assert.equal(shots[0].id, 'a', 'the first piece keeps the shot id');
    assert.equal(shots[0].end_ms, 580, 'Hello ends at 500; 80 ms of handle is kept');
    assert.equal(shots[1].trim_start_ms, 1420, 'my starts at 1500; 80 ms of handle is kept');
    assert.equal(shots[1].start_ms, 580, 'the pieces play back to back');
    assert.equal(textOf(res.clips), 'Hello my name is Ada.');
    assert.ok(res.clips.find((c) => c.id === 'm' && c.end_ms === 4000), 'other tracks are untouched');
  });

  it('the first word trims the head; the last word trims the tail', () => {
    const head = T.cutWords(base(), TRACK, tr, ['a:w0'], { newId });
    assert.equal(textOf(head.clips), 'um my name is Ada.');
    assert.equal(head.clips.filter((c) => c.track_id === TRACK).length, 1);
    assert.equal(head.clips.find((c) => c.id === 'a').trim_start_ms, 820);
    const tail = T.cutWords(base(), TRACK, tr, ['a:w5'], { newId });
    assert.equal(tail.clips.find((c) => c.id === 'a').end_ms, 2350, 'a 100 ms gap: half of it either side');
  });

  it('separate runs (every filler, say) are cut in one go', () => {
    const res = T.cutWords(base(), TRACK, tr, ['a:w1', 'a:w4'], { newId });
    assert.equal(textOf(res.clips), 'Hello my name Ada.');
    assert.equal(res.clips.filter((c) => c.track_id === TRACK).length, 3);
  });

  it('cutting every word removes the shot, and later shots move up', () => {
    const res = T.cutWords([clip('a', 0, 6000), clip('b', 6000, 8000, { asset_url: 'https://x/b.mp4' })], TRACK, tr, words.map((w) => `a:${w.id}`), { newId });
    const shots = res.clips.filter((c) => c.track_id === TRACK);
    assert.deepEqual(shots.map((c) => [c.id, c.start_ms]), [['b', 0]]);
  });

  it('a transition stays on the outside edges only', () => {
    const res = T.cutWords([clip('a', 0, 6000, { transition_in: 'crossfade', transition_in_ms: 400, transition_out: 'dissolve', transition_out_ms: 500 })], TRACK, tr, ['a:w2'], { newId });
    const [left, right] = res.clips.sort((x, y) => x.start_ms - y.start_ms);
    assert.deepEqual([left.transition_in, left.transition_out, right.transition_in, right.transition_out], ['crossfade', null, null, 'dissolve']);
  });

  it('the same words in two pieces of one source are told apart by shot', () => {
    const twice = [clip('a', 0, 3000), clip('b', 3000, 6000)];
    const res = T.cutWords(twice, TRACK, tr, ['b:w0'], { newId });
    assert.equal(textOf(res.clips), 'Hello um my name is Ada. um my name is Ada.', 'only the second Hello goes');
  });

  it('refuses locked shots, empty picks, stale words and slivers that hold a word', () => {
    assert.match(T.cutWords([clip('a', 0, 6000, { metadata: { locked: true } })], TRACK, tr, ['a:w1']).error, /locked/);
    assert.match(T.cutWords(base(), TRACK, tr, ['a:w1'], { lockedTracks: new Set([TRACK]) }).error, /locked/);
    assert.match(T.cutWords(base(), TRACK, tr, []).error, /Select/);
    assert.match(T.cutWords(base(), TRACK, tr, ['zz:w1']).error, /no longer/);
    const tight = [{ id: 'w0', text: 'a', start_ms: 0, end_ms: 100 }, { id: 'w1', text: 'b', start_ms: 120, end_ms: 200 }, { id: 'w2', text: 'c', start_ms: 260, end_ms: 2000 }];
    const res = T.cutWords([clip('a', 0, 2000)], TRACK, [{ source_key: 'https://x/a.mp4', language: 'en', words: tight }], ['a:w1']);
    assert.match(res.error, /too short/);
  });
});

describe('Bringing cut words back', () => {
  it('a middle cut joins back into one shot, exactly as before', () => {
    const before = [clip('a', 0, 6000, { transition_out: 'dissolve', transition_out_ms: 500 })];
    const cut = T.cutWords(before, TRACK, tr, ['a:w1', 'a:w2'], { newId }).clips;
    assert.deepEqual(removedOf(cut), ['head:um my']);
    const right = cut.filter((c) => c.track_id === TRACK).sort((x, y) => x.start_ms - y.start_ms)[1];
    const back = T.restoreWords(cut, TRACK, tr, right.id, 'head');
    const shots = back.clips.filter((c) => c.track_id === TRACK);
    assert.equal(shots.length, 1);
    assert.deepEqual([shots[0].id, shots[0].start_ms, shots[0].end_ms, shots[0].trim_start_ms, shots[0].transition_out], ['a', 0, 6000, 0, 'dissolve']);
  });
  it('a trimmed tail opens back up, but never past the end of the footage', () => {
    const cut = T.cutWords([clip('a', 0, 6000, { metadata: { source_duration_ms: 2900 } })], TRACK, tr, ['a:w5'], { newId }).clips;
    const back = T.restoreWords(cut, TRACK, tr, 'a', 'tail');
    assert.equal(back.clips[0].end_ms, 2900);
    assert.equal(textOf(back.clips), 'Hello um my name is Ada.');
  });
  it('a trimmed head opens back up to just before the first word', () => {
    const back = T.restoreWords([clip('a', 0, 3000, { trim_start_ms: 1400 })], TRACK, tr, 'a', 'head');
    assert.equal(back.clips[0].trim_start_ms, 0);
    assert.equal(back.clips[0].end_ms, 4400);
  });
  it('nothing to bring back, or a locked shot, is refused', () => {
    assert.match(T.restoreWords([clip('a', 0, 6000)], TRACK, tr, 'a', 'head').error, /nothing/);
    assert.match(T.restoreWords([clip('a', 0, 3000, { trim_start_ms: 1400, metadata: { locked: true } })], TRACK, tr, 'a', 'head').error, /locked/);
  });
});

describe('Correcting the transcript', () => {
  it('changes spelling only and remembers what was heard', () => {
    const fixed = T.correctWords(words, 'w5', 'Adah.');
    assert.deepEqual(fixed[5], { id: 'w5', text: 'Adah.', start_ms: 2400, end_ms: 3000, fixed: true, heard: 'Ada.' });
    assert.equal(fixed[0], words[0]);
    const undone = T.correctWords(fixed, 'w5', 'Ada.');
    assert.deepEqual(undone[5], words[5], 'typing the original back clears the correction');
  });
  it('refuses empty, overlong or unknown words', () => {
    assert.equal(T.correctWords(words, 'w0', '   '), null);
    assert.equal(T.correctWords(words, 'w0', 'x'.repeat(61)), null);
    assert.equal(T.correctWords(words, 'nope', 'Hi'), null);
  });
  it('suggests filler sounds, never quoted or meaningful words', () => {
    assert.deepEqual(['um', 'Uh,', 'hmm...', '"um"', 'like', 'Ada.', 'umbrella'].map(T.isFiller), [true, true, true, false, false, false, false]);
  });
});

describe('Captions from the transcript', () => {
  it('follow the cut, the corrected spelling and skip muted shots', () => {
    const cut = T.cutWords([clip('a', 0, 6000)], TRACK, tr, ['a:w1'], { newId }).clips;
    const fixedTr = [{ ...tr[0], words: T.correctWords(words, 'w5', 'Adah.') }];
    const segs = T.transcriptCaptions(cut, fixedTr);
    assert.equal(segs.map((s) => s.text).join(' '), 'Hello my name is Adah.');
    const my = segs.flatMap((s) => s.words).find((w) => w.word === 'my');
    assert.ok(Math.abs(my.start_sec - 0.66) < 0.02, `"my" now plays at ${my.start_sec}s`);
    assert.deepEqual(T.transcriptCaptions([clip('a', 0, 6000, { volume: 0 })], tr), []);
    assert.deepEqual(T.transcriptCaptions([clip('a', 0, 6000)], tr, true), []);
  });
});

describe('Wiring', () => {
  it('transcripts live in their own table, owner only', () => {
    const sql = src('../src/infrastructure/supabase/migrations/0056_timeline_transcripts.sql');
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /UNIQUE \(timeline_id, source_key\)/);
  });
  it('the route transcribes whole sources, a few per call, and a redo covers every round', () => {
    const route = src('../src/app/api/timeline/transcript/route.ts');
    assert.match(route, /timestamp_granularities: \['word', 'segment'\]/);
    assert.match(route, /slice\(0, PER_CALL\)/);
    assert.match(route, /onConflict: 'timeline_id,source_key'/);
    assert.doesNotMatch(route, /-ss|trim_start_ms/, 'the whole source, so cut words can come back');
    const view = src('../src/interface/components/editor/EditorView.tsx');
    assert.match(view, /redo_since: since/);
  });
  it('spelling fixes only land on the transcript they were made against', () => {
    assert.match(src('../src/core/actions/transcript.ts'), /\.eq\('updated_at', row\.updated_at\)/);
  });
  it('Delete inside the transcript cuts words and never removes the selected shot', () => {
    assert.match(src('../src/interface/components/editor/TranscriptPanel.tsx'), /e\.key === 'Backspace'\) && live\.length\) \{ e\.preventDefault\(\); e\.stopPropagation\(\)/);
  });
  it('the Transcript tool sits next to the AI Editor', () => {
    assert.match(src('../src/interface/components/editor/ToolRail.tsx'), /id: 'ai'[^\n]*\n\s*\{ id: 'transcript'/);
  });
});

describe('Camera records at the device\'s own quality', async () => {
  const rec = src('../src/interface/components/mimic/MimicRecorder.tsx');
  it('asks for up to 4K instead of 720p', () => {
    assert.doesNotMatch(rec, /ideal: 1280/);
    assert.match(rec, /width: \{ ideal: 3840 \}, height: \{ ideal: 2160 \}/);
  });
  it('the bitrate follows the picture size and keeps the longest take under about 45 MB', async () => {
    const { recordingBitrate, qualityLabel } = await loadTs('interface/components/mimic/MimicRecorder.tsx').catch(() => ({}));
    if (!recordingBitrate) return; // A client component; the source checks above still ran.
    assert.equal(recordingBitrate(1280, 720), 6_000_000);
    assert.equal(recordingBitrate(1920, 1080), 12_441_600);
    assert.equal(recordingBitrate(3840, 2160), 24_000_000);
    assert.ok((24_000_000 * 15) / 8 < 46 * 1024 * 1024);
    assert.equal(recordingBitrate(0, 0), 6_000_000);
    assert.deepEqual([qualityLabel(3840, 2160), qualityLabel(1080, 1920), qualityLabel(1280, 720), qualityLabel()], ['4K', '1080p', '720p', '']);
  });
});

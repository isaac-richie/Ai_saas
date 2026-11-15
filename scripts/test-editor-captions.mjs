// Editor patch (Professional Editor spec 2.1, 2.6, 2.7, 8; QA T11).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';

const { buildSpeechMixArgs, audibleCues } = await loadTs('core/services/caption-audio.ts');
const { segmentsToVtt, segmentsToSrt, timelineCaptionSegments } = await loadTs('core/services/captions.ts');
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const cue = (extra = {}) => ({ path: '/tmp/a.mp4', startSec: 0, trimSec: 0, durationSec: 4, speed: 1, volume: 1, ...extra });

describe('Speech mix of the edit as it is now (T11)', () => {
  it('each shot is trimmed, sped and placed where it plays', () => {
    const args = buildSpeechMixArgs([cue(), cue({ path: '/tmp/b.mp4', startSec: 4, trimSec: 1.5, durationSec: 3, speed: 2 })], 7, '/tmp/out.mp3');
    const inputs = args.map((a, i) => (a === '-i' ? i : -1)).filter((i) => i >= 0);
    assert.equal(inputs.length, 2);
    assert.deepEqual(args.slice(inputs[1] - 4, inputs[1] + 2), ['-ss', '1.500', '-t', '6.000', '-i', '/tmp/b.mp4'], 'a 3 s shot at 2× uses 6 s of footage');
    const graph = args[args.indexOf('-filter_complex') + 1];
    assert.match(graph, /\[1:a:0\][^;]*atempo=2[^;]*adelay=4000:all=1/);
    assert.match(graph, /amix=inputs=2:duration=longest:normalize=0,atrim=0:7\.000\[out\]/);
    assert.deepEqual(args.slice(-7), ['-ac', '1', '-ar', '16000', '-b:a', '48k', '/tmp/out.mp3']);
  });

  it('muted shots are not captioned, and an edit with no sound is refused', () => {
    assert.equal(audibleCues([cue({ volume: 0 }), cue()]).length, 1);
    assert.throws(() => buildSpeechMixArgs([cue({ volume: 0 })], 4, '/tmp/x.mp3'), /No shot in this edit has sound/);
  });

  it('a real clip mixes to mono 16 kHz speech audio', async (t) => {
    let ffmpeg;
    try { ffmpeg = createRequire(import.meta.url)('ffmpeg-static'); } catch { t.skip('ffmpeg is not installed'); return; }
    const { probeMedia } = await loadTs('core/services/media-probe.ts');
    const clip = new URL('../public/landing-720.mp4', import.meta.url).pathname;
    if (!(await probeMedia(ffmpeg, clip)).hasAudio) { t.skip('sample clip has no sound'); return; }
    const { execFile } = await import('node:child_process');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'speech-mix-'));
    try {
      const out = join(dir, 'speech.mp3');
      await new Promise((resolve, reject) => execFile(ffmpeg, buildSpeechMixArgs([cue({ path: clip, durationSec: 2 }), cue({ path: clip, startSec: 2, trimSec: 1, durationSec: 2 })], 4, out), (e) => (e ? reject(e) : resolve())));
      const info = await probeMedia(ffmpeg, out);
      assert.equal(info.hasAudio, true);
      assert.ok(Math.abs(info.durationSec - 4) < 0.3, `mix is ${info.durationSec} s`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Subtitle files (spec 8)', () => {
  const clips = [
    { start_ms: 4000, end_ms: 6000, metadata: { text: 'Second line', source: 'auto' } },
    { start_ms: 0, end_ms: 2500, metadata: { text: 'Hello VisioWave', source: 'auto' } },
    { start_ms: 1000, end_ms: 3000, metadata: { text: 'A typed title' } },
    { start_ms: 7000, end_ms: 7000, metadata: { text: 'zero length', source: 'auto' } },
    { start_ms: 8000, end_ms: 9000, metadata: { text: '  ', source: 'auto' } },
  ];
  it('only timed speech captions, in order; titles stay out unless asked for', () => {
    assert.deepEqual(timelineCaptionSegments(clips).map((s) => s.text), ['Hello VisioWave', 'Second line']);
    assert.deepEqual(timelineCaptionSegments(clips, { includeTitles: true }).map((s) => s.text), ['Hello VisioWave', 'A typed title', 'Second line']);
  });
  it('VTT has its header and dotted milliseconds; SRT keeps commas', () => {
    const segs = timelineCaptionSegments(clips);
    const vtt = segmentsToVtt(segs);
    assert.ok(vtt.startsWith('WEBVTT\n\n'));
    assert.match(vtt, /00:00:00\.000 --> 00:00:02\.500\nHello VisioWave\n/);
    assert.match(segmentsToSrt(segs), /^1\n00:00:00,000 --> 00:00:02,500\nHello VisioWave\n/);
  });
});

describe('Wiring (spec 2.1, 2.6, 2.7)', () => {
  const route = src('../src/app/api/timeline/captions/route.ts');
  it('auto captions no longer need an exported video', () => {
    assert.doesNotMatch(route, /storage_key|Render the video first/);
    assert.match(route, /buildSpeechMixArgs\(cues, totalSec, audio\)/);
    assert.match(route, /timelineToOutputMs\(videoClips, clip\.start_ms\)/);
    assert.doesNotMatch(src('../src/interface/components/editor/EditorView.tsx'), /storage_key: render\.storageKey/);
    assert.doesNotMatch(src('../src/interface/components/editor/TextPanel.tsx'), /hasRender/);
  });
  it('re-running replaces only automatic captions, never typed titles', () => {
    assert.match(route, /\.eq\('metadata->>source', 'auto'\)/);
  });
  it('Music is Audio, Make video is Export video, and the AI Director makes no claim to see every shot', () => {
    assert.match(src('../src/interface/components/editor/ToolRail.tsx'), /label: 'Audio', title: 'Audio'/);
    const editor = ['EditorWorkspace.tsx', 'ExportSheet.tsx', 'FormatPanel.tsx', 'AgentPanel.tsx'].map((f) => src(`../src/interface/components/editor/${f}`)).join('\n');
    assert.doesNotMatch(editor, /Make video|I can see every shot/);
  });
});

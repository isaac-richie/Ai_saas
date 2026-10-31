import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';

const run = promisify(execFile);
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
const { detectBeats, decodeMono, ANALYSIS_RATE } = await loadTs('core/services/beat-detect.ts');

// A drum-like click track: decaying noise bursts on each beat over quiet noise.
function clickTrack({ bpm, seconds, offset = 0, swing = 0, seed = 1 }) {
  const out = new Float32Array(Math.round(seconds * ANALYSIS_RATE));
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1;
  for (let i = 0; i < out.length; i++) out[i] = rand() * 0.01;
  const times = [];
  for (let k = 0, t = offset; t < seconds; k++, t = offset + (k * 60) / bpm + (k % 2 ? swing : 0)) {
    times.push(t);
    const start = Math.round(t * ANALYSIS_RATE);
    for (let i = 0; i < 2000 && start + i < out.length; i++) out[start + i] += rand() * 0.8 * Math.exp(-i / 300);
  }
  return { samples: out, times };
}

function alignmentError(found, truth) {
  return truth.slice(1, -1).map((t) => Math.min(...found.map((b) => Math.abs(b - t))));
}

describe('detectBeats on synthetic drums', () => {
  for (const bpm of [70, 97, 120, 128, 150, 174]) {
    it(`finds ${bpm} BPM and lands on the beats`, () => {
      const { samples, times } = clickTrack({ bpm, seconds: 20, offset: 0.37 });
      const r = detectBeats(samples);
      // Half or double time is an accepted reading (174 BPM drum & bass is often felt at 87).
      const level = [1, 0.5, 2].find((m) => Math.abs(r.bpm - bpm * m) <= 2 * m);
      assert.ok(level, `bpm ${r.bpm} is not ${bpm} or a half/double of it`);
      // Every detected beat must sit on a real hit...
      const offHit = r.beats.filter((b) => b > 0.5 && b < 19.5).map((b) => Math.min(...times.map((t) => Math.abs(b - t))));
      assert.ok(Math.max(...offHit) < 0.035, `worst beat error ${Math.max(...offHit).toFixed(3)}s`);
      // ...and none may be skipped at the chosen tempo.
      const expected = (20 * r.bpm) / 60;
      assert.ok(r.beats.length >= expected * 0.9, `${r.beats.length} beats, expected about ${expected.toFixed(0)}`);
      if (level === 1) assert.ok(Math.max(...alignmentError(r.beats, times)) < 0.035);
      assert.ok(r.confidence > 0.1);
    });
  }

  it('beats are strictly increasing and inside the audio', () => {
    const { samples } = clickTrack({ bpm: 120, seconds: 12 });
    const r = detectBeats(samples);
    for (let i = 1; i < r.beats.length; i++) assert.ok(r.beats[i] > r.beats[i - 1]);
    assert.ok(r.beats.every((b) => b >= 0 && b <= 12));
  });

  it('tolerates a little swing', () => {
    const { samples } = clickTrack({ bpm: 100, seconds: 20, swing: 0.02 });
    assert.ok(Math.abs(detectBeats(samples).bpm - 100) <= 2);
  });

  it('returns nothing for silence or very short audio', () => {
    assert.deepEqual(detectBeats(new Float32Array(ANALYSIS_RATE * 10)).beats, []);
    assert.equal(detectBeats(clickTrack({ bpm: 120, seconds: 2 }).samples).bpm, 0);
  });

  it('rejects the wrong sample rate instead of mis-timing', () => {
    assert.equal(detectBeats(clickTrack({ bpm: 120, seconds: 10 }).samples, 44100).bpm, 0);
  });
});

describe('decode and detect a real encoded file', () => {
  let dir;
  before(async () => { dir = await mkdtemp(join(tmpdir(), 'vw-beats-')); });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('decodes an mp3 at 128 BPM with a bass line and still finds the tempo', async () => {
    const file = join(dir, 'song.mp3');
    const p = 60 / 128;
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i',
      `aevalsrc='0.7*sin(2*PI*1200*t)*exp(-45*mod(t,${p}))+0.25*sin(2*PI*55*t)':s=44100:d=16`,
      '-c:a', 'libmp3lame', '-b:a', '128k', file]);
    const samples = await decodeMono(ffmpeg, file);
    assert.ok(Math.abs(samples.length / ANALYSIS_RATE - 16) < 0.2);
    const r = detectBeats(samples);
    assert.ok(Math.abs(r.bpm - 128) <= 2, `bpm ${r.bpm}`);
  });
});

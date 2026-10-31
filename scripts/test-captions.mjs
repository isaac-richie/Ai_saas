import { describe, it, before, after } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { formatSrtTime, formatAssTime, segmentsToSrt, parseSrt, segmentsToAss, wordsToCaptionSegments, buildCaptionBurnInArgs, CAPTION_STYLES } = await loadTs('core/services/captions.ts');

describe('SRT generation', () => {
  it('generates valid SRT from segments', () => {
    const srt = segmentsToSrt([
      { start_sec: 0, end_sec: 2.5, text: 'Hello world' },
      { start_sec: 3, end_sec: 5, text: 'Second line' },
    ]);
    assert.ok(srt.includes('1\n00:00:00,000 --> 00:00:02,500\nHello world'));
    assert.ok(srt.includes('2\n00:00:03,000 --> 00:00:05,000\nSecond line'));
  });

  it('handles hours correctly', () => {
    const srt = segmentsToSrt([{ start_sec: 3661.5, end_sec: 3665, text: 'Late' }]);
    assert.ok(srt.includes('01:01:01,500'));
  });

  it('handles empty segments', () => {
    assert.equal(segmentsToSrt([]), '');
  });
});

describe('SRT parsing', () => {
  it('parses standard SRT', () => {
    const srt = `1\n00:00:01,000 --> 00:00:03,500\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond line`;
    const segs = parseSrt(srt);
    assert.equal(segs.length, 2);
    assert.equal(segs[0].start_sec, 1);
    assert.equal(segs[0].end_sec, 3.5);
    assert.equal(segs[0].text, 'Hello world');
  });

  it('handles multiline captions', () => {
    const srt = `1\n00:00:01,000 --> 00:00:03,000\nLine one\nLine two`;
    const segs = parseSrt(srt);
    assert.equal(segs[0].text, 'Line one\nLine two');
  });

  it('handles period separator', () => {
    const srt = `1\n00:00:01.000 --> 00:00:03.000\nTest`;
    const segs = parseSrt(srt);
    assert.equal(segs.length, 1);
  });

  it('skips malformed blocks', () => {
    const srt = `1\nbad timing\nText\n\n2\n00:00:01,000 --> 00:00:02,000\nGood`;
    const segs = parseSrt(srt);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].text, 'Good');
  });

  it('round-trips through generate and parse', () => {
    const original = [
      { start_sec: 1.5, end_sec: 3.75, text: 'Hello' },
      { start_sec: 5, end_sec: 8, text: 'World' },
    ];
    const parsed = parseSrt(segmentsToSrt(original));
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].text, 'Hello');
    assert.ok(Math.abs(parsed[0].start_sec - 1.5) < 0.01);
    assert.ok(Math.abs(parsed[0].end_sec - 3.75) < 0.01);
  });
});

describe('ASS generation', () => {
  it('generates valid ASS with header', () => {
    const ass = segmentsToAss([{ start_sec: 0, end_sec: 2, text: 'Test' }], 'standard');
    assert.ok(ass.includes('[Script Info]'));
    assert.ok(ass.includes('[V4+ Styles]'));
    assert.ok(ass.includes('[Events]'));
    assert.ok(ass.includes('Dialogue: 0,'));
  });

  it('uses the shipped font and sizes relative to the frame', () => {
    const ass = segmentsToAss([{ start_sec: 0, end_sec: 2, text: 'Bold' }], 'bold_center', 1920, 1080);
    assert.ok(ass.includes('Style: bold_center,Noto Sans,118.8,'));
    const vertical = segmentsToAss([{ start_sec: 0, end_sec: 2, text: 'Bold' }], 'bold_center', 1080, 1920);
    assert.ok(vertical.includes('Style: bold_center,Noto Sans,118.8,'), 'same size on the short side for vertical video');
  });

  it('declares every style used by any caption', () => {
    const ass = segmentsToAss([{ start_sec: 0, end_sec: 1, text: 'a', style: 'karaoke' }, { start_sec: 1, end_sec: 2, text: 'b', style: 'nope' }], 'standard');
    assert.ok(ass.includes('Style: karaoke,') && ass.includes('Style: standard,'));
    assert.ok(ass.includes('Dialogue: 0,0:00:01.00,0:00:02.00,standard,'), 'unknown style falls back');
  });

  it('drops empty and zero-length captions', () => {
    const ass = segmentsToAss([{ start_sec: 1, end_sec: 1, text: 'x' }, { start_sec: 0, end_sec: 1, text: '   ' }]);
    assert.ok(!ass.includes('Dialogue:'));
  });

  it('every style has a label and sane sizes', () => {
    for (const [id, c] of Object.entries(CAPTION_STYLES)) {
      assert.ok(c.label, id);
      assert.ok(c.size > 0.02 && c.size < 0.12, id);
    }
  });

  it('generates karaoke tags from word timestamps', () => {
    const ass = segmentsToAss(
      [{ start_sec: 0, end_sec: 2, text: 'Hello world', words: [
        { word: 'Hello', start_sec: 0, end_sec: 0.8 },
        { word: 'world', start_sec: 0.9, end_sec: 1.5 },
      ]}],
      'karaoke',
    );
    assert.ok(ass.includes('{\\kf80}Hello'), ass);
    assert.ok(ass.includes('{\\kf60}world'));
  });

  it('uses PlayRes matching video dimensions', () => {
    const ass = segmentsToAss([{ start_sec: 0, end_sec: 1, text: 'X' }], 'standard', 3840, 2160);
    assert.ok(ass.includes('PlayResX: 3840'));
    assert.ok(ass.includes('PlayResY: 2160'));
  });

  it('handles newlines in text', () => {
    const ass = segmentsToAss([{ start_sec: 0, end_sec: 1, text: 'Line one\nLine two' }]);
    assert.ok(ass.includes('Line one\\NLine two'));
  });
});

describe('ASS time formatting', () => {
  it('formats zero correctly', () => {
    assert.equal(formatAssTime(0), '0:00:00.00');
  });

  it('formats sub-second correctly', () => {
    assert.equal(formatAssTime(0.55), '0:00:00.55');
  });

  it('formats minutes correctly', () => {
    assert.equal(formatAssTime(125.5), '0:02:05.50');
  });

  it('formats hours correctly', () => {
    assert.equal(formatAssTime(3661.25), '1:01:01.25');
  });
});

describe('Timestamp rounding edge cases', () => {
  it('SRT never emits 1000 milliseconds', () => {
    assert.equal(formatSrtTime(1.9996), '00:00:02,000');
    assert.equal(formatSrtTime(59.9999), '00:01:00,000');
  });
  it('ASS never emits 100 centiseconds', () => {
    assert.equal(formatAssTime(1.996), '0:00:02.00');
    assert.equal(formatAssTime(3599.999), '1:00:00.00');
  });
  it('handles negative or NaN input as zero', () => {
    assert.equal(formatSrtTime(-1), '00:00:00,000');
    assert.equal(formatAssTime(Number.NaN), '0:00:00.00');
  });
  it('ASS text cannot inject override tags', () => {
    const ass = segmentsToAss([{ start_sec: 0, end_sec: 1, text: 'hi {\\pos(0,0)} there \\N\\h' }]);
    assert.ok(!ass.includes('{\\pos'));
    assert.ok(!ass.split('\n').pop().includes('\\'), 'user backslashes are removed');
  });
});

describe('wordsToCaptionSegments', () => {
  const w = (word, start, end) => ({ word, start_sec: start, end_sec: end });
  it('breaks at sentence ends', () => {
    const segs = wordsToCaptionSegments([w('Hello.', 0, 0.4), w('Next', 0.5, 0.8), w('line', 0.9, 1.2)]);
    assert.deepEqual(segs.map((s) => s.text), ['Hello.', 'Next line']);
  });
  it('breaks on pauses', () => {
    const segs = wordsToCaptionSegments([w('one', 0, 0.3), w('two', 2, 2.3)]);
    assert.equal(segs.length, 2);
  });
  it('keeps lines short enough to read', () => {
    const words = 'the quick brown fox jumps over the lazy dog again and again until night'.split(' ').map((x, i) => w(x, i * 0.25, i * 0.25 + 0.2));
    for (const seg of wordsToCaptionSegments(words, { maxChars: 20 })) assert.ok(seg.text.length <= 20, seg.text);
  });
  it('lines never overlap and each is visible long enough', () => {
    const words = Array.from({ length: 30 }, (_, i) => w(`w${i}`, i * 0.3, i * 0.3 + 0.1));
    const segs = wordsToCaptionSegments(words);
    for (let i = 0; i < segs.length; i++) {
      assert.ok(segs[i].end_sec > segs[i].start_sec);
      if (segs[i + 1]) assert.ok(segs[i].end_sec <= segs[i + 1].start_sec);
    }
  });
  it('ignores blank and invalid words, sorts by time', () => {
    const segs = wordsToCaptionSegments([w(' ', 0, 1), w('b', 2, 2.2), w('a', 1, 1.2), w('x', NaN, 1)]);
    assert.equal(segs.map((s) => s.text).join(' '), 'a b');
  });
  it('empty in, empty out', () => assert.deepEqual(wordsToCaptionSegments([]), []));
});

describe('caption burn-in with the bundled ffmpeg', () => {
  const ffmpeg = createRequire(import.meta.url)('ffmpeg-static');
  const fonts = fileURLToPath(new URL('../assets/fonts', import.meta.url));
  const run = promisify(execFile);
  let dir;
  before(async () => { dir = await mkdtemp(join(tmpdir(), 'vw caps [x],y;z-')); });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  const brightPixels = async (file, t) => {
    const { stdout } = await run(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { encoding: 'buffer', maxBuffer: 1 << 24 });
    return [...stdout].filter((v) => v > 60).length;
  };

  for (const style of Object.keys(CAPTION_STYLES)) {
    it(`draws "${style}" text only while the caption is on screen`, async () => {
      const video = join(dir, `${style}.mp4`);
      await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=24:d=4', '-pix_fmt', 'yuv420p', video]);
      const assPath = join(dir, `${style}.ass`);
      await writeFile(assPath, segmentsToAss([{ start_sec: 1, end_sec: 3, text: 'Made with VisioWave', style, words: [{ word: 'Made', start_sec: 1, end_sec: 1.5 }, { word: 'with', start_sec: 1.5, end_sec: 2 }, { word: 'VisioWave', start_sec: 2, end_sec: 3 }] }], 'standard', 640, 360));
      const out = join(dir, `${style}-out.mp4`);
      await run(ffmpeg, buildCaptionBurnInArgs(video, assPath, out, fonts));
      assert.ok((await brightPixels(out, 2.5)) > 250, 'caption visible at 2.5s');
      assert.equal(await brightPixels(out, 0.5), 0, 'nothing drawn before the caption');
      assert.equal(await brightPixels(out, 3.5), 0, 'nothing drawn after the caption');
    });
  }
});

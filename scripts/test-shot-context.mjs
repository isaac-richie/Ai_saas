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
const { describeShot, shotInfoFromStoryboard, isOwnStorageUrl, frameAt, mapLimited } = await loadTs('core/services/shot-context.ts');
const { describeTimelineForAgent, AGENT_INSTRUCTIONS } = await loadTs('core/services/edit-agent.ts');

const SUPA = 'https://abc.supabase.co';

describe('what the AI editor knows about each shot', () => {
  it('prefers the prompt the generator received and keeps the subject', () => {
    const info = shotInfoFromStoryboard({ subject: 'Ada', prompt: 'woman on a cliff', enhanced_prompt: 'Close-up of a woman on a cliff at sunset, wind in her hair' }, 'Opening');
    assert.equal(info.scene, 'Opening');
    assert.match(describeShot(info), /^Ada: Close-up of a woman/);
  });
  it('does not repeat a subject already in the prompt, and stays short', () => {
    assert.equal(describeShot({ subject: 'sunset', prompt: 'A slow pan across the sunset' }), 'A slow pan across the sunset');
    assert.ok(describeShot({ prompt: 'x'.repeat(2000) }).length <= 320);
    assert.equal(describeShot(null), '');
  });
  it('appears in the timeline the AI sees, and the AI is told to use it', () => {
    const t = describeTimelineForAgent({ clips: [{ id: 'a', start_ms: 0, end_ms: 2000, volume: 1, transition_out: null, transition_out_ms: 0, metadata: {}, shows: 'sunset over the sea', scene: 'Ending' }], timeline_grade_id: 'natural' });
    assert.equal(t.clips[0].shows, 'sunset over the sea');
    assert.equal(t.clips[0].scene, 'Ending');
    assert.match(AGENT_INSTRUCTIONS, /still frame per clip/);
  });
});

describe('only our own storage is opened by ffmpeg', () => {
  it('accepts public objects in our project', () => {
    assert.ok(isOwnStorageUrl(`${SUPA}/storage/v1/object/public/renders/u/a.mp4`, SUPA));
  });
  it('rejects everything else', () => {
    for (const bad of [
      'https://evil.com/storage/v1/object/public/a.mp4',
      `http://abc.supabase.co/storage/v1/object/public/a.mp4`,
      `${SUPA}/rest/v1/projects`,
      'file:///etc/passwd',
      'https://user:pw@abc.supabase.co/storage/v1/object/public/a.mp4',
      'https://abc.supabase.co.evil.com/storage/v1/object/public/a.mp4',
      'concat:a|b', null, 42,
    ]) assert.equal(isOwnStorageUrl(bad, SUPA), false, String(bad));
    assert.equal(isOwnStorageUrl(`${SUPA}/storage/v1/object/public/a.mp4`, undefined), false);
  });
});

describe('frames from footage (real ffmpeg)', () => {
  let dir;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vw-frames-'));
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=2', '-pix_fmt', 'yuv420p', join(dir, 'a.mp4')]);
  });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('returns a small JPEG data URL', async () => {
    const url = await frameAt(ffmpeg, join(dir, 'a.mp4'), 1);
    assert.match(url, /^data:image\/jpeg;base64,/);
    assert.ok(url.length < 80_000);
  });
  it('gives null, not an error, for unreadable footage', async () => {
    assert.equal(await frameAt(ffmpeg, join(dir, 'missing.mp4'), 0), null);
  });
  it('runs jobs in order with a limit', async () => {
    let active = 0, peak = 0;
    const out = await mapLimited([1, 2, 3, 4, 5, 6], 2, async (n) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return n * 10; });
    assert.deepEqual(out, [10, 20, 30, 40, 50, 60]);
    assert.ok(peak <= 2);
  });
});

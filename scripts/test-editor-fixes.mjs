// Editor fixes brief (17 Nov 2026): E1 Duplicate, E2 generated-shot picker, E3 Download video.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './load-ts.mjs';

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const { isVideoTake, buildClipLibrary, defaultClipSource, filterClips } = await loadTs('core/services/clip-library.ts');
const { renderKeyFromUrl, isOwnRenderKey, exportFileName } = await loadTs('core/services/export-download.ts');
const { duplicateClip } = await loadTs('core/services/timeline-ops.ts');
const { useTimelineStore } = await loadTs('interface/hooks/use-timeline-store.ts');
const { diffTimeline } = await loadTs('interface/lib/timeline-diff.ts');

// ─── E2: which videos the picker offers ─────────────────────────────────────────────────────────

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const take = (url, extra = {}) => ({ output_url: url, status: 'completed', duration_seconds: 5, take_number: 1, created_at: '2026-11-17T10:00:00Z', ...extra });

describe('E2: a finished take is offered only when it is a video', () => {
  it('trusts the take’s own output type first', () => {
    assert.equal(isVideoTake({ output_url: 'https://x/storage/v1/object/public/a/s.png', parameters: { output_type: 'video' } }), true);
    assert.equal(isVideoTake({ output_url: 'https://x/storage/v1/object/public/a/s.mp4', parameters: { output_type: 'image' } }), false);
  });
  it('falls back to the file type for older takes', () => {
    assert.equal(isVideoTake({ output_url: 'https://x/clip.MP4?token=1' }), true);
    assert.equal(isVideoTake({ output_url: 'https://x/still.jpg' }), false);
    assert.equal(isVideoTake({ output_url: 'https://tempfile.aiquickdraw.com/p/abc' }), true);
  });
  it('never offers a pending or empty take', () => {
    assert.equal(isVideoTake({ output_url: 'pending_generation', parameters: { output_type: 'video' } }), false);
    assert.equal(isVideoTake({ output_url: null }), false);
  });
});

describe('E2: the clip library', () => {
  const projectName = new Map([[P1, 'Golden Hour'], [P2, 'Sam’s Morning']]);
  const sceneProject = new Map([['s1', P1], ['s2', P2], ['s-foreign', 'not-mine']]);
  const library = () => buildClipLibrary({
    projectName,
    sceneProject,
    storyboard: [
      { url: 'https://x/sb1.mp4', duration_seconds: 4, subject: 'Pour', project_id: P1, created_at: '2026-11-17T09:00:00Z' },
      { url: 'https://x/theirs.mp4', duration_seconds: 4, subject: 'Not mine', project_id: OTHER, created_at: '2026-11-17T12:00:00Z' },
    ],
    shots: [
      { name: 'Sunrise', scene_id: 's1', shot_generations: [
        take('https://x/t1.mp4', { take_number: 2, duration_seconds: 7, created_at: '2026-11-17T11:00:00Z' }),
        take('https://x/still.png', { parameters: { output_type: 'image' } }),
        take('https://x/failed.mp4', { status: 'failed' }),
        take('pending_generation', { status: 'processing' }),
      ] },
      { name: 'Kettle', scene_id: 's2', shot_generations: [take('https://x/sb1.mp4', { created_at: '2026-11-17T08:00:00Z' })] },
      { name: 'Foreign', scene_id: 's-foreign', shot_generations: [take('https://x/foreign.mp4')] },
    ],
  });

  it('lists only finished videos, newest first, once each', () => {
    assert.deepEqual(library().map((c) => c.url), ['https://x/t1.mp4', 'https://x/sb1.mp4']);
  });
  it('never includes another creator’s project', () => {
    assert.ok(!library().some((c) => c.url.includes('theirs') || c.url.includes('foreign')));
  });
  it('keeps each clip’s real length and names its take', () => {
    const t1 = library()[0];
    assert.equal(t1.durationMs, 7000);
    assert.equal(t1.title, 'Sunrise · take 2');
    assert.equal(t1.source, 'Golden Hour');
  });
  it('opens on this project when it has clips, otherwise on everything', () => {
    assert.equal(defaultClipSource(library(), P1), 'this');
    assert.equal(defaultClipSource(library(), P2), 'all', 'the shared file belongs to P1, so P2 has none of its own');
    assert.equal(defaultClipSource(library(), 'blank-edit'), 'all', 'a fresh edit from the device starts on all videos');
    assert.equal(defaultClipSource([], P1), 'all');
  });
  it('filters by this project, other projects or all', () => {
    const lib = library();
    assert.equal(filterClips(lib, 'this', P1).length, 2);
    assert.equal(filterClips(lib, 'other', P1).length, 0);
    assert.equal(filterClips(lib, 'all', 'x').length, 2);
  });
});

describe('E2: failures are never shown as an empty library', () => {
  const hub = src('core/actions/editor-hub.ts');
  const timeline = src('core/actions/timeline.ts');
  it('the library reports failed lookups as errors', () => {
    assert.match(hub, /if \(projectsError\) return failed;/);
    assert.match(hub, /if \(storyboard\.error \|\| scenes\.error\) return failed;/);
    assert.match(hub, /if \(res\.error\) return failed;/);
  });
  it('the one-tap import used by Edit it for me does the same, and skips still images', () => {
    assert.match(timeline, /if \(storyboardError\) return loadFailed;/);
    assert.match(timeline, /if \(scenesError\) return loadFailed;/);
    assert.match(timeline, /if \(!filmTakes\) return loadFailed;/);
    assert.match(timeline, /t\.status === 'completed' && isVideoTake\(t\)/);
  });
  it('the empty editor’s button opens the picker instead of importing only this project', () => {
    assert.match(src('interface/components/editor/EditorWorkspace.tsx'), /onClick=\{\(\) => \(props\.onAddLibraryClips \? setAddingClips\(true\) : props\.onImport\(\)\)\}[^\n]*\n\s*\{props\.importing[^\n]*Add my generated shots/);
  });
  it('the picker has loading, empty, error and Retry states, and points device-only videos to From my device', () => {
    const dialog = src('interface/components/editor/AddClipsDialog.tsx');
    assert.match(dialog, /Loading your clips/);
    assert.match(dialog, />Retry</);
    assert.match(dialog, /No finished videos yet\./);
    assert.match(dialog, /only on your computer\? Add it with From my phone or computer/);
  });
});

// ─── E3: Download video saves a file ────────────────────────────────────────────────────────────

describe('E3: download links', () => {
  const SB = 'https://abc.supabase.co';
  const key = `${ME}/timeline/${P1}/${P2}/render-1763412345678.mp4`;
  const url = `${SB}/storage/v1/object/public/renders/${key}`;

  it('finds the export behind its public link', () => {
    assert.equal(renderKeyFromUrl(url, SB), key);
    assert.equal(renderKeyFromUrl(url.replace('.mp4', '-9x16.mp4'), SB), key.replace('.mp4', '-9x16.mp4'));
  });
  it('refuses links to other sites, other buckets and odd paths', () => {
    assert.equal(renderKeyFromUrl(url.replace('abc.supabase.co', 'evil.example'), SB), null);
    assert.equal(renderKeyFromUrl(url.replace('/renders/', '/elements/'), SB), null);
    assert.equal(renderKeyFromUrl(`${SB}/storage/v1/object/public/renders/${ME}/timeline/../../x.mp4`, SB), null);
    assert.equal(renderKeyFromUrl(`${SB}/storage/v1/object/public/renders/${ME}%2F..%2Fsecret.mp4`, SB), null);
    assert.equal(renderKeyFromUrl('not a url', SB), null);
    assert.equal(renderKeyFromUrl(url, undefined), null);
  });
  it('hands out only the signed-in creator’s own exports', () => {
    assert.equal(isOwnRenderKey(key, ME), true);
    assert.equal(isOwnRenderKey(key, OTHER), false);
  });
  it('names the file after the edit, safely, as .mp4', () => {
    assert.equal(exportFileName('Golden Hour — teaser!', key), 'Golden Hour teaser.mp4');
    assert.equal(exportFileName('Café ../../etc/passwd', key), 'Cafe etc passwd.mp4');
    assert.equal(exportFileName('', key), 'Visiowave video.mp4');
    assert.equal(exportFileName(null, key.replace('.mp4', '-9x16.mp4')), 'Visiowave video (vertical).mp4');
    assert.equal(exportFileName('Ad', key.replace('.mp4', '-1x1.mp4')), 'Ad (square).mp4');
    assert.ok(exportFileName('x'.repeat(500), key).length <= 84);
  });
  it('the sheet never opens the video in a new tab', () => {
    const sheet = src('interface/components/editor/ExportSheet.tsx');
    assert.doesNotMatch(sheet, /target="_blank"[^>]*download/);
    assert.doesNotMatch(sheet, /<a [^>]*download/);
    assert.match(sheet, /getExportDownloadLink\(url, title\)/);
    assert.match(sheet, /Starting download…/);
    assert.match(sheet, /Download started\. Check your browser&apos;s downloads\./);
  });
  it('the server serves the file as an attachment with a fresh, short-lived link', () => {
    const timeline = src('core/actions/timeline.ts');
    assert.match(timeline, /createSignedUrl\(key, 10 \* 60, \{ download: fileName \}\)/);
    assert.match(timeline, /if \(!key \|\| !isOwnRenderKey\(key, user\.id\)\)/);
  });
});

// ─── E1: Duplicate ──────────────────────────────────────────────────────────────────────────────

const clip = (id, track_id, start, end, extra = {}) => ({
  id, track_id, take_id: null, asset_url: `https://x/${id}.mp4`, clip_type: 'video', start_ms: start, end_ms: end, trim_start_ms: 0, trim_end_ms: null,
  volume: 1, opacity: 1, transition_in: null, transition_in_ms: 0, transition_out: null, transition_out_ms: 0, color_grade_id: null,
  metadata: {}, order_index: 0, created_at: '', updated_at: '', ...extra,
});
const spans = (cs, track = 'v') => cs.filter((c) => c.track_id === track).sort((a, b) => a.start_ms - b.start_ms).map((c) => [c.id, c.start_ms, c.end_ms]);

describe('E1: duplicateClip', () => {
  it('Image 2: duplicating the 7 s first shot gives 7 + 7 + 4 = 18 s', () => {
    const out = duplicateClip([clip('a', 'v', 0, 7000), clip('b', 'v', 7000, 11000)], 'a', 'copy');
    assert.equal(out.ok, true);
    assert.deepEqual(spans(out.clips), [['a', 0, 7000], ['copy', 7000, 14000], ['b', 14000, 18000]]);
  });
  it('keeps footage, trim, speed, volume, fades, look and transition, as its own clip', () => {
    const src0 = clip('a', 'v', 0, 3000, { trim_start_ms: 1200, volume: 0.4, color_grade_id: 'noir', transition_out: 'crossfade', transition_out_ms: 500, metadata: { speed: 2, fade_in_sec: 1, source_duration_ms: 9000, film_shot_id: 'fs1' } });
    const out = duplicateClip([src0], 'a', 'copy');
    const copy = out.clips.find((c) => c.id === 'copy');
    for (const k of ['asset_url', 'trim_start_ms', 'volume', 'color_grade_id', 'transition_out', 'transition_out_ms']) assert.deepEqual(copy[k], src0[k], k);
    assert.deepEqual(copy.metadata, src0.metadata);
    assert.notEqual(copy.metadata, src0.metadata, 'its own settings object, so editing the copy never edits the original');
    assert.equal(copy.end_ms - copy.start_ms, 3000);
  });
  it('a clip in the middle pushes only the later clips', () => {
    const out = duplicateClip([clip('a', 'v', 0, 2000), clip('b', 'v', 2000, 5000), clip('c', 'v', 5000, 6000)], 'b', 'copy');
    assert.deepEqual(spans(out.clips), [['a', 0, 2000], ['b', 2000, 5000], ['copy', 5000, 8000], ['c', 8000, 9000]]);
  });
  it('audio: the copy follows the song and later songs move; video and text never move', () => {
    const before = [clip('v1', 'v', 0, 4000), clip('m1', 'm', 1000, 3000, { clip_type: 'audio' }), clip('m2', 'm', 6000, 8000, { clip_type: 'audio' }), clip('t1', 't', 2500, 3500)];
    const out = duplicateClip(before, 'm1', 'copy');
    assert.deepEqual(spans(out.clips, 'm'), [['m1', 1000, 3000], ['copy', 3000, 5000], ['m2', 8000, 10000]]);
    assert.deepEqual(spans(out.clips, 'v'), [['v1', 0, 4000]]);
    assert.deepEqual(spans(out.clips, 't'), [['t1', 2500, 3500]]);
  });
  it('a song that already overlapped the original keeps the same overlap with the copy, never more', () => {
    const out = duplicateClip([clip('m1', 'm', 0, 4000), clip('m2', 'm', 3000, 5000)], 'm1', 'copy');
    assert.deepEqual(spans(out.clips, 'm'), [['m1', 0, 4000], ['copy', 4000, 8000], ['m2', 7000, 9000]]);
  });
  it('refuses, changing nothing, when a locked clip would have to move', () => {
    const clips = [clip('a', 'v', 0, 2000), clip('b', 'v', 2000, 4000, { metadata: { locked: true } })];
    const out = duplicateClip(clips, 'a', 'copy');
    assert.deepEqual(out, { ok: false, reason: 'locked' });
  });
  it('a locked last shot can be copied; the copy starts unlocked', () => {
    const out = duplicateClip([clip('a', 'v', 0, 2000, { metadata: { locked: true, speed: 2 } })], 'a', 'copy');
    const copy = out.clips.find((c) => c.id === 'copy');
    assert.equal(copy.metadata.locked, undefined);
    assert.equal(copy.metadata.speed, 2);
    assert.equal(out.clips.find((c) => c.id === 'a').metadata.locked, true);
  });
  it('repeated duplication keeps stacking copies in order', () => {
    let clips = [clip('a', 'v', 0, 1000), clip('b', 'v', 1000, 2000)];
    for (const id of ['c1', 'c2', 'c3']) clips = duplicateClip(clips, 'a', id).clips;
    assert.deepEqual(spans(clips).map(([id]) => id), ['a', 'c3', 'c2', 'c1', 'b']);
    assert.equal(Math.max(...clips.map((c) => c.end_ms)), 5000);
  });
  it('an unknown clip changes nothing', () => {
    assert.deepEqual(duplicateClip([clip('a', 'v', 0, 1000)], 'zzz', 'copy'), { ok: false, reason: 'missing' });
  });
});

describe('E1: Duplicate in the editor', () => {
  const s = () => useTimelineStore.getState();
  const track = (id, track_type, extra = {}) => ({ id, timeline_id: 'tl', name: id, track_type, order_index: 0, muted: false, locked: false, visible: true, created_at: '', ...extra });
  const timeline = { id: 'tl', project_id: 'p', name: 'Main', fps: 24, resolution: '1920x1080', duration_ms: 0, color_grade_id: 'natural', created_at: '', updated_at: '' };
  let base;
  beforeEach(() => {
    s().load({ timeline, tracks: [track('v', 'video'), track('m', 'audio')], clips: [clip('a', 'v', 0, 7000), clip('b', 'v', 7000, 11000), clip('m1', 'm', 0, 5000)] });
    base = { clips: s().clips, tracks: s().tracks };
  });

  it('selects the copy, is one undo step, and redo brings it back', () => {
    assert.equal(s().duplicate('a'), 'ok');
    const copy = s().clips.find((c) => !['a', 'b', 'm1'].includes(c.id));
    assert.equal(s().selected_clip_id, copy.id);
    s().undo();
    assert.deepEqual(spans(s().clips), [['a', 0, 7000], ['b', 7000, 11000]]);
    s().redo();
    assert.deepEqual(spans(s().clips).map(([, a, b]) => [a, b]), [[0, 7000], [7000, 14000], [14000, 18000]]);
  });
  it('is saved like any edit: one new clip and the moved one', () => {
    s().duplicate('a');
    const diff = diffTimeline(base, { clips: s().clips, tracks: s().tracks });
    assert.equal(diff.clipInserts.length, 1);
    assert.deepEqual(diff.clipUpdates.map((u) => u.id), ['b']);
    assert.deepEqual(diff.clipDeletes, []);
  });
  it('a locked row refuses, and so does a locked clip that would move', () => {
    s().toggleTrackLock('v');
    assert.equal(s().duplicate('a'), 'track-locked');
    s().toggleTrackLock('v');
    s().toggleClipLock('b');
    assert.equal(s().duplicate('a'), 'clip-locked');
    assert.equal(s().clips.length, 3);
  });
  it('audio duplicates on its own row', () => {
    assert.equal(s().duplicate('m1'), 'ok');
    assert.deepEqual(spans(s().clips, 'm').map(([, a, b]) => [a, b]), [[0, 5000], [5000, 10000]]);
    assert.deepEqual(spans(s().clips), [['a', 0, 7000], ['b', 7000, 11000]]);
  });
  it('is reachable by right-click and from the clip panel, and never generates', () => {
    const panel = src('interface/components/editor/TimelinePanel.tsx');
    assert.match(panel, /onContextMenu=\{onMenu\}/);
    assert.match(panel, /role="menu"[\s\S]*Duplicate/);
    const clipPanel = src('interface/components/editor/ClipPanel.tsx');
    assert.match(clipPanel, /aria-label="Duplicate shot"/);
    assert.match(clipPanel, /<CopyPlus size=\{15\} \/> Duplicate/);
    assert.doesNotMatch(src('interface/components/editor/duplicate-clip.ts'), /fetch|generate|quota/i);
  });
});

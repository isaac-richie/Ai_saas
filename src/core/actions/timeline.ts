'use server';

import { createClient } from '@/infrastructure/supabase/server';
import type { TimelineProject, TimelineTrack, TimelineClip } from '@/core/types/timeline';
import { shotInfoFromStoryboard } from '@/core/services/shot-context';
import { listClipLibrary } from '@/core/actions/editor-hub';
import { validClipValue } from '@/core/services/clip-validation';
import { VIDEO_FORMATS, isFormatResolution, isFrameFit } from '@/core/services/video-format';

export async function getOrCreateTimeline(projectId: string) {
  const supabase = await createClient();
  const findExisting = async () => {
    const { data } = await supabase
      .from('timeline_projects')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data as TimelineProject | null;
  };

  const existing = await findExisting();
  if (existing) return { timeline: existing };

  // A new edit starts in the project's own shape (a vertical storyboard makes a vertical video).
  const { data: project } = await supabase.from('projects').select('aspect_ratio').eq('id', projectId).maybeSingle();
  const format = VIDEO_FORMATS.find((f) => f.ratio === project?.aspect_ratio);
  const { data: created, error } = await supabase
    .from('timeline_projects')
    .insert({ project_id: projectId, ...(format ? { resolution: format.resolution } : {}) })
    .select()
    .single();

  if (error) {
    // Two tabs (or a double mount) opened the editor at once: the other request created it.
    if (error.code === '23505') {
      const winner = await findExisting();
      if (winner) return { timeline: winner };
    }
    return { error: 'Could not open this project.' };
  }

  const timeline = created as TimelineProject;
  await supabase.from('timeline_tracks').insert([
    { timeline_id: timeline.id, name: 'Video 1', track_type: 'video', order_index: 0 },
    { timeline_id: timeline.id, name: 'Audio 1', track_type: 'audio', order_index: 1 },
  ]);

  return { timeline };
}

/** A timeline someone else just created may not have its tracks yet; wait briefly for them. */
async function tracksWithVideo(timelineId: string) {
  const supabase = await createClient();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase.from('timeline_tracks').select('*').eq('timeline_id', timelineId).order('order_index');
    if (error) return { error: error.message };
    const tracks = (data || []) as TimelineTrack[];
    if (tracks.some((t) => t.track_type === 'video') || attempt === 3) return { tracks };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { tracks: [] as TimelineTrack[] };
}

export async function getTimelineTracks(timelineId: string) {
  return tracksWithVideo(timelineId);
}

export async function getTimelineClips(trackIds: string[]) {
  if (!trackIds.length) return { clips: [] as TimelineClip[] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('timeline_clips')
    .select('*')
    .in('track_id', trackIds)
    .order('start_ms');

  if (error) return { error: error.message };
  return { clips: (data || []) as TimelineClip[] };
}

export async function addClipToTrack(clip: {
  track_id: string;
  take_id?: string;
  asset_url?: string;
  clip_type: string;
  start_ms: number;
  end_ms: number;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('timeline_clips')
    .insert(clip)
    .select()
    .single();

  if (error) return { error: error.message };
  return { clip: data as TimelineClip };
}

const CLIP_PATCH_KEYS = [
  'start_ms', 'end_ms', 'trim_start_ms', 'trim_end_ms', 'volume', 'opacity',
  'transition_in', 'transition_in_ms', 'transition_out', 'transition_out_ms', 'color_grade_id',
  'metadata', 'asset_url',
] as const;
type ClipPatch = Partial<Pick<TimelineClip, (typeof CLIP_PATCH_KEYS)[number]>>;

export async function updateTimelineClip(clipId: string, patch: ClipPatch) {
  // Server actions are callable with any payload, so only known editable columns are written.
  const safe: Record<string, unknown> = {};
  for (const key of CLIP_PATCH_KEYS) {
    if (!(key in patch)) continue;
    if (!validClipValue(key, patch[key])) return { error: 'That change could not be saved.' };
    safe[key] = patch[key];
  }
  if (Object.keys(safe).length === 0) return { success: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from('timeline_clips')
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq('id', clipId);

  if (error) return { error: error.message };
  return { success: true };
}

const INSERT_CLIP_KEYS = [
  'id', 'track_id', 'take_id', 'asset_url', 'clip_type', 'start_ms', 'end_ms', 'trim_start_ms', 'trim_end_ms',
  'volume', 'opacity', 'transition_in', 'transition_in_ms', 'transition_out', 'transition_out_ms',
  'color_grade_id', 'metadata', 'order_index',
] as const;

/** Re-creates clips by id (undone deletes, split halves). RLS rejects tracks the user does not own. */
export async function upsertTimelineClips(clips: TimelineClip[]) {
  if (!Array.isArray(clips) || clips.length === 0) return { success: true };
  if (clips.length > 200) return { error: 'Too many clips' };
  const rows = [];
  for (const clip of clips) {
    const row: Record<string, unknown> = {};
    for (const key of INSERT_CLIP_KEYS) {
      if (!(key in clip)) continue;
      if (!validClipValue(key, clip[key])) return { error: 'That change could not be saved.' };
      row[key] = clip[key];
    }
    rows.push(row);
  }
  const supabase = await createClient();
  const { error } = await supabase.from('timeline_clips').upsert(rows, { onConflict: 'id' });
  if (error) return { error: error.message };
  return { success: true };
}

export async function upsertTimelineTracks(tracks: TimelineTrack[]) {
  if (!Array.isArray(tracks) || tracks.length === 0) return { success: true };
  if (tracks.length > 20) return { error: 'Too many tracks' };
  const rows = tracks.map(({ id, timeline_id, name, track_type, order_index, muted, locked, visible }) => ({
    id, timeline_id, name, track_type, order_index, muted, locked, visible,
  }));
  const supabase = await createClient();
  const { error } = await supabase.from('timeline_tracks').upsert(rows, { onConflict: 'id' });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateTimelineTrack(
  trackId: string,
  patch: Partial<Pick<TimelineTrack, 'muted' | 'locked' | 'visible'>>,
) {
  const safe: Record<string, boolean> = {};
  for (const key of ['muted', 'locked', 'visible'] as const) if (typeof patch[key] === 'boolean') safe[key] = patch[key]!;
  if (Object.keys(safe).length === 0) return { success: true };
  const supabase = await createClient();
  const { error } = await supabase.from('timeline_tracks').update(safe).eq('id', trackId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeTimelineTrack(trackId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('timeline_tracks').delete().eq('id', trackId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateTimelineSettings(
  timelineId: string,
  patch: { color_grade_id?: string; duration_ms?: number; resolution?: string; frame_fit?: string },
) {
  const safe: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.color_grade_id === 'string') safe.color_grade_id = patch.color_grade_id;
  // Only the formats the editor offers; anything else is ignored.
  if (isFormatResolution(patch.resolution)) safe.resolution = patch.resolution;
  if (isFrameFit(patch.frame_fit)) safe.frame_fit = patch.frame_fit;
  if (Number.isFinite(patch.duration_ms)) safe.duration_ms = Math.max(0, Math.round(patch.duration_ms!));
  const supabase = await createClient();
  const { error } = await supabase.from('timeline_projects').update(safe).eq('id', timelineId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeTimelineClip(clipId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('timeline_clips').delete().eq('id', clipId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function addTimelineTrack(timelineId: string, name: string, trackType: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('timeline_tracks')
    .select('order_index')
    .eq('timeline_id', timelineId)
    .order('order_index', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (existing?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from('timeline_tracks')
    .insert({ timeline_id: timelineId, name, track_type: trackType, order_index: nextOrder })
    .select()
    .single();

  if (error) return { error: error.message };
  return { track: data as TimelineTrack };
}

export async function importStoryboardToTimeline(projectId: string) {
  const supabase = await createClient();

  const result = await getOrCreateTimeline(projectId);
  if ('error' in result) return result;
  const timeline = result.timeline!;

  const { tracks } = await getTimelineTracks(timeline.id);
  const videoTrack = tracks?.find((t) => t.track_type === 'video');
  if (!videoTrack) return { error: 'No video track found' };

  const { data: storyboardItems } = await supabase
    .from('fast_video_storyboard_items')
    .select('id, url, duration_seconds, order_index, scene_id, subject, prompt, enhanced_prompt')
    .eq('project_id', projectId)
    .eq('status', 'ready')
    .order('order_index');

  // A project can hold several scenes: keep each scene together, in story order.
  const { data: scenes } = await supabase.from('scenes').select('id, name, sequence_order, created_at').eq('project_id', projectId);
  // Films keep their footage as shot takes, not storyboard items: bring in each shot's approved take,
  // or its latest finished one.
  const filmTakes = await filmShotTakes(supabase, (scenes || []).map((sc) => sc.id));
  const items: Array<{ id: string; url: string | null; duration_seconds: number | null; order_index: number; scene_id: string; subject: string | null; prompt: string | null; enhanced_prompt: string | null; film_shot_id?: string }> = [
    ...(storyboardItems || []),
    ...filmTakes,
  ];

  if (!items.length) return { error: 'No finished shots to bring in yet. Generate a shot, or add videos from your device.' };

  const sceneRank = new Map(
    (scenes || [])
      .sort((a, b) => a.sequence_order - b.sequence_order || a.created_at.localeCompare(b.created_at))
      .map((sc, i) => [sc.id, i]),
  );
  const sceneName = new Map((scenes || []).map((sc) => [sc.id, sc.name as string]));
  items.sort((a, b) => (sceneRank.get(a.scene_id) ?? 1e6) - (sceneRank.get(b.scene_id) ?? 1e6) || a.order_index - b.order_index);

  const { data: existing } = await supabase
    .from('timeline_clips')
    .select('asset_url, end_ms, metadata')
    .eq('track_id', videoTrack.id);
  // A shot counts as already here by its link, its storyboard id, or any of its earlier takes.
  const onTrack = new Set<string>();
  for (const c of existing || []) {
    const meta = (c.metadata || {}) as { storyboard_item_id?: unknown; takes?: unknown };
    if (c.asset_url) onTrack.add(c.asset_url);
    if (typeof meta.storyboard_item_id === 'string') onTrack.add(`id:${meta.storyboard_item_id}`);
    if (Array.isArray(meta.takes)) for (const t of meta.takes) if (t && typeof t.url === 'string') onTrack.add(t.url);
  }
  let cursor_ms = Math.max(0, ...(existing || []).map((c) => c.end_ms));

  const clips: Array<{
    track_id: string;
    asset_url: string;
    clip_type: string;
    start_ms: number;
    end_ms: number;
    metadata: Record<string, unknown>;
  }> = [];

  for (const item of items) {
    // Re-importing only adds storyboard clips that are not on the timeline yet.
    if (!item.url || onTrack.has(item.url) || onTrack.has(`id:${item.id}`)) continue;
    onTrack.add(item.url);
    const dur = Math.max(1, item.duration_seconds || 5) * 1000;
    clips.push({
      track_id: videoTrack.id,
      asset_url: item.url,
      clip_type: 'video',
      start_ms: cursor_ms,
      end_ms: cursor_ms + dur,
      // What the shot shows, so the AI editor can find shots by their content.
      metadata: { source_duration_ms: dur, ...(item.film_shot_id ? { film_shot_id: item.film_shot_id } : { storyboard_item_id: item.id }), shot: shotInfoFromStoryboard(item, sceneName.get(item.scene_id)) },
    });
    cursor_ms += dur;
  }

  if (clips.length === 0) return { success: true, clip_count: 0, duration_ms: cursor_ms };

  const { error } = await supabase.from('timeline_clips').insert(clips);
  if (error) return { error: error.message };

  await supabase
    .from('timeline_projects')
    .update({ duration_ms: cursor_ms })
    .eq('id', timeline.id);

  return { success: true, clip_count: clips.length, duration_ms: cursor_ms };
}

export async function getLatestRenderJob(timelineId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('timeline_render_jobs')
    .select('id, status, progress, stage, output_url, storage_key, error_message, updated_at')
    .eq('timeline_id', timelineId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { job: data };
}

/**
 * Shots whose storyboard has a newer version than the one on the timeline (regenerated in Create
 * after it was brought in). Nothing is swapped: the editor asks the creator.
 */
export async function getStoryboardUpdates(timelineId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(timelineId)) return { updates: [] as { clip_id: string; url: string; duration_ms: number }[] };
  const supabase = await createClient();
  const { data: tracks } = await supabase.from('timeline_tracks').select('id').eq('timeline_id', timelineId).eq('track_type', 'video');
  if (!tracks?.length) return { updates: [] };
  const { data: clips } = await supabase.from('timeline_clips').select('id, asset_url, metadata').in('track_id', tracks.map((t) => t.id));
  const linked = (clips || []).filter((c) => typeof (c.metadata as { storyboard_item_id?: unknown } | null)?.storyboard_item_id === 'string');
  if (!linked.length) return { updates: [] };
  const ids = [...new Set(linked.map((c) => (c.metadata as { storyboard_item_id: string }).storyboard_item_id))];
  const { data: items } = await supabase
    .from('fast_video_storyboard_items')
    .select('id, url, duration_seconds, status')
    .in('id', ids.slice(0, 200));
  const byId = new Map((items || []).filter((i) => i.status === 'ready' && i.url).map((i) => [i.id, i]));
  const updates = [];
  for (const c of linked) {
    const meta = (c.metadata || {}) as { storyboard_item_id: string; takes?: { url?: string }[]; ignored_storyboard_url?: string };
    const item = byId.get(meta.storyboard_item_id);
    if (!item) continue;
    const known = new Set([c.asset_url, meta.ignored_storyboard_url, ...(Array.isArray(meta.takes) ? meta.takes.map((t) => t?.url) : [])]);
    if (!known.has(item.url)) updates.push({ clip_id: c.id, url: item.url as string, duration_ms: Math.max(1, item.duration_seconds || 5) * 1000 });
  }
  return { updates };
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function filmShotTakes(supabase: Db, sceneIds: string[]) {
  if (!sceneIds.length) return [];
  const { data: shots } = await supabase
    .from('shots')
    .select('id, name, prompt_text, sequence_order, scene_id, approved_take_id, shot_generations!shot_generations_shot_id_fkey(id, output_url, status, duration_seconds, created_at)')
    .in('scene_id', sceneIds)
    .order('sequence_order');
  return (shots || []).flatMap((shot) => {
    const takes = ((shot.shot_generations || []) as { id: string; output_url: string | null; status: string; duration_seconds: number | null; created_at: string }[])
      .filter((t) => t.status === 'completed' && t.output_url)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const take = takes.find((t) => t.id === shot.approved_take_id) || takes[0];
    if (!take) return [];
    return [{
      id: take.id, url: take.output_url, duration_seconds: take.duration_seconds, order_index: shot.sequence_order ?? 0, scene_id: shot.scene_id,
      subject: shot.name, prompt: shot.prompt_text, enhanced_prompt: null, film_shot_id: shot.id,
    }];
  });
}

const UPLOAD_PATH = /^[0-9a-f-]{36}\/edits\/[0-9a-f-]{36}\.(mp4|mov|webm|m4v)$/i;

/**
 * Videos the creator uploaded from their own device, appended to the end of the edit in the order
 * chosen. Only files in their own folder of the public elements bucket are accepted.
 */
export async function addUploadedClips(projectId: string, uploads: { path: string; name: string; durationMs: number }[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in again.' };
  if (!uploads.length || uploads.length > 20) return { error: 'Choose between 1 and 20 videos.' };
  if (uploads.some((u) => !UPLOAD_PATH.test(u.path) || !u.path.startsWith(`${user.id}/`))) return { error: 'That upload could not be verified. Try again.' };

  const result = await getOrCreateTimeline(projectId);
  if ('error' in result) return result;
  const timeline = result.timeline!;
  const { tracks } = await getTimelineTracks(timeline.id);
  const videoTrack = tracks?.find((t) => t.track_type === 'video');
  if (!videoTrack) return { error: 'No video track found' };

  const { data: existing } = await supabase.from('timeline_clips').select('end_ms').eq('track_id', videoTrack.id);
  let cursor_ms = Math.max(0, ...(existing || []).map((c) => c.end_ms));
  const clips = uploads.map((u) => {
    const dur = Math.round(Math.min(Math.max(u.durationMs || 5000, 500), 30 * 60_000));
    const { data } = supabase.storage.from('elements').getPublicUrl(u.path);
    const clip = {
      track_id: videoTrack.id, asset_url: data.publicUrl, clip_type: 'video', start_ms: cursor_ms, end_ms: cursor_ms + dur,
      metadata: { source_duration_ms: dur, uploaded: true, shot: { subject: u.name.replace(/\.[^.]+$/, '').slice(0, 120) } },
    };
    cursor_ms += dur;
    return clip;
  });
  const { error } = await supabase.from('timeline_clips').insert(clips);
  if (error) return { error: 'Could not add those videos. Try again.' };
  await supabase.from('timeline_projects').update({ duration_ms: cursor_ms }).eq('id', timeline.id);
  return { success: true, clip_count: clips.length, duration_ms: cursor_ms };
}

/** Clips from the creator's other films and storyboards, appended in the order picked. Only their own clips are accepted. */
export async function addLibraryClips(projectId: string, urls: string[]) {
  if (!urls.length || urls.length > 40) return { error: 'Choose between 1 and 40 clips.' };
  const library = await listClipLibrary();
  if (!library.data) return { error: library.error || 'Could not load your clips.' };
  const byUrl = new Map(library.data.map((c) => [c.url, c]));
  const picked = urls.map((u) => byUrl.get(u));
  if (picked.some((c) => !c)) return { error: 'One of those clips is no longer available. Refresh and try again.' };

  const supabase = await createClient();
  const result = await getOrCreateTimeline(projectId);
  if ('error' in result) return result;
  const timeline = result.timeline!;
  const { tracks } = await getTimelineTracks(timeline.id);
  const videoTrack = tracks?.find((t) => t.track_type === 'video');
  if (!videoTrack) return { error: 'No video track found' };
  const { data: existing } = await supabase.from('timeline_clips').select('end_ms').eq('track_id', videoTrack.id);
  let cursor_ms = Math.max(0, ...(existing || []).map((c) => c.end_ms));
  const clips = picked.map((c) => {
    const clip = {
      track_id: videoTrack.id, asset_url: c!.url, clip_type: 'video', start_ms: cursor_ms, end_ms: cursor_ms + c!.durationMs,
      metadata: { source_duration_ms: c!.durationMs, from_library: true, shot: { subject: c!.title.slice(0, 120), scene: c!.source.slice(0, 80) } },
    };
    cursor_ms += c!.durationMs;
    return clip;
  });
  const { error } = await supabase.from('timeline_clips').insert(clips);
  if (error) return { error: 'Could not add those clips. Try again.' };
  await supabase.from('timeline_projects').update({ duration_ms: cursor_ms }).eq('id', timeline.id);
  return { success: true, clip_count: clips.length, duration_ms: cursor_ms };
}

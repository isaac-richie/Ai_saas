'use server';

import { createClient } from '@/infrastructure/supabase/server';
import type { TimelineProject, TimelineTrack, TimelineClip } from '@/core/types/timeline';
import { isFormatResolution, isFrameFit } from '@/core/services/video-format';

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

  const { data: created, error } = await supabase
    .from('timeline_projects')
    .insert({ project_id: projectId })
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
] as const;
type ClipPatch = Partial<Pick<TimelineClip, (typeof CLIP_PATCH_KEYS)[number]>>;

export async function updateTimelineClip(clipId: string, patch: ClipPatch) {
  // Server actions are callable with any payload, so only known editable columns are written.
  const safe: Record<string, unknown> = {};
  for (const key of CLIP_PATCH_KEYS) if (key in patch) safe[key] = patch[key];
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
  const rows = clips.map((clip) => {
    const row: Record<string, unknown> = {};
    for (const key of INSERT_CLIP_KEYS) if (key in clip) row[key] = clip[key];
    return row;
  });
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

  const { data: items } = await supabase
    .from('fast_video_storyboard_items')
    .select('url, duration_seconds, order_index, scene_id')
    .eq('project_id', projectId)
    .eq('status', 'ready')
    .order('order_index');

  if (!items?.length) return { error: 'No ready storyboard clips to import yet.' };

  const { data: existing } = await supabase
    .from('timeline_clips')
    .select('asset_url, end_ms')
    .eq('track_id', videoTrack.id);
  const onTrack = new Set((existing || []).map((c) => c.asset_url).filter(Boolean));
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
    if (!item.url || onTrack.has(item.url)) continue;
    onTrack.add(item.url);
    const dur = Math.max(1, item.duration_seconds || 5) * 1000;
    clips.push({
      track_id: videoTrack.id,
      asset_url: item.url,
      clip_type: 'video',
      start_ms: cursor_ms,
      end_ms: cursor_ms + dur,
      metadata: { source_duration_ms: dur },
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

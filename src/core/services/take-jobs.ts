import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyTake,
  buildRegenerateRequest,
  isPendingStale,
  rippleFrom,
  type PendingTake,
  type StoryboardShot,
} from '@/core/services/take-regenerate';
import type { FastVideoRequest } from '@/core/validation/fast-video';

/** The generator, as the take jobs use it; the real ones are generateFastVideo and pollFastVideoStatus. */
export interface TakeGenerator {
  generate: (request: FastVideoRequest) => Promise<{ error?: string; data?: unknown }>;
  poll: (taskId: string) => Promise<{ error?: string; data?: unknown }>;
}

export type TakeResult = { status: number; body: Record<string, unknown> };

type ClipRow = {
  id: string;
  track_id: string;
  asset_url: string | null;
  start_ms: number;
  end_ms: number;
  trim_start_ms: number;
  metadata: Record<string, unknown> | null;
};

const NOT_FROM_STORYBOARD = 'This shot did not come from your storyboard, so it cannot be made again here.';

/** The clip, its track and its project, all read through RLS so only the owner gets anything. */
async function loadClip(supabase: SupabaseClient, clipId: string) {
  const { data: clip } = await supabase
    .from('timeline_clips')
    .select('id, track_id, asset_url, start_ms, end_ms, trim_start_ms, metadata')
    .eq('id', clipId)
    .maybeSingle();
  if (!clip) return null;
  const { data: track } = await supabase.from('timeline_tracks').select('id, timeline_id, track_type, locked').eq('id', clip.track_id).maybeSingle();
  if (!track) return null;
  const { data: timeline } = await supabase.from('timeline_projects').select('id, project_id').eq('id', track.timeline_id).maybeSingle();
  if (!timeline) return null;
  return { clip: clip as ClipRow, track, timeline };
}

/** Starts a new take of a timeline shot with the generator. */
export async function startTake(
  supabase: SupabaseClient,
  gen: TakeGenerator,
  input: { clip_id: string; duration_sec?: number; note?: string },
): Promise<TakeResult> {
  const found = await loadClip(supabase, input.clip_id);
  if (!found) return { status: 404, body: { error: 'Shot not found.' } };
  const { clip, track, timeline } = found;
  if (track.track_type !== 'video') return { status: 400, body: { error: 'Only shots can be made again.' } };
  if (track.locked) return { status: 409, body: { error: 'Your shots are locked. Unlock them first.' } };
  const meta = clip.metadata || {};
  if (!isPendingStale(meta.pending_take as PendingTake | undefined)) {
    return { status: 409, body: { error: 'A new take of this shot is already being made.' } };
  }

  // The storyboard shot this clip came from: by id when known, else by its footage or an earlier take.
  const storyboardId = typeof meta.storyboard_item_id === 'string' ? meta.storyboard_item_id : null;
  const takeUrls = [clip.asset_url, ...((Array.isArray(meta.takes) ? meta.takes : []) as { url?: string }[]).map((t) => t?.url)].filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );
  if (!storyboardId && takeUrls.length === 0) return { status: 422, body: { error: NOT_FROM_STORYBOARD } };
  let query = supabase
    .from('fast_video_storyboard_items')
    .select('id, scene_id, url, prompt, enhanced_prompt, direction, model_family_id, duration_seconds, start_frame, end_frame, media_references')
    .eq('project_id', timeline.project_id);
  query = storyboardId ? query.eq('id', storyboardId) : query.in('url', takeUrls);
  const { data: shots } = await query.limit(1);
  const shot = shots?.[0] as (StoryboardShot & { scene_id: string }) | undefined;
  if (!shot) return { status: 422, body: { error: NOT_FROM_STORYBOARD } };

  const { data: project } = await supabase.from('projects').select('aspect_ratio').eq('id', timeline.project_id).maybeSingle();
  const built = buildRegenerateRequest(
    shot,
    { projectId: timeline.project_id, sceneId: shot.scene_id, aspectRatio: project?.aspect_ratio ?? null },
    { durationSec: input.duration_sec, note: input.note },
  );
  if ('error' in built) return { status: 422, body: { error: built.error } };

  // The generator checks the allowance, references and frames exactly as in Create.
  const result = await gen.generate(built.request);
  if (result.error || !result.data) return { status: 502, body: { error: result.error || 'The generator could not start this take.' } };
  const data = result.data as { taskId?: string | null; url?: string | null; status?: string; durationSeconds?: number };
  const durationSec = typeof data.durationSeconds === 'number' ? data.durationSeconds : built.request.settings.duration_seconds;
  const keepLength = !input.duration_sec;

  if (data.url && data.status === 'completed') {
    const placed = await placeTake(supabase, clip, { url: data.url, durationSec, note: input.note, keepLength });
    return placed ? { status: 200, body: { status: 'completed' } } : { status: 500, body: { error: 'The take finished but could not be placed.' } };
  }
  if (!data.taskId) return { status: 502, body: { error: 'The generator did not return a job.' } };

  // Remembered on the clip so the editor can pick the take up even after a reload.
  const pending: PendingTake & { keep_length: boolean } = {
    task_id: data.taskId,
    started_at: new Date().toISOString(),
    duration_sec: durationSec,
    keep_length: keepLength,
    ...(input.note ? { note: input.note } : {}),
  };
  const { error } = await supabase
    .from('timeline_clips')
    .update({ metadata: { ...meta, pending_take: pending }, updated_at: new Date().toISOString() })
    .eq('id', clip.id);
  if (error) return { status: 500, body: { error: 'Could not track this take.' } };
  return { status: 202, body: { status: 'processing' } };
}

/** Checks on a take; when it is ready, it replaces the shot's footage. */
export async function checkTake(supabase: SupabaseClient, gen: TakeGenerator, clipId: string): Promise<TakeResult> {
  const found = await loadClip(supabase, clipId);
  if (!found) return { status: 404, body: { error: 'Shot not found.' } };
  const { clip } = found;
  const meta = clip.metadata || {};
  const pending = meta.pending_take as (PendingTake & { keep_length?: boolean }) | undefined;
  if (!pending) return { status: 200, body: { status: 'idle' } };

  const clearPending = async () => {
    const rest = { ...meta };
    delete rest.pending_take;
    await supabase.from('timeline_clips').update({ metadata: rest, updated_at: new Date().toISOString() }).eq('id', clip.id);
  };
  if (isPendingStale(pending)) {
    await clearPending();
    return { status: 200, body: { status: 'failed', error: 'The new take took too long and was stopped.' } };
  }

  const polled = await gen.poll(pending.task_id);
  // A hiccup checking is not a failed take; ask again next time.
  if (polled.error || !polled.data) return { status: 200, body: { status: 'processing', message: 'Still working on it…' } };
  const state = polled.data as { status: string; url: string | null; error?: string; message?: string };
  if (state.status === 'failed') {
    await clearPending();
    return { status: 200, body: { status: 'failed', error: state.error || 'The generator could not make this take.' } };
  }
  if (state.status !== 'completed' || !state.url) {
    return { status: 200, body: { status: 'processing', message: state.message || 'Making your new take…' } };
  }

  const placed = await placeTake(supabase, clip, { url: state.url, durationSec: pending.duration_sec, note: pending.note, keepLength: pending.keep_length !== false });
  return placed ? { status: 200, body: { status: 'completed' } } : { status: 500, body: { error: 'The take finished but could not be placed.' } };
}

/** Swaps the take onto the clip and, if its length changed, closes up the shots after it. */
async function placeTake(
  supabase: SupabaseClient,
  clip: ClipRow,
  take: { url: string; durationSec: number; note?: string; keepLength: boolean },
) {
  const updated = applyTake(
    clip,
    { url: take.url, source_duration_ms: Math.round(take.durationSec * 1000), created_at: new Date().toISOString(), ...(take.note ? { note: take.note } : {}) },
    { keepLength: take.keepLength },
  );
  const now = new Date().toISOString();
  const lengthChanged = updated.end_ms !== clip.end_ms;
  const { error } = await supabase
    .from('timeline_clips')
    .update({ asset_url: updated.asset_url, trim_start_ms: updated.trim_start_ms, end_ms: updated.end_ms, metadata: updated.metadata, updated_at: now })
    .eq('id', clip.id);
  if (error) return false;
  if (lengthChanged) {
    const { data: rows } = await supabase.from('timeline_clips').select('id, start_ms, end_ms').eq('track_id', clip.track_id);
    const before = new Map((rows || []).map((r: { id: string; start_ms: number; end_ms: number }) => [r.id, r]));
    for (const row of rippleFrom((rows || []) as { id: string; start_ms: number; end_ms: number }[])) {
      const old = before.get(row.id)!;
      if (old.start_ms !== row.start_ms || old.end_ms !== row.end_ms) {
        await supabase.from('timeline_clips').update({ start_ms: row.start_ms, end_ms: row.end_ms, updated_at: now }).eq('id', row.id);
      }
    }
  }
  return true;
}

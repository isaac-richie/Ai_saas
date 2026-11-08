import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/infrastructure/supabase/server';
import { requireMediaRuntime, MediaRuntimeUnavailableError } from '@/core/utils/security/media-runtime';
import { checkRateLimit } from '@/core/utils/security/rate-limit';
import { BETA_LOCKED_MESSAGE, hasBetaAccess } from '@/core/services/beta-access';
import { UnsafeUrlError } from '@/core/utils/security/safe-fetch';
import { renderTimeline, RenderError } from '@/core/services/timeline-render-job';
import { planTimelineAudio, videoClipFingerprint, type LockedAudioSnapshot } from '@/core/services/long-form-audio-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

// A job still "rendering" after this long was cut off by the platform time limit.
const STALE_MS = 6 * 60 * 1000;
const bodySchema = z.object({ timeline_id: z.string().uuid() });

async function authorise() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  if (!(await hasBetaAccess(user.email))) return { error: NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 }) };
  return { supabase, user };
}

export async function POST(request: Request) {
  const auth = await authorise();
  if ('error' in auth) return auth.error;
  const { supabase, user } = auth;
  if (!checkRateLimit(`timeline-render:${user.id}`, { max: 4, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Please wait a moment before rendering again.' }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'timeline_id required' }, { status: 400 });
  const timelineId = parsed.data.timeline_id;

  let ffmpeg: string;
  try {
    ffmpeg = await requireMediaRuntime();
  } catch (error) {
    const message = error instanceof MediaRuntimeUnavailableError ? error.message : 'Rendering is unavailable.';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  await supabase
    .from('timeline_render_jobs')
    .update({ status: 'failed', error_message: 'The render took too long and was stopped.', updated_at: new Date().toISOString() })
    .eq('timeline_id', timelineId)
    .in('status', ['queued', 'rendering'])
    .lt('updated_at', new Date(Date.now() - STALE_MS).toISOString());

  // Export gate: every locked recording of every Long Form film in this edit must be present, timed and
  // decided before a render is queued. The plan is saved as the job's manifest and the render uses it.
  const { data: timeline } = await supabase.from('timeline_projects').select('id, updated_at').eq('id', timelineId).maybeSingle();
  if (!timeline) return NextResponse.json({ error: 'Timeline not found.' }, { status: 404 });
  const { data: videoTracks } = await supabase.from('timeline_tracks').select('id').eq('timeline_id', timelineId).eq('track_type', 'video');
  const { data: videoClips } = videoTracks?.length
    ? await supabase.from('timeline_clips').select('id, start_ms, end_ms, take_id, asset_url, metadata').in('track_id', videoTracks.map((t) => t.id)).order('start_ms')
    : { data: [] };
  let lockedAudio: LockedAudioSnapshot | undefined;
  let manifest: Record<string, unknown> | null = null;
  try {
    const audio = await planTimelineAudio(supabase, user.id, videoClips ?? []);
    if (audio.issues.length) {
      return NextResponse.json({
        error: `Not ready to export: ${audio.issues[0].message}${audio.issues.length > 1 ? ` (+${audio.issues.length - 1} more)` : ''} Your video work is saved.`,
        issues: audio.issues.map((issue) => issue.message),
      }, { status: 409 });
    }
    lockedAudio = { cues: audio.cues, mutedClipIds: audio.mutedClipIds, clipFingerprint: videoClipFingerprint(videoClips ?? []) };
    manifest = {
      timeline_id: timelineId, timeline_updated_at: timeline.updated_at, clip_fingerprint: lockedAudio.clipFingerprint,
      video: (videoClips ?? []).map((c) => ({ clip_id: c.id, take_id: c.take_id, start_ms: c.start_ms, end_ms: c.end_ms, film_shot_id: (c.metadata as Record<string, unknown> | null)?.film_shot_id ?? null })),
      native_audio_muted_clips: audio.mutedClipIds,
      locked_audio: audio.manifest,
    };
  } catch {
    return NextResponse.json({ error: 'Could not check locked audio. Nothing was rendered.' }, { status: 503 });
  }

  const insertJob = (withManifest: boolean) => supabase
    .from('timeline_render_jobs')
    .insert({ timeline_id: timelineId, user_id: user.id, status: 'queued', stage: 'Waiting to start', ...(withManifest && manifest ? { manifest } : {}) })
    .select('id')
    .single();
  let { data: job, error } = await insertJob(true);
  // Before migration 0053 there is no manifest column; an edit with no locked audio still renders.
  if (error && (error.code === 'PGRST204' || error.code === '42703') && !lockedAudio.cues.length) ({ data: job, error } = await insertJob(false));
  if (error || !job) {
    // The unique index allows one active render per timeline.
    const busy = error?.code === '23505';
    return NextResponse.json({ error: busy ? 'This video is already rendering.' : 'Timeline not found.' }, { status: busy ? 409 : 404 });
  }

  const update = (patch: Record<string, unknown>) =>
    supabase.from('timeline_render_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', job.id);

  after(async () => {
    try {
      await update({ status: 'rendering', progress: 2, stage: 'Starting' });
      const result = await renderTimeline({
        supabase,
        userId: user.id,
        timelineId,
        ffmpeg,
        lockedAudio,
        onProgress: async (progress, stage) => {
          await update({ progress, stage });
        },
      });
      await update({ status: 'completed', progress: 100, stage: 'Done', output_url: result.url, storage_key: result.storageKey });
    } catch (err) {
      const message =
        err instanceof RenderError || err instanceof UnsafeUrlError
          ? err.message
          : 'Render failed. Check that every clip is a playable video and try again.';
      if (!(err instanceof RenderError)) console.error('Timeline render failed', err);
      await update({ status: 'failed', error_message: message });
    }
  });

  return NextResponse.json({ job_id: job.id }, { status: 202 });
}

export async function GET(request: Request) {
  const auth = await authorise();
  if ('error' in auth) return auth.error;
  const jobId = new URL(request.url).searchParams.get('job_id');
  if (!jobId || !z.string().uuid().safeParse(jobId).success) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 });
  }
  const { data: job } = await auth.supabase
    .from('timeline_render_jobs')
    .select('id, status, progress, stage, output_url, storage_key, error_message, updated_at')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: 'Render not found.' }, { status: 404 });
  const stale = (job.status === 'rendering' || job.status === 'queued') && Date.now() - Date.parse(job.updated_at) > STALE_MS;
  return NextResponse.json(
    stale ? { ...job, status: 'failed', error_message: 'The render took too long and was stopped.' } : job,
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

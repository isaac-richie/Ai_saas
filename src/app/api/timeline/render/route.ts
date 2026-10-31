import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/infrastructure/supabase/server';
import { requireMediaRuntime, MediaRuntimeUnavailableError } from '@/core/utils/security/media-runtime';
import { checkRateLimit } from '@/core/utils/security/rate-limit';
import { BETA_LOCKED_MESSAGE, hasBetaAccess } from '@/core/services/beta-access';
import { UnsafeUrlError } from '@/core/utils/security/safe-fetch';
import { renderTimeline, RenderError } from '@/core/services/timeline-render-job';

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

  const { data: job, error } = await supabase
    .from('timeline_render_jobs')
    .insert({ timeline_id: timelineId, user_id: user.id, status: 'queued', stage: 'Waiting to start' })
    .select('id')
    .single();
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

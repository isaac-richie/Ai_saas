import { NextResponse } from 'next/server';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createClient } from '@/infrastructure/supabase/server';
import { checkRateLimit } from '@/core/utils/security/rate-limit';
import { requireMediaRuntime, MediaRuntimeUnavailableError } from '@/core/utils/security/media-runtime';
import { trackSubject } from '@/core/services/reframe-tracker';
import { probeMedia } from '@/core/services/media-probe';
import { BETA_LOCKED_MESSAGE, hasBetaAccess } from '@/core/services/beta-access';
import {
  REFRAME_TARGETS,
  buildReframeArgs,
  buildReframeFilter,
  sampleTimes,
  type ReframeAspect,
} from '@/core/services/reframe';

const execFileAsync = promisify(execFile);
export const runtime = 'nodejs';
export const maxDuration = 300;

const ASPECTS = Object.keys(REFRAME_TARGETS) as [ReframeAspect, ...ReframeAspect[]];
const bodySchema = z.object({
  timeline_id: z.string().uuid(),
  storage_key: z.string().max(300),
  aspects: z.array(z.enum(ASPECTS)).min(1).max(ASPECTS.length),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!(await hasBetaAccess(user.email))) return NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 });
  if (!checkRateLimit(`timeline-reframe:${user.id}`, { max: 3, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Please wait a moment before reframing again.' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { timeline_id, storage_key, aspects } = parsed.data;

  const { data: timeline } = await supabase
    .from('timeline_projects')
    .select('id, project_id')
    .eq('id', timeline_id)
    .maybeSingle();
  if (!timeline) return NextResponse.json({ error: 'Timeline not found.' }, { status: 404 });

  // Only this user's own finished renders of this timeline can be reframed.
  const prefix = `${user.id}/timeline/${timeline.project_id}/${timeline_id}/`;
  const name = storage_key.slice(prefix.length);
  if (!storage_key.startsWith(prefix) || !/^render-\d+\.mp4$/.test(name)) {
    return NextResponse.json({ error: 'Render the video before reframing it.' }, { status: 400 });
  }

  let ffmpeg: string;
  try {
    ffmpeg = await requireMediaRuntime();
  } catch (error) {
    const message = error instanceof MediaRuntimeUnavailableError ? error.message : 'Reframing is unavailable.';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from('renders').download(storage_key);
  if (downloadError || !file) return NextResponse.json({ error: 'Could not find that render.' }, { status: 404 });

  const tmpDir = await mkdtemp(join(tmpdir(), 'timeline-reframe-'));
  try {
    const source = join(tmpDir, 'source.mp4');
    await writeFile(source, Buffer.from(await file.arrayBuffer()));

    const { width, height, durationSec: duration } = await probeMedia(ffmpeg, source);
    if (!(width > 0 && height > 0 && duration > 0)) throw new Error('Unreadable render');

    const times = sampleTimes(duration, 16);
    const framePaths: string[] = [];
    for (let i = 0; i < times.length; i++) {
      const framePath = join(tmpDir, `frame-${i}.jpg`);
      await execFileAsync(ffmpeg, ['-v', 'error', '-y', '-ss', times[i].toFixed(3), '-i', source, '-frames:v', '1', '-vf', 'scale=384:-2', '-q:v', '5', framePath]);
      framePaths.push(framePath);
    }
    const { keyframes, tracked } = await trackSubject(framePaths, times);

    const outputs: { aspect: ReframeAspect; url: string }[] = [];
    for (const aspect of aspects) {
      const out = join(tmpDir, `out-${aspect.replace(':', 'x')}.mp4`);
      await execFileAsync(ffmpeg, buildReframeArgs(source, out, buildReframeFilter(keyframes, width, height, aspect)), { maxBuffer: 16 * 1024 * 1024 });
      const key = storage_key.replace(/\.mp4$/, `-${aspect.replace(':', 'x')}.mp4`);
      const { error: uploadError } = await supabase.storage
        .from('renders')
        .upload(key, await readFile(out), { contentType: 'video/mp4', upsert: true });
      if (uploadError) throw new Error('Upload failed');
      outputs.push({ aspect, url: supabase.storage.from('renders').getPublicUrl(key).data.publicUrl });
    }

    return NextResponse.json({ outputs, tracked }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Reframing failed. Try rendering the video again first.' }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

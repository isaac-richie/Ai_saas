import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/infrastructure/supabase/server';
import { checkRateLimit } from '@/core/utils/security/rate-limit';
import { BETA_LOCKED_MESSAGE, hasBetaAccess } from '@/core/services/beta-access';
import { generateFastVideo, pollFastVideoStatus } from '@/core/actions/fast-video';
import { checkTake, startTake, type TakeGenerator, type TakeResult } from '@/core/services/take-jobs';

export const runtime = 'nodejs';
export const maxDuration = 120;

const startSchema = z.object({
  clip_id: z.string().uuid(),
  duration_sec: z.number().int().min(1).max(30).optional(),
  note: z.string().max(300).optional(),
});

const generator: TakeGenerator = {
  generate: (request) => generateFastVideo(request),
  poll: (taskId) => pollFastVideoStatus(taskId),
};

async function authorise() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Please sign in.' }, { status: 401 }) };
  if (!(await hasBetaAccess(user.email))) return { error: NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 }) };
  return { supabase, user };
}

const reply = ({ status, body }: TakeResult) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Starts a new take of a timeline shot. */
export async function POST(request: Request) {
  const auth = await authorise();
  if ('error' in auth) return auth.error;
  if (!checkRateLimit(`timeline-regenerate:${auth.user.id}`, { max: 4, windowMs: 60_000 }).allowed) {
    return reply({ status: 429, body: { error: 'Please wait a moment before making another take.' } });
  }
  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ status: 400, body: { error: 'Invalid request.' } });
  return reply(await startTake(auth.supabase, generator, parsed.data));
}

/** Checks on a take and places it when ready. */
export async function GET(request: Request) {
  const auth = await authorise();
  if ('error' in auth) return auth.error;
  const clipId = new URL(request.url).searchParams.get('clip_id');
  if (!clipId || !z.string().uuid().safeParse(clipId).success) return reply({ status: 400, body: { error: 'clip_id required' } });
  return reply(await checkTake(auth.supabase, generator, clipId));
}

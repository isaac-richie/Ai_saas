import { NextResponse } from 'next/server';
import { createAdminClient, hasSupabaseAdminEnv } from '@/infrastructure/supabase/admin';
import { checkRateLimit } from '@/core/utils/security/rate-limit';
import { readBoundedBody } from '@/core/utils/security/bounded-body';
import { addGuestNote, getShareForGuest, isShareToken } from '@/core/services/video-review';

export const runtime = 'nodejs';

// Guests have no account; the link's token is checked on every call and unlocks one share only.
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

function visitor(request: Request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token) || !hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
  if (!checkRateLimit(`review-read:${visitor(request)}`, { max: 60, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Too many requests. Wait a moment.' }, { status: 429, headers });
  }
  const share = await getShareForGuest(createAdminClient(), token);
  if (!share) return NextResponse.json({ error: 'This review link has been turned off.' }, { status: 404, headers });
  return NextResponse.json(share, { headers });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token) || !hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
  const who = visitor(request);
  if (
    !checkRateLimit(`review-note:${who}`, { max: 12, windowMs: 60_000 }).allowed ||
    !checkRateLimit(`review-note-link:${token}`, { max: 60, windowMs: 60_000 }).allowed
  ) {
    return NextResponse.json({ error: 'Too many notes at once. Wait a moment.' }, { status: 429, headers });
  }
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(await readBoundedBody(request, 8_000));
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers });
  }
  // A hidden form field people never fill; bots that fill everything are quietly ignored.
  if (typeof input.website === 'string' && input.website.length > 0) return NextResponse.json({ ok: true }, { headers });
  const result = await addGuestNote(createAdminClient(), token, input);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status, headers });
  return NextResponse.json(result, { status: 201, headers });
}

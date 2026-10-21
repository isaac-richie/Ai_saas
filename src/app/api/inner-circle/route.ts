import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createAdminClient, hasSupabaseAdminEnv } from '@/infrastructure/supabase/admin';
import { checkRateLimit, getClientIp } from '@/core/utils/security/rate-limit';

export const runtime = 'nodejs';

// One optional handle on any platform: "@name", "name", or a pasted profile URL.
const handleSchema = z.string().trim().max(120)
  .transform((value) => normalizeHandle(value))
  .pipe(z.union([z.literal(''), z.string().min(2).max(80).regex(/^[a-z0-9._]+$/, 'Enter a handle like @yourname.')]));

const payloadSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(160),
  socialHandle: handleSchema.optional().default(''),
  feedback: z.string().trim().max(1000, 'Keep it under 1,000 characters.').optional().default(''),
  referredByCode: z.string().min(4).max(32).optional().nullable(),
});

function normalizeHandle(value: string): string {
  const trimmed = value.trim()
    // Keep only the handle from a pasted profile link (instagram.com/name, x.com/name, tiktok.com/@name).
    .replace(/^https?:\/\/(www\.)?[^/]+\/(@)?/i, '')
    .replace(/[/?#].*$/, '');
  return trimmed.replace(/^@+/, '').toLowerCase();
}

function normalizeReferralCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return code.length ? code : null;
}

function generateReferralCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function createUniqueCode(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  for (let tries = 0; tries < 8; tries += 1) {
    const candidate = generateReferralCode(8);
    const { data } = await admin
      .from('inner_circle_waitlist')
      .select('id')
      .eq('referral_code', candidate)
      .limit(1)
      .maybeSingle();

    if (!data) return candidate;
  }

  return `${generateReferralCode(6)}${Date.now().toString().slice(-2)}`;
}

type InnerCircleInput = {
  email: string;
  fullName: string;
  socialHandle: string | null;
  feedback: string | null;
  ipAddress: string | null;
  referredByCode: string | null;
};

function createPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing public Supabase environment variables.');
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getReferralCodeFromRpc(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const value = (data as { referralCode?: unknown; referral_code?: unknown }).referralCode
    || (data as { referralCode?: unknown; referral_code?: unknown }).referral_code;
  return typeof value === 'string' && value.trim().length ? value.trim().toUpperCase() : null;
}

async function submitWithAdmin(input: InnerCircleInput) {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from('inner_circle_waitlist')
    .select('id, referral_code')
    .eq('email', input.email)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  let referralCode = existing?.referral_code || null;

  if (existing) {
    const { error: updateError } = await admin
      .from('inner_circle_waitlist')
      .update({
        full_name: input.fullName,
        // Keep an earlier handle or answer when this submission leaves them blank.
        ...(input.socialHandle ? { social_handle: input.socialHandle } : {}),
        ...(input.feedback ? { feedback_text: input.feedback } : {}),
        ip_address: input.ipAddress,
      })
      .eq('id', existing.id);

    if (updateError) {
      return { error: updateError.message };
    }
  } else {
    referralCode = await createUniqueCode(admin);

    const { error: insertError } = await admin.from('inner_circle_waitlist').insert({
      full_name: input.fullName,
      social_handle: input.socialHandle,
      feedback_text: input.feedback,
      ip_address: input.ipAddress,
      cohort: 'Beta Waitlist',
      status: 'pending',
      email: input.email,
      referral_code: referralCode,
      referred_by_code: input.referredByCode,
    });

    if (insertError) {
      return { error: insertError.message };
    }

    if (input.referredByCode) {
      try {
        await admin.rpc('increment_referral_count_inner_circle', {
          code_input: input.referredByCode,
        });
      } catch {
        // non-blocking: signup should still succeed even if referral increment fails
      }
    }
  }

  return { referralCode, isNew: !existing };
}

async function submitWithPublicRpc(input: InnerCircleInput) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc('join_inner_circle_waitlist', {
    p_email: input.email,
    p_full_name: input.fullName,
    p_instagram_handle: null,
    p_referred_by_code: input.referredByCode,
    p_social_handle: input.socialHandle,
  });

  if (error) {
    return { error: error.message };
  }

  return { referralCode: getReferralCodeFromRpc(data), isNew: true };
}

/** Optional real-time lead alert (Zapier, Make or a Google Apps Script URL). */
async function notifyWebhook(lead: Record<string, unknown>) {
  const url = process.env.INNER_CIRCLE_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(5000),
  });
}

/** Optional welcome email through Resend's HTTP API. */
async function sendWelcomeEmail(email: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INNER_CIRCLE_FROM_EMAIL;
  if (!apiKey || !from) return;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'You are on the Visiowave Inner Circle list',
      text: [
        'You are on the VIP Inner Circle list for Visiowave Studios.',
        '',
        'Spots are limited. When yours opens, your private access invite will arrive at this address.',
        '',
        'Visiowave Studios',
      ].join('\n'),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}`);
}

export async function POST(request: Request) {
  try {
    const throttle = checkRateLimit(`inner-circle:${getClientIp(request)}`, {
      max: 5,
      windowMs: 60_000,
    });
    if (!throttle.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429, headers: { 'X-RateLimit-Reset': String(throttle.resetAt) } }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Check the form and try again.', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const socialHandle = parsed.data.socialHandle ? `@${parsed.data.socialHandle}` : null;
    const feedback = parsed.data.feedback || null;
    // The admin list labels each person by handle, or by email when no handle was given.
    const fullName = socialHandle || email;
    const ipAddress = getClientIp(request);
    const referredByCode = normalizeReferralCode(parsed.data.referredByCode);
    const input = { email, fullName, socialHandle, feedback, ipAddress: ipAddress === 'unknown' ? null : ipAddress, referredByCode };
    const result = hasSupabaseAdminEnv() ? await submitWithAdmin(input) : await submitWithPublicRpc(input);

    if (result.error) {
      return NextResponse.json({ error: 'Could not join Inner Circle right now. Please try again.' }, { status: 500 });
    }

    if (!result.referralCode) {
      return NextResponse.json({ error: 'Unable to resolve referral code.' }, { status: 500 });
    }

    // Alerts and the welcome email never block a sign-up; they finish before the response so the
    // serverless function is not frozen mid-request. Only first-time sign-ups get the email.
    const followUps = await Promise.allSettled([
      notifyWebhook({ email, social_handle: socialHandle, feedback_text: feedback, referred_by_code: referredByCode, cohort: 'Beta Waitlist', status: 'pending', is_new: Boolean(result.isNew), created_at: new Date().toISOString() }),
      result.isNew ? sendWelcomeEmail(email) : Promise.resolve(),
    ]);
    for (const outcome of followUps) {
      if (outcome.status === 'rejected') console.warn('Inner Circle follow-up failed:', outcome.reason instanceof Error ? outcome.reason.message : outcome.reason);
    }

    return NextResponse.json({
      ok: true,
      referralCode: result.referralCode,
    });
  } catch (error) {
    const isEnvError = error instanceof Error && error.message.toLowerCase().includes('supabase');
    return NextResponse.json(
      { error: isEnvError ? 'Inner Circle is not configured for this deployment yet.' : 'Unexpected server error.' },
      { status: 500 }
    );
  }
}

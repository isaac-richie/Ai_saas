import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createAdminClient, hasSupabaseAdminEnv } from '@/infrastructure/supabase/admin';
import { checkRateLimit, getClientIp } from '@/core/utils/security/rate-limit';

export const runtime = 'nodejs';

const payloadSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  fullName: z.string().min(2).max(120).optional(),
  instagramHandle: z.string().min(2).max(80).optional(),
  socialHandle: z.string().min(2).max(80).optional(),
  email: z.string().email().max(160),
  referredByCode: z.string().min(4).max(32).optional().nullable(),
}).refine((data) => data.name || data.fullName, {
  message: 'Name is required.',
  path: ['name'],
});

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

function normalizeOptionalHandle(value: string | null | undefined): string {
  const normalized = normalizeHandle(value || '');
  return normalized.length >= 2 ? normalized : 'not-provided';
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
  instagramHandle: string;
  socialHandle: string;
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
        instagram_handle: input.instagramHandle,
        social_handle: input.socialHandle,
      })
      .eq('id', existing.id);

    if (updateError) {
      return { error: updateError.message };
    }
  } else {
    referralCode = await createUniqueCode(admin);

    const { error: insertError } = await admin.from('inner_circle_waitlist').insert({
      full_name: input.fullName,
      instagram_handle: input.instagramHandle,
      social_handle: input.socialHandle,
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

  return { referralCode };
}

async function submitWithPublicRpc(input: InnerCircleInput) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc('join_inner_circle_waitlist', {
    p_email: input.email,
    p_full_name: input.fullName,
    p_instagram_handle: input.instagramHandle,
    p_referred_by_code: input.referredByCode,
    p_social_handle: input.socialHandle,
  });

  if (error) {
    return { error: error.message };
  }

  return { referralCode: getReferralCodeFromRpc(data) };
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
        { error: 'Invalid form payload.', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const fullName = (parsed.data.fullName || parsed.data.name || '').trim();
    const instagramHandle = normalizeOptionalHandle(parsed.data.instagramHandle);
    const socialHandle = normalizeOptionalHandle(parsed.data.socialHandle);
    const referredByCode = normalizeReferralCode(parsed.data.referredByCode);
    const result = hasSupabaseAdminEnv()
      ? await submitWithAdmin({ email, fullName, instagramHandle, socialHandle, referredByCode })
      : await submitWithPublicRpc({ email, fullName, instagramHandle, socialHandle, referredByCode });

    if (result.error) {
      return NextResponse.json({ error: 'Could not join Inner Circle right now. Please try again.' }, { status: 500 });
    }

    if (!result.referralCode) {
      return NextResponse.json({ error: 'Unable to resolve referral code.' }, { status: 500 });
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

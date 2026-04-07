import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/infrastructure/supabase/admin';

export const runtime = 'nodejs';

const payloadSchema = z.object({
  fullName: z.string().min(2).max(120),
  instagramHandle: z.string().min(2).max(80),
  socialHandle: z.string().min(2).max(80),
  email: z.string().email().max(160),
  referredByCode: z.string().min(4).max(32).optional().nullable(),
});

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid form payload.', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const email = parsed.data.email.trim().toLowerCase();
    const fullName = parsed.data.fullName.trim();
    const instagramHandle = normalizeHandle(parsed.data.instagramHandle);
    const socialHandle = normalizeHandle(parsed.data.socialHandle);
    const referredByCode = normalizeReferralCode(parsed.data.referredByCode);

    const { data: existing, error: existingError } = await admin
      .from('inner_circle_waitlist')
      .select('id, referral_code')
      .eq('email', email)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    let referralCode = existing?.referral_code || null;

    if (existing) {
      const { error: updateError } = await admin
        .from('inner_circle_waitlist')
        .update({
          full_name: fullName,
          instagram_handle: instagramHandle,
          social_handle: socialHandle,
        })
        .eq('id', existing.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      referralCode = await createUniqueCode(admin);

      const { error: insertError } = await admin.from('inner_circle_waitlist').insert({
        full_name: fullName,
        instagram_handle: instagramHandle,
        social_handle: socialHandle,
        email,
        referral_code: referralCode,
        referred_by_code: referredByCode,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      if (referredByCode) {
        try {
          await admin.rpc('increment_referral_count_inner_circle', {
            code_input: referredByCode,
          });
        } catch {
          // non-blocking: signup should still succeed even if referral increment fails
        }
      }
    }

    if (!referralCode) {
      return NextResponse.json({ error: 'Unable to resolve referral code.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      referralCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

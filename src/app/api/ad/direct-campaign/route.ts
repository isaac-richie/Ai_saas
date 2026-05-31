import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { StudioAdService } from '@/core/services/studio-ad/studio-ad.service';
import { checkStudioAdRateLimit } from '@/core/services/studio-ad/rate-limit';
import { studioAdCampaignRequestSchema } from '@/core/validation/studio-ad';
import { createClient } from '@/infrastructure/supabase/server';

export const runtime = 'nodejs';

function resolveStudioAdOpenAIKey(): { apiKey?: string; source?: 'env'; error?: string } {
  if (process.env.OPENAI_API_KEY) {
    return { apiKey: process.env.OPENAI_API_KEY, source: 'env' };
  }

  return {
    error: 'Assistant Director needs OPENAI_API_KEY in the server environment.',
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const throttle = checkStudioAdRateLimit(`studio-ad-campaign:${user.id}`);
    if (!throttle.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Too many Studio AD campaign requests. Please wait a moment and try again.',
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(throttle.resetAt),
          },
        }
      );
    }

    const body = await request.json().catch(() => null);
    const input = studioAdCampaignRequestSchema.parse(body);
    const resolvedKey = resolveStudioAdOpenAIKey();

    if (!resolvedKey.apiKey) {
      return NextResponse.json(
        { ok: false, error: resolvedKey.error || 'Assistant Director is missing an OpenAI key.' },
        { status: 400 }
      );
    }

    const service = new StudioAdService(resolvedKey.apiKey);
    const plan = await service.directCampaign(input);

    return NextResponse.json({
      ok: true,
      data: plan,
      engine: {
        provider: 'openai',
        model: process.env.STUDIO_AD_MODEL || 'gpt-5.5',
        keySource: resolvedKey.source,
      },
      rateLimit: {
        remaining: throttle.remaining,
        resetAt: throttle.resetAt,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid Studio AD campaign payload.',
          issues: error.flatten(),
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Studio AD campaign planning failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

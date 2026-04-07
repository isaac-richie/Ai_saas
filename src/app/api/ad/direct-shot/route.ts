import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { StudioAdService } from '@/core/services/studio-ad/studio-ad.service';
import { studioAdRequestSchema } from '@/core/validation/studio-ad';
import { createClient } from '@/infrastructure/supabase/server';
import { checkStudioAdRateLimit } from '@/core/services/studio-ad/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const throttle = checkStudioAdRateLimit(`studio-ad:${user.id}`);
    if (!throttle.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Too many Studio AD requests. Please wait a moment and try again.',
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
    const input = studioAdRequestSchema.parse(body);

    const service = new StudioAdService();
    const packet = await service.directShot(input);

    const { error: persistError } = await supabase.from('studio_ad_packets').insert({
      user_id: user.id,
      project_id: input.context?.projectId ?? null,
      scene_id: input.context?.sceneId ?? null,
      shot_id: input.context?.shotId ?? null,
      user_intent: input.userIntent,
      mode: input.mode,
      provider_target: input.providerTarget,
      output_type: input.outputType,
      project_bible: input.projectBible ?? {},
      packet,
      production_readiness: packet.score.productionReadiness,
      continuity_confidence: packet.score.continuityConfidence,
      technical_clarity: packet.score.technicalClarity,
    });

    if (persistError && !persistError.message.toLowerCase().includes('relation "studio_ad_packets" does not exist')) {
      console.error('Studio AD persistence error:', persistError.message);
    }

    return NextResponse.json({
      ok: true,
      data: packet,
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
          error: 'Invalid Studio AD request payload.',
          issues: error.flatten(),
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Studio AD failed.';
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get('limit') || 20);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 20;

    const { data, error } = await supabase
      .from('studio_ad_packets')
      .select(
        'id, created_at, user_intent, mode, provider_target, output_type, production_readiness, continuity_confidence, technical_clarity, packet'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Studio AD history failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

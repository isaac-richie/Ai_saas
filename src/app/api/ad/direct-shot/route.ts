import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { StudioAdService } from '@/core/services/studio-ad/studio-ad.service';
import { studioAdRequestSchema } from '@/core/validation/studio-ad';
import { createClient } from '@/infrastructure/supabase/server';
import { checkStudioAdRateLimit } from '@/core/services/studio-ad/rate-limit';

export const runtime = 'nodejs';

function cleanSnippet(value?: string | null, limit: number = 320): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 3)}...` : cleaned;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const value = raw?.replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }

  return output;
}

async function enrichStudioAdInput(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: ReturnType<typeof studioAdRequestSchema.parse>
) {
  const projectId = input.context?.projectId ?? null;
  const sceneId = input.context?.sceneId ?? null;
  const shotId = input.context?.shotId ?? null;

  const [projectRes, sceneRes, shotRes, elementsRes, sceneShotsRes, packetsRes] = await Promise.all([
    projectId
      ? supabase
          .from('projects')
          .select('id, name, description, aspect_ratio')
          .eq('id', projectId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sceneId
      ? supabase
          .from('scenes')
          .select('id, name, description, script_content, project_id')
          .eq('id', sceneId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    shotId
      ? supabase
          .from('shots')
          .select('id, name, description, shot_type, camera_movement, estimated_duration, prompt_text')
          .eq('id', shotId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    projectId
      ? supabase
          .from('elements')
          .select('name, type, description')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    sceneId
      ? supabase
          .from('shots')
          .select('name, description, shot_type, camera_movement, estimated_duration, prompt_text, sequence_order')
          .eq('scene_id', sceneId)
          .order('sequence_order', { ascending: true })
          .limit(6)
      : Promise.resolve({ data: [], error: null }),
    sceneId
      ? supabase
          .from('studio_ad_packets')
          .select('user_intent, packet, production_readiness, created_at')
          .eq('user_id', userId)
          .eq('scene_id', sceneId)
          .order('created_at', { ascending: false })
          .limit(4)
      : projectId
        ? supabase
            .from('studio_ad_packets')
            .select('user_intent, packet, production_readiness, created_at')
            .eq('user_id', userId)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(4)
        : supabase
            .from('studio_ad_packets')
            .select('user_intent, packet, production_readiness, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(4),
  ]);

  const project = projectRes.data;
  const scene = sceneRes.data;
  const shot = shotRes.data;
  const elements = elementsRes.data || [];
  const sceneShots = sceneShotsRes.data || [];
  const recentPackets = packetsRes.data || [];

  const recentAnchors = recentPackets.flatMap((entry) => {
    const packet = entry.packet as
      | {
          technicalMetadata?: { continuityAnchorsApplied?: string[] };
          strategy?: string;
          masterPrompt?: string;
        }
      | null;
    return packet?.technicalMetadata?.continuityAnchorsApplied || [];
  });

  const elementAnchors = elements.map((element) =>
    `${element.type}: ${element.name}${element.description ? ` - ${cleanSnippet(element.description, 120)}` : ''}`
  );

  const continuityAnchors = uniqueStrings([
    ...(input.projectBible?.continuityAnchors || []),
    ...recentAnchors,
    ...elementAnchors.map((item) => item.split(' - ')[0]),
    shot?.shot_type ? `shot type: ${shot.shot_type}` : undefined,
    shot?.camera_movement ? `camera movement: ${shot.camera_movement}` : undefined,
  ]).slice(0, 20);

  const projectSummary = uniqueStrings([
    project?.name ? `Project: ${project.name}` : undefined,
    cleanSnippet(project?.description, 260),
  ]).join(' | ');

  const sceneSummary = uniqueStrings([
    scene?.name ? `Scene: ${scene.name}` : undefined,
    cleanSnippet(scene?.description, 220),
    scene?.script_content ? `Script context: ${cleanSnippet(scene.script_content, 320)}` : undefined,
    sceneShots.length > 0
      ? `Scene coverage: ${sceneShots
          .map((entry) =>
            uniqueStrings([
              entry.name,
              entry.shot_type ? `type ${entry.shot_type}` : undefined,
              entry.camera_movement ? `move ${entry.camera_movement}` : undefined,
            ]).join(', ')
          )
          .join(' | ')}`
      : undefined,
  ]).join(' | ');

  const shotSummary = uniqueStrings([
    shot?.name ? `Shot: ${shot.name}` : undefined,
    cleanSnippet(shot?.description, 220),
    shot?.prompt_text ? `Prompt baseline: ${cleanSnippet(shot.prompt_text, 320)}` : undefined,
    shot?.estimated_duration ? `Estimated duration: ${shot.estimated_duration}` : undefined,
  ]).join(' | ');

  const recentPromptSignals = recentPackets
    .map((entry) => {
      const packet = entry.packet as
        | {
            strategy?: string;
            masterPrompt?: string;
          }
        | null;

      return uniqueStrings([
        packet?.strategy ? `Strategy: ${packet.strategy}` : undefined,
        packet?.masterPrompt ? `Prompt: ${cleanSnippet(packet.masterPrompt, 220)}` : undefined,
      ]).join(' | ');
    })
    .filter(Boolean)
    .slice(0, 4);

  return {
    ...input,
    currentPromptContext: input.currentPromptContext || shot?.prompt_text || undefined,
    projectBible: {
      ...input.projectBible,
      title: input.projectBible?.title || project?.name || undefined,
      aspectRatio: input.projectBible?.aspectRatio || project?.aspect_ratio || undefined,
      continuityAnchors,
    },
    productionMemory: {
      projectSummary: projectSummary || undefined,
      sceneSummary: sceneSummary || undefined,
      shotSummary: shotSummary || undefined,
      elementAnchors: elementAnchors.slice(0, 12),
      recentPromptSignals,
      continuitySignals: continuityAnchors.slice(0, 12),
    },
  };
}

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
    const enrichedInput = await enrichStudioAdInput(supabase, user.id, input);
    const resolvedKey = resolveStudioAdOpenAIKey();

    if (!resolvedKey.apiKey) {
      return NextResponse.json(
        { ok: false, error: resolvedKey.error || 'Assistant Director is missing an OpenAI key.' },
        { status: 400 }
      );
    }

    const service = new StudioAdService(resolvedKey.apiKey);
    const packet = await service.directShot(enrichedInput);

    const { error: persistError } = await supabase.from('studio_ad_packets').insert({
      user_id: user.id,
      project_id: enrichedInput.context?.projectId ?? null,
      scene_id: enrichedInput.context?.sceneId ?? null,
      shot_id: enrichedInput.context?.shotId ?? null,
      user_intent: enrichedInput.userIntent,
      mode: enrichedInput.mode,
      provider_target: enrichedInput.providerTarget,
      output_type: enrichedInput.outputType,
      project_bible: enrichedInput.projectBible ?? {},
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
    const projectId = url.searchParams.get('projectId');
    const sceneId = url.searchParams.get('sceneId');
    const shotId = url.searchParams.get('shotId');

    let query = supabase
      .from('studio_ad_packets')
      .select(
        'id, created_at, user_intent, mode, provider_target, output_type, production_readiness, continuity_confidence, technical_clarity, packet'
      )
      .order('created_at', { ascending: false });

    if (shotId) {
      query = query.eq('shot_id', shotId);
    } else if (sceneId) {
      query = query.eq('scene_id', sceneId);
    } else if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Studio AD history failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

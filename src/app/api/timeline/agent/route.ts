import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { createClient } from '@/infrastructure/supabase/server';
import { checkRateLimit } from '@/core/utils/security/rate-limit';
import { readBoundedBody } from '@/core/utils/security/bounded-body';
import { resolveProductionModel } from '@/core/config/production-model-routing';
import { BETA_LOCKED_MESSAGE, hasBetaAccess } from '@/core/services/beta-access';
import {
  AGENT_INSTRUCTIONS,
  agentPlanSchema,
  applyEditCommands,
  describeTimelineForAgent,
  type AgentClip,
} from '@/core/services/edit-agent';
import { songBeatsOutputSec } from '@/core/services/timeline-ops';
import { requireMediaRuntime } from '@/core/utils/security/media-runtime';
import { describeShot, frameAt, isOwnStorageUrl, mapLimited, shotInfoFromStoryboard, type ShotInfo } from '@/core/services/shot-context';

export const runtime = 'nodejs';
export const maxDuration = 90;

const requestSchema = z.object({
  timeline_id: z.string().uuid(),
  instruction: z.string().trim().min(1).max(2000),
});

const MAX_FRAMES = 16;

/** Mid-shot frames for up to MAX_FRAMES shots; shots outside our storage or slow to read get none. */
async function shotFrames(clips: { asset_url: string | null; trim_start_ms: number; start_ms: number; end_ms: number }[]) {
  if (clips.length > MAX_FRAMES) return [];
  let ffmpeg: string;
  try {
    ffmpeg = await requireMediaRuntime();
  } catch {
    return [];
  }
  const sorted = [...clips].sort((a, b) => a.start_ms - b.start_ms);
  return mapLimited(sorted, 4, (c) =>
    isOwnStorageUrl(c.asset_url, process.env.NEXT_PUBLIC_SUPABASE_URL)
      ? frameAt(ffmpeg, c.asset_url, (c.trim_start_ms + (c.end_ms - c.start_ms) / 2) / 1000)
      : Promise.resolve(null),
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!(await hasBetaAccess(user.email))) return NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 });
  if (!checkRateLimit(`timeline-agent:${user.id}`, { max: 15, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Please wait a moment before asking again.' }, { status: 429 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'The edit agent is not configured.' }, { status: 503 });
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(JSON.parse(await readBoundedBody(request, 10_000)));
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // RLS scopes every read and write below to the signed-in owner.
  const { data: timeline } = await supabase
    .from('timeline_projects')
    .select('id, color_grade_id')
    .eq('id', input.timeline_id)
    .maybeSingle();
  if (!timeline) return NextResponse.json({ error: 'Timeline not found.' }, { status: 404 });

  const { data: track } = await supabase
    .from('timeline_tracks')
    .select('id, locked')
    .eq('timeline_id', timeline.id)
    .eq('track_type', 'video')
    .order('order_index')
    .limit(1)
    .maybeSingle();
  if (!track) return NextResponse.json({ error: 'This timeline has no video track.' }, { status: 400 });
  if (track.locked) return NextResponse.json({ error: 'Your shots are locked. Unlock them to let the AI edit.' }, { status: 409 });

  const { data: rows } = await supabase
    .from('timeline_clips')
    .select('id, start_ms, end_ms, trim_start_ms, asset_url, volume, transition_out, transition_out_ms, metadata, color_grade_id')
    .eq('track_id', track.id)
    .order('start_ms');
  const clips = (rows || []) as (AgentClip & { asset_url: string | null; trim_start_ms: number })[];
  if (clips.length === 0) {
    return NextResponse.json({ error: 'Add clips to the timeline before asking the agent.' }, { status: 400 });
  }

  const { data: music } = await supabase
    .from('timeline_clips')
    .select('start_ms, end_ms, trim_start_ms, metadata, timeline_tracks!inner(timeline_id, track_type, muted)')
    .eq('timeline_tracks.timeline_id', timeline.id)
    .eq('timeline_tracks.track_type', 'audio')
    .eq('timeline_tracks.muted', false)
    .order('start_ms')
    .limit(1)
    .maybeSingle();
  const beats = songBeatsOutputSec(music ?? undefined);

  // What each shot shows: saved at import, or looked up from the storyboard for older timelines.
  const missing = clips.filter((c) => !(c.metadata as { shot?: ShotInfo } | null)?.shot && c.asset_url).map((c) => c.asset_url!);
  const fromStoryboard = new Map<string, ShotInfo>();
  if (missing.length) {
    const { data: items } = await supabase
      .from('fast_video_storyboard_items')
      .select('url, subject, prompt, enhanced_prompt')
      .in('url', missing.slice(0, 100));
    for (const item of items || []) fromStoryboard.set(item.url, shotInfoFromStoryboard(item));
  }
  for (const c of clips) {
    const info = (c.metadata as { shot?: ShotInfo } | null)?.shot ?? (c.asset_url ? fromStoryboard.get(c.asset_url) : undefined);
    c.shows = describeShot(info) || undefined;
    c.scene = info?.scene;
  }

  // One real frame from the middle of each shot, so the AI sees the footage, not only the prompt.
  const frames = await shotFrames(clips);

  const state = { clips, timeline_grade_id: timeline.color_grade_id || 'natural', beats };

  let plan: z.infer<typeof agentPlanSchema>;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.responses.parse(
      {
        model: process.env.TIMELINE_AGENT_MODEL || resolveProductionModel('timeline-editor').model,
        store: false,
        max_output_tokens: 2000,
        instructions: AGENT_INSTRUCTIONS,
        input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: JSON.stringify({ request: input.instruction, timeline: describeTimelineForAgent(state) }),
          },
          ...frames.flatMap((url, i) =>
            url
              ? [
                  { type: 'input_text' as const, text: `Frame from clip ${i + 1}:` },
                  { type: 'input_image' as const, image_url: url, detail: 'low' as const },
                ]
              : [],
          )],
        }],
        text: { format: zodTextFormat(agentPlanSchema, 'edit_plan') },
      },
      { signal: AbortSignal.timeout(45_000) },
    );
    if (!result.output_parsed) throw new Error('No plan');
    plan = result.output_parsed;
  } catch {
    return NextResponse.json({ error: 'The edit agent could not plan this edit. Try rephrasing.' }, { status: 502 });
  }

  const outcome = applyEditCommands(state, plan.commands);
  const now = new Date().toISOString();
  const before = new Map(clips.map((c) => [c.id, c]));

  if (outcome.removed_ids.length) {
    const { error } = await supabase.from('timeline_clips').delete().in('id', outcome.removed_ids);
    if (error) return NextResponse.json({ error: 'Could not save the edit.' }, { status: 500 });
  }

  for (const clip of outcome.clips) {
    const prev = before.get(clip.id);
    if (
      prev &&
      prev.start_ms === clip.start_ms &&
      prev.end_ms === clip.end_ms &&
      prev.volume === clip.volume &&
      prev.transition_out === clip.transition_out &&
      prev.transition_out_ms === clip.transition_out_ms &&
      (prev.color_grade_id ?? null) === (clip.color_grade_id ?? null)
    ) continue;
    const { error } = await supabase
      .from('timeline_clips')
      .update({
        start_ms: clip.start_ms,
        end_ms: clip.end_ms,
        volume: clip.volume,
        transition_out: clip.transition_out,
        transition_out_ms: clip.transition_out_ms,
        color_grade_id: clip.color_grade_id ?? null,
        updated_at: now,
      })
      .eq('id', clip.id);
    if (error) return NextResponse.json({ error: 'Could not save the edit.' }, { status: 500 });
  }

  await supabase
    .from('timeline_projects')
    .update({ color_grade_id: outcome.timeline_grade_id, duration_ms: outcome.duration_ms, updated_at: now })
    .eq('id', timeline.id);

  if (outcome.applied.length) {
    await supabase.from('edit_commands').insert(
      outcome.applied.map((command) => ({
        timeline_id: timeline.id,
        command_type: command.type,
        parameters: { ...command, instruction: input.instruction },
        source: 'ai_agent',
      })),
    );
  }

  return NextResponse.json(
    {
      summary: plan.summary,
      applied: outcome.applied.length,
      rejected: outcome.rejected.map((r) => r.reason),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createClient } from '@/infrastructure/supabase/server';
import { checkRateLimit } from '@/core/utils/security/rate-limit';
import { requireMediaRuntime, MediaRuntimeUnavailableError } from '@/core/utils/security/media-runtime';
import { BETA_LOCKED_MESSAGE, hasBetaAccess } from '@/core/services/beta-access';
import { probeMedia } from '@/core/services/media-probe';
import { buildTranscriptWords, readWords, sourceKeyOf, type SourceTranscript } from '@/core/services/transcript';
import { fetchPublicBytes, UnsafeUrlError } from '@/core/utils/security/safe-fetch';
import type { TimelineClip } from '@/core/types/timeline';

const execFileAsync = promisify(execFile);
export const runtime = 'nodejs';
export const maxDuration = 180;

// `redo` starts transcribing everything again; later rounds of that redo pass back `redo_since`
// (from the first reply, in server time) so sources already redone aren't done twice.
const bodySchema = z.object({ timeline_id: z.string().uuid(), redo: z.boolean().default(false), redo_since: z.string().datetime({ offset: true }).optional() });
const MAX_CLIP_BYTES = 300 * 1024 * 1024;
/** Mono 48 kbps stays under the speech model's 25 MB for about 70 minutes; 40 leaves room. */
const MAX_SOURCE_SEC = 40 * 60;
/** Sources per request, so one call fits in the time limit; the editor asks again for the rest. */
const PER_CALL = 4;
const ENGINE = () => process.env.TRANSCRIBE_MODEL || 'whisper-1';

/**
 * Transcribes each source video in the edit once, in full, so words that are cut can be brought
 * back later. Transcripts are kept per source, separate from the shots on the timeline.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!(await hasBetaAccess(user.email))) return NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 });
  if (!checkRateLimit(`timeline-transcript:${user.id}`, { max: 12, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Please wait a moment before trying again.' }, { status: 429 });
  }
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Transcripts are not configured.' }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { timeline_id, redo } = parsed.data;
  const since = redo ? new Date().toISOString() : parsed.data.redo_since;

  // Row-level security limits timelines, tracks, clips and transcripts to their owner.
  const { data: timeline } = await supabase.from('timeline_projects').select('id').eq('id', timeline_id).maybeSingle();
  if (!timeline) return NextResponse.json({ error: 'Timeline not found.' }, { status: 404 });
  const { data: track } = await supabase.from('timeline_tracks').select('id').eq('timeline_id', timeline_id).eq('track_type', 'video').order('order_index').limit(1).maybeSingle();
  if (!track) return NextResponse.json({ error: 'Add clips to the timeline first.' }, { status: 400 });
  const { data: clipRows } = await supabase.from('timeline_clips').select('*').eq('track_id', track.id).order('start_ms');
  const clips = (clipRows || []) as TimelineClip[];
  if (!clips.length) return NextResponse.json({ error: 'Add clips to the timeline first.' }, { status: 400 });

  const { data: existing, error: readError } = await supabase.from('timeline_transcripts').select('source_key, updated_at').eq('timeline_id', timeline_id);
  if (readError) return NextResponse.json({ error: 'Transcripts are not set up yet. Run the latest database update.' }, { status: 503 });
  const done = new Set((existing || []).filter((r) => !since || Date.parse(r.updated_at) >= Date.parse(since)).map((r) => r.source_key as string));

  // One entry per source still to transcribe, with somewhere to read it from.
  const todo = new Map<string, TimelineClip>();
  for (const clip of clips) {
    const key = sourceKeyOf(clip);
    if (key && !done.has(key) && !todo.has(key)) todo.set(key, clip);
  }
  const batch = [...todo.entries()].slice(0, PER_CALL);

  let ffmpeg: string | null = null;
  if (batch.length) {
    try {
      ffmpeg = await requireMediaRuntime();
    } catch (error) {
      const message = error instanceof MediaRuntimeUnavailableError ? error.message : 'Transcripts are unavailable right now.';
      return NextResponse.json({ error: message }, { status: 503 });
    }
  }

  const failed: string[] = [];
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tmpDir = await mkdtemp(join(tmpdir(), 'timeline-transcript-'));
  try {
    for (const [index, [key, clip]] of batch.entries()) {
      try {
        let url = clip.asset_url;
        if (clip.take_id) {
          const { data: take } = await supabase.from('shot_generations').select('output_url').eq('id', clip.take_id).maybeSingle();
          url = take?.output_url ?? url;
        }
        if (!url) { failed.push(clip.id); continue; }
        const path = join(tmpDir, `source-${index}`);
        await writeFile(path, await fetchPublicBytes(url, MAX_CLIP_BYTES, AbortSignal.timeout(60_000)));
        const info = await probeMedia(ffmpeg!, path).catch(() => null);
        let row: { language: string | null; engine: string; words: unknown[] };
        if (!info?.hasAudio) {
          // No sound: saved as empty so it is not tried again.
          row = { language: null, engine: 'none', words: [] };
        } else if (info.durationSec > MAX_SOURCE_SEC) {
          failed.push(clip.id);
          continue;
        } else {
          const audio = join(tmpDir, `speech-${index}.mp3`);
          await execFileAsync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio], { maxBuffer: 16 * 1024 * 1024 });
          const result = await client.audio.transcriptions.create(
            {
              file: await toFile(await readFile(audio), 'speech.mp3'),
              model: ENGINE(),
              response_format: 'verbose_json',
              prompt: 'VisioWave',
              timestamp_granularities: ['word', 'segment'],
            },
            { signal: AbortSignal.timeout(120_000) },
          );
          row = { language: result.language || null, engine: ENGINE(), words: buildTranscriptWords(result.words || [], result.segments || []) };
        }
        const { error } = await supabase
          .from('timeline_transcripts')
          .upsert({ timeline_id, user_id: user.id, source_key: key, ...row, updated_at: new Date().toISOString() }, { onConflict: 'timeline_id,source_key' });
        if (error) failed.push(clip.id);
      } catch (error) {
        if ((error as { status?: number }).status === 429) {
          return NextResponse.json({ error: 'The speech service is out of credit right now.' }, { status: 503 });
        }
        if (!(error instanceof UnsafeUrlError)) console.error('transcript source failed', (error as Error)?.message);
        failed.push(clip.id);
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const { data: rows } = await supabase.from('timeline_transcripts').select('source_key, language, words').eq('timeline_id', timeline_id);
  const transcripts: SourceTranscript[] = (rows || []).map((r) => ({ source_key: r.source_key, language: r.language, words: readWords(r.words) }));
  const failedKeys = new Set(batch.filter(([, c]) => failed.includes(c.id)).map(([k]) => k));
  return NextResponse.json(
    { transcripts, failed: failed.length, remaining: Math.max(0, todo.size - batch.length), retry_later: failedKeys.size, redo_since: since ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

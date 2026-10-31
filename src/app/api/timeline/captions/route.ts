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
import { isCaptionStyle, wordsToCaptionSegments } from '@/core/services/captions';

const execFileAsync = promisify(execFile);
export const runtime = 'nodejs';
export const maxDuration = 180;

const bodySchema = z.object({
  timeline_id: z.string().uuid(),
  storage_key: z.string().max(300),
  style: z.string().default('standard'),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!(await hasBetaAccess(user.email))) return NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 });
  if (!checkRateLimit(`timeline-captions:${user.id}`, { max: 3, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Please wait a moment before trying again.' }, { status: 429 });
  }
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Auto captions are not configured.' }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { timeline_id, storage_key } = parsed.data;
  const style = isCaptionStyle(parsed.data.style) ? parsed.data.style : 'standard';

  const { data: timeline } = await supabase.from('timeline_projects').select('id, project_id').eq('id', timeline_id).maybeSingle();
  if (!timeline) return NextResponse.json({ error: 'Timeline not found.' }, { status: 404 });
  const prefix = `${user.id}/timeline/${timeline.project_id}/${timeline_id}/`;
  if (!storage_key.startsWith(prefix) || !/^render-\d+\.mp4$/.test(storage_key.slice(prefix.length))) {
    return NextResponse.json({ error: 'Render the video first, then add captions.' }, { status: 400 });
  }

  let ffmpeg: string;
  try {
    ffmpeg = await requireMediaRuntime();
  } catch (error) {
    const message = error instanceof MediaRuntimeUnavailableError ? error.message : 'Captions are unavailable right now.';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data: file } = await supabase.storage.from('renders').download(storage_key);
  if (!file) return NextResponse.json({ error: 'Could not find that render.' }, { status: 404 });

  const tmpDir = await mkdtemp(join(tmpdir(), 'timeline-captions-'));
  try {
    const video = join(tmpDir, 'video.mp4');
    await writeFile(video, Buffer.from(await file.arrayBuffer()));
    if (!(await probeMedia(ffmpeg, video)).hasAudio) {
      return NextResponse.json({ error: 'This video has no sound to caption. Add text captions instead.' }, { status: 422 });
    }
    const audio = join(tmpDir, 'speech.mp3');
    await execFileAsync(ffmpeg, ['-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcript = await client.audio.transcriptions.create(
      {
        file: await toFile(await readFile(audio), 'speech.mp3'),
        model: process.env.TRANSCRIBE_MODEL || 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      },
      { signal: AbortSignal.timeout(120_000) },
    );
    const words = (transcript.words || []).map((w) => ({ word: w.word, start_sec: w.start, end_sec: w.end }));
    const segments = wordsToCaptionSegments(words);
    if (segments.length === 0) {
      return NextResponse.json({ error: 'No speech was found. Add text captions instead.' }, { status: 422 });
    }

    const { data: tracks } = await supabase
      .from('timeline_tracks')
      .select('id, track_type')
      .eq('timeline_id', timeline_id)
      .order('order_index');
    let captionTrack = tracks?.find((t) => t.track_type === 'caption');
    if (!captionTrack) {
      const { data: created } = await supabase
        .from('timeline_tracks')
        .insert({ timeline_id, name: 'Captions', track_type: 'caption', order_index: tracks?.length ?? 0 })
        .select('id, track_type')
        .single();
      if (!created) throw new Error('track');
      captionTrack = created;
    }

    // Re-running replaces earlier automatic captions but keeps text the creator typed.
    await supabase.from('timeline_clips').delete().eq('track_id', captionTrack.id).eq('metadata->>source', 'auto');
    const { error } = await supabase.from('timeline_clips').insert(
      segments.slice(0, 500).map((seg) => ({
        track_id: captionTrack!.id,
        clip_type: 'caption',
        start_ms: Math.round(seg.start_sec * 1000),
        end_ms: Math.round(seg.end_sec * 1000),
        metadata: { text: seg.text, style, words: seg.words, source: 'auto' },
      })),
    );
    if (error) throw new Error('insert');
    return NextResponse.json({ captions: segments.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 429) return NextResponse.json({ error: 'The captioning service is out of credit right now.' }, { status: 503 });
    return NextResponse.json({ error: 'Could not create captions. Try again.' }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

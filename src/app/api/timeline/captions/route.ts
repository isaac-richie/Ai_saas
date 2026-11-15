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
import { audibleCues, buildSpeechMixArgs, type SpeechCue } from '@/core/services/caption-audio';
import { clipSpeed, timelineToOutputMs } from '@/core/services/timeline-ops';
import { fetchPublicBytes, UnsafeUrlError } from '@/core/utils/security/safe-fetch';
import type { TimelineClip } from '@/core/types/timeline';

const execFileAsync = promisify(execFile);
export const runtime = 'nodejs';
export const maxDuration = 180;

const bodySchema = z.object({
  timeline_id: z.string().uuid(),
  style: z.string().default('standard'),
});
const MAX_CLIPS = 60;
const MAX_CLIP_BYTES = 300 * 1024 * 1024;
/** The speech model takes files up to 25 MB; mono 48 kbps keeps a long edit well under that. */
const MAX_SPEECH_SEC = 40 * 60;

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
  const { timeline_id } = parsed.data;
  const style = isCaptionStyle(parsed.data.style) ? parsed.data.style : 'standard';

  // Row-level security limits timelines, tracks and clips to their owner.
  const { data: timeline } = await supabase.from('timeline_projects').select('id').eq('id', timeline_id).maybeSingle();
  if (!timeline) return NextResponse.json({ error: 'Timeline not found.' }, { status: 404 });
  const { data: tracks } = await supabase.from('timeline_tracks').select('id, track_type, muted').eq('timeline_id', timeline_id).order('order_index');
  const videoTrack = tracks?.find((t) => t.track_type === 'video');
  if (!videoTrack) return NextResponse.json({ error: 'Add clips to the timeline first.' }, { status: 400 });
  if (videoTrack.muted) return NextResponse.json({ error: 'The shots track is muted, so there is no speech to caption.' }, { status: 422 });
  const { data: clipRows } = await supabase.from('timeline_clips').select('*').eq('track_id', videoTrack.id).order('start_ms');
  const videoClips = (clipRows || []) as TimelineClip[];
  if (videoClips.length === 0) return NextResponse.json({ error: 'Add clips to the timeline first.' }, { status: 400 });
  if (videoClips.length > MAX_CLIPS) return NextResponse.json({ error: `Auto captions work on edits of up to ${MAX_CLIPS} shots.` }, { status: 400 });
  const totalSec = timelineToOutputMs(videoClips, Math.max(...videoClips.map((c) => c.end_ms))) / 1000;
  if (!(totalSec > 0) || totalSec > MAX_SPEECH_SEC) return NextResponse.json({ error: 'This edit is too long to caption in one go.' }, { status: 400 });

  let ffmpeg: string;
  try {
    ffmpeg = await requireMediaRuntime();
  } catch (error) {
    const message = error instanceof MediaRuntimeUnavailableError ? error.message : 'Captions are unavailable right now.';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'timeline-captions-'));
  try {
    // The edit as it is now, not an exported file: each shot's own sound, trimmed and timed as it plays.
    const cues: SpeechCue[] = [];
    for (let i = 0; i < videoClips.length; i++) {
      const clip = videoClips[i];
      if (!(clip.volume > 0)) continue;
      let url = clip.asset_url;
      if (!url && clip.take_id) {
        const { data: take } = await supabase.from('shot_generations').select('output_url').eq('id', clip.take_id).maybeSingle();
        url = take?.output_url ?? null;
      }
      if (!url) continue;
      const path = join(tmpDir, `clip-${i}`);
      await writeFile(path, await fetchPublicBytes(url, MAX_CLIP_BYTES, AbortSignal.timeout(60_000)));
      if (!(await probeMedia(ffmpeg, path).catch(() => null))?.hasAudio) continue;
      const startSec = timelineToOutputMs(videoClips, clip.start_ms) / 1000;
      const endSec = timelineToOutputMs(videoClips, clip.end_ms) / 1000;
      cues.push({ path, startSec, trimSec: Math.max(0, clip.trim_start_ms) / 1000, durationSec: endSec - startSec, speed: clipSpeed(clip), volume: clip.volume });
    }
    if (audibleCues(cues).length === 0) {
      return NextResponse.json({ error: 'None of the shots has sound to caption. Add text instead.' }, { status: 422 });
    }
    const audio = join(tmpDir, 'speech.mp3');
    await execFileAsync(ffmpeg, buildSpeechMixArgs(cues, totalSec, audio), { maxBuffer: 16 * 1024 * 1024 });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcript = await client.audio.transcriptions.create(
      {
        file: await toFile(await readFile(audio), 'speech.mp3'),
        model: process.env.TRANSCRIBE_MODEL || 'whisper-1',
        response_format: 'verbose_json',
        // Spelling hint so the brand name comes out right.
        prompt: 'VisioWave',
        timestamp_granularities: ['word'],
      },
      { signal: AbortSignal.timeout(120_000) },
    );
    const words = (transcript.words || []).map((w) => ({ word: w.word, start_sec: w.start, end_sec: w.end }));
    const segments = wordsToCaptionSegments(words);
    if (segments.length === 0) {
      return NextResponse.json({ error: 'No speech was found. Add text captions instead.' }, { status: 422 });
    }

    let captionTrack = tracks?.find((t) => t.track_type === 'caption');
    if (!captionTrack) {
      const { data: created } = await supabase
        .from('timeline_tracks')
        .insert({ timeline_id, name: 'Captions', track_type: 'caption', order_index: tracks?.length ?? 0 })
        .select('id, track_type, muted')
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
    if (error instanceof UnsafeUrlError) return NextResponse.json({ error: 'A shot could not be loaded for captioning.' }, { status: 400 });
    const status = (error as { status?: number }).status;
    if (status === 429) return NextResponse.json({ error: 'The captioning service is out of credit right now.' }, { status: 503 });
    return NextResponse.json({ error: 'Could not create captions. Try again.' }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

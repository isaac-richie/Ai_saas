import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createClient } from '@/infrastructure/supabase/server';
import { checkRateLimit } from '@/core/utils/security/rate-limit';
import { requireMediaRuntime, MediaRuntimeUnavailableError } from '@/core/utils/security/media-runtime';
import { BETA_LOCKED_MESSAGE, hasBetaAccess } from '@/core/services/beta-access';
import { probeMedia } from '@/core/services/media-probe';
import { decodeMono, detectBeats } from '@/core/services/beat-detect';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_MUSIC_BYTES = 40 * 1024 * 1024;
const MAX_MUSIC_SEC = 600;
const bodySchema = z.object({
  timeline_id: z.string().uuid(),
  storage_path: z.string().max(400),
  name: z.string().trim().max(120).default('Music'),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!(await hasBetaAccess(user.email))) return NextResponse.json({ error: BETA_LOCKED_MESSAGE }, { status: 403 });
  if (!checkRateLimit(`timeline-music:${user.id}`, { max: 6, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: 'Please wait a moment before adding more music.' }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { timeline_id, storage_path, name } = parsed.data;
  if (!/^[0-9a-f-]{36}\/music\/[0-9a-f-]{36}\.(mp3|m4a|aac|wav|ogg)$/i.test(storage_path) || !storage_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'Upload the song again.' }, { status: 400 });
  }

  const { data: timeline } = await supabase.from('timeline_projects').select('id').eq('id', timeline_id).maybeSingle();
  if (!timeline) return NextResponse.json({ error: 'Timeline not found.' }, { status: 404 });

  let ffmpeg: string;
  try {
    ffmpeg = await requireMediaRuntime();
  } catch (error) {
    const message = error instanceof MediaRuntimeUnavailableError ? error.message : 'Music is unavailable right now.';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data: file } = await supabase.storage.from('elements').download(storage_path);
  if (!file) return NextResponse.json({ error: 'Upload the song again.' }, { status: 404 });
  if (file.size > MAX_MUSIC_BYTES) return NextResponse.json({ error: 'Songs must be under 40 MB.' }, { status: 413 });

  const tmpDir = await mkdtemp(join(tmpdir(), 'timeline-music-'));
  try {
    const local = join(tmpDir, 'song');
    await writeFile(local, Buffer.from(await file.arrayBuffer()));
    const info = await probeMedia(ffmpeg, local).catch(() => null);
    if (!info?.hasAudio || !(info.durationSec > 1)) {
      return NextResponse.json({ error: 'That file is not a song we can play.' }, { status: 422 });
    }
    const analysis = detectBeats(await decodeMono(ffmpeg, local, MAX_MUSIC_SEC));
    const durationMs = Math.round(Math.min(info.durationSec, MAX_MUSIC_SEC) * 1000);

    const { data: tracks } = await supabase
      .from('timeline_tracks')
      .select('id, track_type, order_index')
      .eq('timeline_id', timeline_id)
      .order('order_index');
    let audioTrack = tracks?.find((t) => t.track_type === 'audio');
    if (!audioTrack) {
      const { data: created, error } = await supabase
        .from('timeline_tracks')
        .insert({ timeline_id, name: 'Music', track_type: 'audio', order_index: (tracks?.length ?? 0) })
        .select('id, track_type, order_index')
        .single();
      if (error || !created) throw new Error('track');
      audioTrack = created;
    }

    const { data: videoTrack } = await supabase
      .from('timeline_tracks')
      .select('id')
      .eq('timeline_id', timeline_id)
      .eq('track_type', 'video')
      .order('order_index')
      .limit(1)
      .maybeSingle();
    const { data: lastVideo } = videoTrack
      ? await supabase.from('timeline_clips').select('end_ms').eq('track_id', videoTrack.id).order('end_ms', { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    const videoEnd = lastVideo?.end_ms ?? 0;

    // One song at a time keeps "sync to the beat" unambiguous.
    await supabase.from('timeline_clips').delete().eq('track_id', audioTrack.id);
    const { data: clip, error } = await supabase
      .from('timeline_clips')
      .insert({
        track_id: audioTrack.id,
        clip_type: 'audio',
        asset_url: supabase.storage.from('elements').getPublicUrl(storage_path).data.publicUrl,
        start_ms: 0,
        end_ms: videoEnd > 0 ? Math.min(durationMs, videoEnd) : durationMs,
        volume: 0.8,
        metadata: {
          storage_path,
          name,
          source_duration_ms: durationMs,
          bpm: analysis.bpm,
          beats: analysis.beats.slice(0, 4000),
          beat_confidence: analysis.confidence,
          fade_in_sec: 0.5,
          fade_out_sec: 1.5,
        },
      })
      .select('*')
      .single();
    if (error || !clip) throw new Error('clip');

    return NextResponse.json({ clip, bpm: analysis.bpm, beats: analysis.beats.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not add that song. Try another file.' }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

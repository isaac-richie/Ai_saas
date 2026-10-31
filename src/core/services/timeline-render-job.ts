import type { SupabaseClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import type { TimelineClip, TimelineTrack, TransitionType } from '@/core/types/timeline';
import { buildXfadeFilter, TRANSITION_REGISTRY, type ClipTransitionPair } from '@/core/services/transitions';
import { getGradeById, buildColorGradeFilter } from '@/core/services/color-grading';
import {
  buildMusicMixArgs,
  buildNormalizeArgs,
  effectiveDurationSec,
  clipFrames,
  parseResolution,
  renderFps,
  type MusicCue,
} from '@/core/services/timeline-render';
import { buildCaptionBurnInArgs, isCaptionStyle, segmentsToAss, type CaptionWord } from '@/core/services/captions';
import { probeMedia } from '@/core/services/media-probe';
import { fetchPublicBytes } from '@/core/utils/security/safe-fetch';
import { DEFAULT_FRAME_FIT, isFrameFit } from '@/core/services/video-format';

const execFileAsync = promisify(execFile);
const MAX_CLIPS = 60;
const MAX_CLIP_BYTES = 300 * 1024 * 1024;
const MAX_MUSIC_BYTES = 40 * 1024 * 1024;
export const CAPTION_FONTS_DIR = resolve(process.cwd(), 'assets/fonts');

/** A message safe to show the creator; anything else is reported generically. */
export class RenderError extends Error {}

export interface RenderContext {
  supabase: SupabaseClient;
  userId: string;
  timelineId: string;
  ffmpeg: string;
  onProgress: (progress: number, stage: string) => Promise<void>;
  /** Downloads clip footage; defaults to the public-HTTPS-only fetcher. */
  fetchClip?: (url: string) => Promise<Buffer>;
}

/** A transition set on the last shot means "end the film this way": a fade out. */
function endingFade(clip: TimelineClip): { sec: number; color: 'black' | 'white' } | undefined {
  const t = clip.transition_out;
  if (!t || t === 'cut' || !TRANSITION_REGISTRY[t as TransitionType]) return undefined;
  const sec = (clip.transition_out_ms || TRANSITION_REGISTRY[t as TransitionType].default_duration_ms) / 1000;
  return { sec: Math.max(0.2, Math.min(3, sec)), color: t === 'fade_white' ? 'white' : 'black' };
}

/** Storage paths for uploads must sit in the user's own folder. */
export function ownStoragePath(path: unknown, userId: string): string | null {
  if (typeof path !== 'string' || !path.startsWith(`${userId}/`) || path.includes('..') || path.length > 400) return null;
  return path;
}

export async function renderTimeline(ctx: RenderContext): Promise<{ url: string; storageKey: string; clips: number }> {
  const { supabase, ffmpeg } = ctx;
  const { data: timeline } = await supabase
    .from('timeline_projects')
    .select('*')
    .eq('id', ctx.timelineId)
    .maybeSingle();
  if (!timeline) throw new RenderError('Timeline not found.');

  const { data: trackRows } = await supabase
    .from('timeline_tracks')
    .select('*')
    .eq('timeline_id', ctx.timelineId)
    .order('order_index');
  const tracks = (trackRows || []) as TimelineTrack[];
  const videoTrack = tracks.find((t) => t.track_type === 'video');
  if (!videoTrack) throw new RenderError('This timeline has no video track.');

  const { data: clipRows } = await supabase
    .from('timeline_clips')
    .select('*')
    .in('track_id', tracks.map((t) => t.id))
    .order('start_ms');
  const allClips = (clipRows || []) as TimelineClip[];
  const clips = allClips.filter((c) => c.track_id === videoTrack.id);
  if (clips.length === 0) throw new RenderError('Add clips to the timeline before rendering.');
  if (clips.length > MAX_CLIPS) throw new RenderError(`Renders are limited to ${MAX_CLIPS} clips.`);

  const tmpDir = await mkdtemp(join(tmpdir(), 'timeline-render-'));
  try {
    const [width, height] = parseResolution(timeline.resolution);
    const fps = renderFps(timeline.fps);
    const fit = isFrameFit(timeline.frame_fit) ? timeline.frame_fit : DEFAULT_FRAME_FIT;
    const normalized: string[] = [];
    const durations: number[] = [];

    for (let i = 0; i < clips.length; i++) {
      await ctx.onProgress(5 + Math.round((i / clips.length) * 55), `Preparing clip ${i + 1} of ${clips.length}`);
      const clip = clips[i];
      let url = clip.asset_url;
      if (!url && clip.take_id) {
        const { data: take } = await supabase.from('shot_generations').select('output_url').eq('id', clip.take_id).maybeSingle();
        url = take?.output_url ?? null;
      }
      if (!url) throw new RenderError(`Clip ${i + 1} has no footage.`);

      const sourcePath = join(tmpDir, `clip-${i}`);
      const fetchClip = ctx.fetchClip ?? ((u: string) => fetchPublicBytes(u, MAX_CLIP_BYTES, AbortSignal.timeout(60_000)));
      await writeFile(sourcePath, await fetchClip(url));
      const info = await probeMedia(ffmpeg, sourcePath);
      if (!info.hasVideo) throw new RenderError(`Clip ${i + 1} is not a playable video.`);
      const trimStartSec = Math.max(0, clip.trim_start_ms) / 1000;
      const usableSec = effectiveDurationSec((clip.end_ms - clip.start_ms) / 1000, info.durationSec, trimStartSec);
      if (usableSec <= 0) throw new RenderError(`Clip ${i + 1} has no usable footage after its trim point.`);
      const durationSec = clipFrames(clip.start_ms, clip.start_ms + usableSec * 1000, info.durationSec - trimStartSec, fps) / fps;

      const grade = getGradeById(clip.color_grade_id || timeline.color_grade_id || 'natural');
      const outPath = join(tmpDir, `norm-${i}.mov`);
      await execFileAsync(ffmpeg, buildNormalizeArgs({
        input: sourcePath,
        output: outPath,
        trimStartSec,
        durationSec,
        width,
        height,
        fps,
        colorFilter: grade ? buildColorGradeFilter(grade) : '',
        hasAudio: info.hasAudio,
        volume: clip.volume,
        fit,
        fadeOut: i === clips.length - 1 ? endingFade(clip) : undefined,
      }), { maxBuffer: 16 * 1024 * 1024 });
      normalized.push(outPath);
      durations.push(durationSec);
    }

    await ctx.onProgress(62, 'Joining shots');
    let current = join(tmpDir, 'picture.mp4');
    if (normalized.length === 1) {
      await execFileAsync(ffmpeg, ['-y', '-i', normalized[0], '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', current]);
    } else {
      const pairs: ClipTransitionPair[] = [];
      for (let i = 0; i < clips.length - 1; i++) {
        const transition = (clips[i].transition_out || 'cut') as TransitionType;
        pairs.push({
          clip_a_path: normalized[i],
          clip_b_path: normalized[i + 1],
          clip_a_duration_sec: durations[i],
          clip_b_duration_sec: durations[i + 1],
          transition,
          duration_ms: clips[i].transition_out_ms || TRANSITION_REGISTRY[transition]?.default_duration_ms || 0,
        });
      }
      const { inputArgs, filterComplex, maps } = buildXfadeFilter(pairs, { fps });
      await execFileAsync(ffmpeg, [
        '-y', ...inputArgs, '-filter_complex', filterComplex, ...maps,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', current,
      ], { maxBuffer: 16 * 1024 * 1024 });
    }
    const totalSec = (await probeMedia(ffmpeg, current)).durationSec;

    const musicTracks = new Set(tracks.filter((t) => t.track_type === 'audio' && !t.muted).map((t) => t.id));
    const musicClips = allClips.filter((c) => musicTracks.has(c.track_id) && c.start_ms / 1000 < totalSec);
    if (musicClips.length || videoTrack.muted) {
      await ctx.onProgress(75, 'Mixing music');
      const cues: MusicCue[] = [];
      for (let i = 0; i < musicClips.length; i++) {
        const clip = musicClips[i];
        const meta = (clip.metadata || {}) as Record<string, unknown>;
        const path = ownStoragePath(meta.storage_path, ctx.userId);
        if (!path) continue;
        const { data: file } = await supabase.storage.from('elements').download(path);
        if (!file || file.size > MAX_MUSIC_BYTES) throw new RenderError('A music file could not be loaded.');
        const local = join(tmpDir, `music-${i}`);
        await writeFile(local, Buffer.from(await file.arrayBuffer()));
        cues.push({
          path: local,
          startSec: clip.start_ms / 1000,
          trimSec: clip.trim_start_ms / 1000,
          durationSec: (clip.end_ms - clip.start_ms) / 1000,
          volume: clip.volume,
          fadeInSec: Number(meta.fade_in_sec ?? 0.5),
          fadeOutSec: Number(meta.fade_out_sec ?? 1.5),
        });
      }
      const mixed = join(tmpDir, 'mixed.mp4');
      if (cues.length) {
        await execFileAsync(ffmpeg, buildMusicMixArgs({ video: current, output: mixed, totalSec, keepVideoAudio: !videoTrack.muted, music: cues }), { maxBuffer: 16 * 1024 * 1024 });
        current = mixed;
      } else if (videoTrack.muted) {
        await execFileAsync(ffmpeg, ['-y', '-i', current, '-c:v', 'copy', '-an', mixed]);
        current = mixed;
      }
    }

    const captionTracks = new Set(tracks.filter((t) => t.track_type === 'caption' && t.visible).map((t) => t.id));
    const captions = allClips
      .filter((c) => captionTracks.has(c.track_id))
      .map((c) => {
        const meta = (c.metadata || {}) as Record<string, unknown>;
        return {
          start_sec: c.start_ms / 1000,
          end_sec: Math.min(totalSec, c.end_ms / 1000),
          text: typeof meta.text === 'string' ? meta.text.slice(0, 300) : '',
          style: isCaptionStyle(meta.style) ? meta.style : undefined,
          words: Array.isArray(meta.words) ? (meta.words as CaptionWord[]).slice(0, 100) : undefined,
        };
      })
      .filter((c) => c.text.trim() && c.end_sec > c.start_sec);
    if (captions.length) {
      await ctx.onProgress(85, 'Adding captions');
      const assPath = join(tmpDir, 'captions.ass');
      await writeFile(assPath, segmentsToAss(captions, 'standard', width, height));
      const captioned = join(tmpDir, 'captioned.mp4');
      await execFileAsync(ffmpeg, buildCaptionBurnInArgs(current, assPath, captioned, CAPTION_FONTS_DIR), { maxBuffer: 16 * 1024 * 1024 });
      current = captioned;
    }

    await ctx.onProgress(93, 'Saving your video');
    const finalPath = join(tmpDir, 'final.mp4');
    await execFileAsync(ffmpeg, ['-y', '-i', current, '-c', 'copy', '-movflags', '+faststart', finalPath]);
    const storageKey = `${ctx.userId}/timeline/${timeline.project_id}/${ctx.timelineId}/render-${Date.now()}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('renders')
      .upload(storageKey, await readFile(finalPath), { contentType: 'video/mp4', upsert: false });
    if (uploadError) throw new RenderError('Could not store the finished video.');
    const { data: { publicUrl } } = supabase.storage.from('renders').getPublicUrl(storageKey);
    return { url: publicUrl, storageKey, clips: clips.length };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

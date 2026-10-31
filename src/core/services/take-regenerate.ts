import { FAST_VIDEO_ASPECT_RATIOS } from '@/core/config/fast-video-presets';
import { getKieVideoModelFamily, resolveKieVideoModelByFamily } from '@/core/config/kie-video-models';
import { mediaReferencesSchema } from '@/core/validation/media-reference';
import { shotFramesSchema } from '@/core/validation/shot-frames';
import type { FastVideoRequest } from '@/core/validation/fast-video';

/** The storyboard columns a new take is rebuilt from. */
export interface StoryboardShot {
  id: string;
  prompt: string | null;
  enhanced_prompt?: string | null;
  direction?: string | null;
  model_family_id: string | null;
  duration_seconds: number | null;
  start_frame?: unknown;
  end_frame?: unknown;
  media_references?: unknown;
}

/** A take generated for a timeline shot; earlier takes are kept so the creator can switch back. */
export interface Take {
  url: string;
  source_duration_ms: number;
  created_at: string;
  note?: string;
}

export interface PendingTake {
  task_id: string;
  started_at: string;
  duration_sec: number;
  note?: string;
}

export const MAX_TAKES = 8;
/** A generation still unfinished after this long is treated as lost. */
export const PENDING_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Rebuilds the generator request that made a storyboard shot: same prompt, model, references
 * and start/end frames (so continuity with the neighbouring shots holds), at a chosen length,
 * with an optional plain-language change ("slower", "closer on her face").
 */
export function buildRegenerateRequest(
  shot: StoryboardShot,
  ctx: { projectId: string; sceneId: string | null; aspectRatio: string | null },
  options: { durationSec?: number; note?: string } = {},
): { request: FastVideoRequest } | { error: string } {
  const base = (shot.enhanced_prompt || shot.prompt || shot.direction || '').trim();
  if (base.length < 3) return { error: 'This shot has no prompt to make it again from.' };

  const note = (options.note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const textSubject = note ? `${base}\n\nChange for this take: ${note}` : base;

  const family = getKieVideoModelFamily(shot.model_family_id);
  const wanted = options.durationSec ?? shot.duration_seconds ?? 5;
  const duration = Math.round(Math.min(family.maxSeconds, Math.max(family.minSeconds, Number.isFinite(wanted) ? wanted : 5)));

  // Stored frames and references are re-validated; anything malformed is dropped, never sent.
  const frames = shotFramesSchema.safeParse({ start: shot.start_frame ?? null, end: shot.end_frame ?? null, transitionDirection: '' });
  const shotFrames = frames.success && (frames.data.start || frames.data.end) ? frames.data : null;
  const refs = mediaReferencesSchema.safeParse(shot.media_references ?? []);
  const mediaReferences = refs.success ? refs.data : [];

  const aspect = FAST_VIDEO_ASPECT_RATIOS.find((r) => r === ctx.aspectRatio) ?? '16:9';
  const usesImage = Boolean(shotFrames?.start) || mediaReferences.some((r) => r.applied && r.target === 'provider');

  return {
    request: {
      request_type: 'fast_video',
      project_id: ctx.projectId,
      scene_id: ctx.sceneId,
      prompt_inputs: {
        text_subject: textSubject,
        aspect_ratio: aspect,
        media_references: mediaReferences,
        ...(shotFrames ? { shot_frames: shotFrames } : {}),
        variation_setting: 'balanced',
      },
      settings: {
        duration_seconds: duration,
        model: resolveKieVideoModelByFamily({ familyId: family.id, useImageToVideo: usesImage }),
      },
    },
  };
}

/** Puts a finished take on the clip, keeping the previous footage in the take list. */
export function applyTake<C extends { asset_url: string | null; start_ms: number; end_ms: number; trim_start_ms: number; metadata: unknown }>(
  clip: C,
  take: Take,
  options: { keepLength: boolean },
): C {
  const meta = { ...((clip.metadata as Record<string, unknown>) || {}) };
  const takes = (Array.isArray(meta.takes) ? (meta.takes as Take[]) : []).filter((t) => t && t.url !== take.url);
  if (clip.asset_url && !takes.some((t) => t.url === clip.asset_url)) {
    takes.unshift({
      url: clip.asset_url,
      source_duration_ms: Number(meta.source_duration_ms) || clip.end_ms - clip.start_ms,
      created_at: typeof meta.take_created_at === 'string' ? meta.take_created_at : new Date(0).toISOString(),
    });
  }
  delete meta.pending_take;
  const length = options.keepLength ? Math.min(clip.end_ms - clip.start_ms, take.source_duration_ms) : take.source_duration_ms;
  return {
    ...clip,
    asset_url: take.url,
    trim_start_ms: 0,
    end_ms: clip.start_ms + Math.max(300, length),
    metadata: { ...meta, source_duration_ms: take.source_duration_ms, take_created_at: take.created_at, takes: takes.slice(0, MAX_TAKES) },
  };
}

/** Lays the video track end to end again after one shot changed length. */
export function rippleFrom<C extends { id: string; start_ms: number; end_ms: number }>(clips: C[]): C[] {
  let cursor = 0;
  return [...clips]
    .sort((a, b) => a.start_ms - b.start_ms)
    .map((c) => {
      const next = { ...c, start_ms: cursor, end_ms: cursor + (c.end_ms - c.start_ms) };
      cursor = next.end_ms;
      return next;
    });
}

export function isPendingStale(pending: PendingTake | undefined, now = Date.now()): boolean {
  return !pending || !Number.isFinite(Date.parse(pending.started_at)) || now - Date.parse(pending.started_at) > PENDING_TIMEOUT_MS;
}

import type { TransitionType } from '@/core/types/timeline';

export interface TransitionSpec {
  ffmpeg_name: string;
  default_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  description: string;
  category: 'hard' | 'blend' | 'wipe' | 'motion';
}

export const TRANSITION_REGISTRY: Record<TransitionType, TransitionSpec> = {
  cut: {
    ffmpeg_name: 'concat',
    default_duration_ms: 0,
    min_duration_ms: 0,
    max_duration_ms: 0,
    description: 'Hard cut — instant switch between clips',
    category: 'hard',
  },
  crossfade: {
    ffmpeg_name: 'fade',
    default_duration_ms: 500,
    min_duration_ms: 100,
    max_duration_ms: 3000,
    description: 'Cross dissolve — both clips blend together',
    category: 'blend',
  },
  fade_black: {
    ffmpeg_name: 'fadeblack',
    default_duration_ms: 800,
    min_duration_ms: 200,
    max_duration_ms: 3000,
    description: 'Fade through black',
    category: 'blend',
  },
  fade_white: {
    ffmpeg_name: 'fadewhite',
    default_duration_ms: 800,
    min_duration_ms: 200,
    max_duration_ms: 3000,
    description: 'Fade through white',
    category: 'blend',
  },
  wipe_left: {
    ffmpeg_name: 'wipeleft',
    default_duration_ms: 600,
    min_duration_ms: 200,
    max_duration_ms: 2000,
    description: 'Wipe from right to left',
    category: 'wipe',
  },
  wipe_right: {
    ffmpeg_name: 'wiperight',
    default_duration_ms: 600,
    min_duration_ms: 200,
    max_duration_ms: 2000,
    description: 'Wipe from left to right',
    category: 'wipe',
  },
  dissolve: {
    ffmpeg_name: 'dissolve',
    default_duration_ms: 700,
    min_duration_ms: 200,
    max_duration_ms: 3000,
    description: 'Pixel dissolve — random pixels swap',
    category: 'blend',
  },
};

export const EXTENDED_TRANSITIONS = {
  j_cut: {
    description: 'Audio from next clip starts before the video cuts',
    requires_audio: true,
    audio_offset_ms: -500,
  },
  l_cut: {
    description: 'Audio from current clip continues after video cuts to next',
    requires_audio: true,
    audio_offset_ms: 500,
  },
  match_cut: {
    description: 'Visual match between last frame and first frame of next clip',
    requires_ai: true,
  },
  smash_cut: {
    description: 'Abrupt tonal shift — loud to quiet or vice versa',
    requires_ai: true,
  },
  jump_cut: {
    description: 'Same subject, different time — skip forward',
    requires_ai: true,
  },
  whip_pan: {
    description: 'Fast pan blur between clips',
    requires_motion_blur: true,
  },
  iris_wipe: {
    ffmpeg_name: 'circleopen',
    default_duration_ms: 600,
  },
  speed_ramp: {
    description: 'Speed ramps down then up across the cut',
    requires_tempo: true,
  },
} as const;

export type ExtendedTransitionType = keyof typeof EXTENDED_TRANSITIONS;

export interface ClipTransitionPair {
  clip_a_path: string;
  clip_b_path: string;
  clip_a_duration_sec: number;
  clip_b_duration_sec: number;
  transition: TransitionType;
  duration_ms: number;
}

/**
 * Joins clips into one picture and sound. Cuts are butt-joined (no overlap); every other
 * transition overlaps the two clips by its duration. With `fps`, overlaps are whole frames so
 * the picture and the sound shorten by exactly the same amount and never drift apart.
 */
export function buildXfadeFilter(
  pairs: ClipTransitionPair[],
  options: { mute?: boolean; fps?: number } = {},
): { inputArgs: string[]; filterComplex: string; maps: string[] } {
  if (pairs.length === 0) throw new Error('Need at least one transition pair');

  const allPaths = [pairs[0].clip_a_path, ...pairs.map((p) => p.clip_b_path)];
  const inputArgs = allPaths.flatMap((p) => ['-i', p]);
  const fps = options.fps && options.fps > 0 ? options.fps : 0;
  const toFrames = (sec: number) => (fps ? Math.max(1, Math.round(sec * fps)) / fps : sec);

  // concat and xfade need matching time bases on every input.
  const filters: string[] = allPaths.map((_, i) => `[${i}:v]settb=AVTB[v${i}]`);
  let videoLabel = 'v0';
  let audioLabel = '0:a';
  let timelineSec = pairs[0].clip_a_duration_sec;

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const transition = TRANSITION_REGISTRY[pair.transition] ? pair.transition : 'cut';
    const spec = TRANSITION_REGISTRY[transition];
    const nextV = `vx${i}`;
    const nextA = `ax${i}`;

    if (transition === 'cut') {
      if (options.mute) {
        filters.push(`[${videoLabel}][v${i + 1}]concat=n=2:v=1:a=0[${nextV}]`);
      } else {
        filters.push(`[${videoLabel}][${audioLabel}][v${i + 1}][${i + 1}:a]concat=n=2:v=1:a=1[${nextV}][${nextA}]`);
        audioLabel = nextA;
      }
      videoLabel = nextV;
      timelineSec += pair.clip_b_duration_sec;
      continue;
    }

    const durSec = toFrames(Math.max(
      spec.min_duration_ms / 1000,
      Math.min(
        pair.duration_ms / 1000,
        spec.max_duration_ms / 1000,
        pair.clip_a_duration_sec / 2,
        pair.clip_b_duration_sec / 2,
      ),
    ));
    const offset = Math.max(0, timelineSec - durSec);
    filters.push(
      `[${videoLabel}][v${i + 1}]xfade=transition=${spec.ffmpeg_name}:duration=${durSec.toFixed(4)}:offset=${offset.toFixed(4)}[${nextV}]`,
    );
    videoLabel = nextV;
    if (!options.mute) {
      filters.push(`[${audioLabel}][${i + 1}:a]acrossfade=d=${durSec.toFixed(4)}:c1=tri:c2=tri[${nextA}]`);
      audioLabel = nextA;
    }
    timelineSec += pair.clip_b_duration_sec - durSec;
  }

  const maps = [`-map`, `[${videoLabel}]`];
  if (!options.mute) maps.push(`-map`, `[${audioLabel}]`);

  return { inputArgs, filterComplex: filters.join(';'), maps };
}

export function validateTransitionDuration(
  transition: TransitionType,
  duration_ms: number,
  clip_a_ms: number,
  clip_b_ms: number,
): { valid: boolean; clamped_ms: number; error?: string } {
  const spec = TRANSITION_REGISTRY[transition];
  if (!spec) return { valid: false, clamped_ms: 0, error: `Unknown transition: ${transition}` };

  const maxByClips = Math.min(clip_a_ms / 2, clip_b_ms / 2);
  const clamped = Math.max(
    spec.min_duration_ms,
    Math.min(duration_ms, spec.max_duration_ms, maxByClips),
  );

  if (clamped !== duration_ms) {
    return {
      valid: false,
      clamped_ms: clamped,
      error: `Duration ${duration_ms}ms clamped to ${clamped}ms (clip limits: ${maxByClips}ms, spec max: ${spec.max_duration_ms}ms)`,
    };
  }

  return { valid: true, clamped_ms: clamped };
}

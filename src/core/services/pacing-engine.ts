export interface PacingProfile {
  id: string;
  name: string;
  description: string;
  min_clip_sec: number;
  max_clip_sec: number;
  avg_clip_sec: number;
  beat_sync_weight: number;
  transition_preference: string[];
}

export const PACING_PROFILES: Record<string, PacingProfile> = {
  trailer: {
    id: 'trailer',
    name: 'Trailer',
    description: 'Fast cuts, high energy, 1-3s clips',
    min_clip_sec: 0.5,
    max_clip_sec: 3,
    avg_clip_sec: 1.5,
    beat_sync_weight: 0.9,
    transition_preference: ['cut', 'crossfade'],
  },
  commercial: {
    id: 'commercial',
    name: 'Commercial',
    description: 'Punchy, 2-4s clips, product-focused',
    min_clip_sec: 1,
    max_clip_sec: 4,
    avg_clip_sec: 2.5,
    beat_sync_weight: 0.7,
    transition_preference: ['cut', 'crossfade', 'wipe_right'],
  },
  music_video: {
    id: 'music_video',
    name: 'Music Video',
    description: 'Beat-synced cuts, 1-4s, rhythm-driven',
    min_clip_sec: 0.5,
    max_clip_sec: 4,
    avg_clip_sec: 2,
    beat_sync_weight: 1.0,
    transition_preference: ['cut', 'dissolve'],
  },
  documentary: {
    id: 'documentary',
    name: 'Documentary',
    description: 'Slow, contemplative, 5-10s clips',
    min_clip_sec: 3,
    max_clip_sec: 15,
    avg_clip_sec: 7,
    beat_sync_weight: 0.2,
    transition_preference: ['crossfade', 'fade_black', 'dissolve'],
  },
  narrative: {
    id: 'narrative',
    name: 'Narrative Film',
    description: 'Story-driven, 3-8s, varied pace',
    min_clip_sec: 2,
    max_clip_sec: 10,
    avg_clip_sec: 4.5,
    beat_sync_weight: 0.3,
    transition_preference: ['cut', 'crossfade', 'fade_black'],
  },
  social_short: {
    id: 'social_short',
    name: 'Social Short',
    description: 'Ultra-fast, hook-first, 0.5-2s clips',
    min_clip_sec: 0.3,
    max_clip_sec: 2,
    avg_clip_sec: 1,
    beat_sync_weight: 0.8,
    transition_preference: ['cut'],
  },
};

export interface MurchScore {
  emotion: number;
  story: number;
  rhythm: number;
  eye_trace: number;
  plane_2d: number;
  space_3d: number;
  total: number;
}

export const MURCH_WEIGHTS = {
  emotion: 0.51,
  story: 0.23,
  rhythm: 0.10,
  eye_trace: 0.07,
  plane_2d: 0.05,
  space_3d: 0.04,
} as const;

export function scoreCutPoint(scores: Omit<MurchScore, 'total'>): MurchScore {
  const total =
    scores.emotion * MURCH_WEIGHTS.emotion +
    scores.story * MURCH_WEIGHTS.story +
    scores.rhythm * MURCH_WEIGHTS.rhythm +
    scores.eye_trace * MURCH_WEIGHTS.eye_trace +
    scores.plane_2d * MURCH_WEIGHTS.plane_2d +
    scores.space_3d * MURCH_WEIGHTS.space_3d;

  return { ...scores, total: Math.round(total * 1000) / 1000 };
}

export interface PacingAnalysis {
  avg_clip_duration_sec: number;
  variance: number;
  total_duration_sec: number;
  clip_count: number;
  pace_rating: 'too_slow' | 'slow' | 'balanced' | 'fast' | 'too_fast';
  recommendation: string;
}

export function analyzePacing(
  clipDurations: number[],
  profile: PacingProfile,
): PacingAnalysis {
  if (clipDurations.length === 0) {
    return {
      avg_clip_duration_sec: 0,
      variance: 0,
      total_duration_sec: 0,
      clip_count: 0,
      pace_rating: 'balanced',
      recommendation: 'Add clips to the timeline',
    };
  }

  const total = clipDurations.reduce((a, b) => a + b, 0);
  const avg = total / clipDurations.length;
  const variance =
    clipDurations.reduce((sum, d) => sum + (d - avg) ** 2, 0) / clipDurations.length;

  let pace_rating: PacingAnalysis['pace_rating'];
  let recommendation: string;

  const ratio = avg / profile.avg_clip_sec;

  if (ratio < 0.5) {
    pace_rating = 'too_fast';
    recommendation = `Clips average ${avg.toFixed(1)}s — too fast for ${profile.name}. Lengthen clips or switch to a faster profile.`;
  } else if (ratio < 0.8) {
    pace_rating = 'fast';
    recommendation = `Slightly faster than ${profile.name} target (${profile.avg_clip_sec}s). Consider lengthening a few clips.`;
  } else if (ratio > 2) {
    pace_rating = 'too_slow';
    recommendation = `Clips average ${avg.toFixed(1)}s — too slow for ${profile.name}. Trim clips or switch to a slower profile.`;
  } else if (ratio > 1.3) {
    pace_rating = 'slow';
    recommendation = `Slightly slower than ${profile.name} target. Consider tightening a few clips.`;
  } else {
    pace_rating = 'balanced';
    recommendation = `Pacing is well-matched to the ${profile.name} profile.`;
  }

  return {
    avg_clip_duration_sec: Math.round(avg * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    total_duration_sec: Math.round(total * 100) / 100,
    clip_count: clipDurations.length,
    pace_rating,
    recommendation,
  };
}

export function suggestCutPoints(
  totalDuration: number,
  profile: PacingProfile,
): number[] {
  const cuts: number[] = [];
  let cursor = profile.avg_clip_sec;

  while (cursor < totalDuration - profile.min_clip_sec) {
    cuts.push(Math.round(cursor * 1000) / 1000);
    cursor += profile.avg_clip_sec;
  }

  return cuts;
}

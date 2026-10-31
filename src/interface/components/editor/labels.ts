import type { TransitionType } from '@/core/types/timeline';
import type { CaptionStyle } from '@/core/services/captions';

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: 'Cut',
  crossfade: 'Crossfade',
  dissolve: 'Dissolve',
  fade_black: 'Fade to black',
  fade_white: 'Fade to white',
  wipe_left: 'Wipe left',
  wipe_right: 'Wipe right',
};

/** Rough in-browser approximations of each grade, so the preview hints at the final look. */
export const GRADE_PREVIEW_FILTER: Record<string, string> = {
  natural: 'none',
  'warm-film': 'sepia(0.18) saturate(1.1) contrast(1.05) brightness(1.02)',
  'cool-noir': 'saturate(0.8) contrast(1.12) hue-rotate(-8deg) brightness(0.97)',
  'teal-orange': 'saturate(1.18) contrast(1.08) hue-rotate(-6deg)',
  'bleach-bypass': 'saturate(0.55) contrast(1.25) brightness(0.97)',
  'vintage-fade': 'sepia(0.22) saturate(0.75) contrast(0.9) brightness(1.04)',
  'cinematic-vignette': 'sepia(0.08) contrast(1.06) saturate(1.05)',
  'horror-green': 'saturate(0.7) contrast(1.15) hue-rotate(18deg) brightness(0.93)',
  'golden-hour': 'sepia(0.28) saturate(1.25) brightness(1.05)',
  moonlight: 'saturate(0.6) contrast(1.08) hue-rotate(-18deg) brightness(0.9)',
  documentary: 'saturate(0.9) contrast(1.04)',
  'music-video': 'saturate(1.4) contrast(1.2) brightness(1.02)',
};

/** Preview styling that mirrors the burned-in caption styles. */
export const CAPTION_PREVIEW_CLASS: Record<CaptionStyle, string> = {
  standard: 'bottom-[7%] text-[clamp(13px,3.6cqw,30px)] font-semibold text-white [text-shadow:0_0_3px_#000,0_1px_2px_#000]',
  karaoke: 'bottom-[9%] text-[clamp(14px,4.2cqw,34px)] font-bold text-[#d9c08a] [text-shadow:0_0_4px_#000,0_1px_2px_#000]',
  cinematic_lower_third: 'bottom-[6%] text-[clamp(12px,3cqw,26px)] italic text-white/95 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]',
  bold_center: 'top-1/2 -translate-y-1/2 text-[clamp(18px,6.2cqw,56px)] font-extrabold text-white [text-shadow:0_0_5px_#000,0_2px_3px_#000]',
};

/** Short clock time for rulers and badges: "0:05", or "0:05.2" with tenths. */
export function formatClock(ms: number, tenths = false): string {
  const safe = Math.max(0, ms);
  const totalSec = tenths ? Math.floor(safe / 100) / 10 : Math.round(safe / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  return `${min}:${tenths ? sec.toFixed(1).padStart(4, '0') : String(sec).padStart(2, '0')}`;
}

export function formatTime(ms: number, fps = 24): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.floor(safe / 1000);
  const frames = Math.floor((safe % 1000) / (1000 / fps));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}.${String(frames).padStart(2, '0')}`;
}

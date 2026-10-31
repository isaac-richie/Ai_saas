/** The frame shapes a video can be made in, and how footage of another shape fills them. */

export const VIDEO_FORMATS = [
  { id: 'widescreen', label: 'Widescreen', ratio: '16:9', resolution: '1920x1080', hint: 'YouTube, TV, laptops' },
  { id: 'vertical', label: 'Vertical', ratio: '9:16', resolution: '1080x1920', hint: 'TikTok, Reels, Shorts' },
  { id: 'portrait', label: 'Portrait', ratio: '4:5', resolution: '1080x1350', hint: 'Instagram and Facebook feeds' },
  { id: 'square', label: 'Square', ratio: '1:1', resolution: '1080x1080', hint: 'Feeds and ads' },
] as const;

export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const FRAME_FITS = [
  { id: 'blur', label: 'Blurred background', hint: 'Whole picture, soft edges' },
  { id: 'fill', label: 'Fill the frame', hint: 'Crops the sides' },
  { id: 'fit', label: 'Black bars', hint: 'Whole picture, plain edges' },
] as const;

export type FrameFit = (typeof FRAME_FITS)[number]['id'];

export const DEFAULT_FRAME_FIT: FrameFit = 'blur';

export function isFrameFit(value: unknown): value is FrameFit {
  return FRAME_FITS.some((f) => f.id === value);
}

export function isFormatResolution(value: unknown): value is VideoFormat['resolution'] {
  return VIDEO_FORMATS.some((f) => f.resolution === value);
}

/** The named format for a resolution; anything unknown is treated as widescreen. */
export function formatFor(resolution: string | null | undefined): VideoFormat {
  return VIDEO_FORMATS.find((f) => f.resolution === resolution) ?? VIDEO_FORMATS[0];
}

/**
 * ffmpeg filters that put footage of any shape into a w×h frame. A single-input graph, so it
 * works inside -vf. The blurred background is built small and scaled up, which is much faster.
 */
export function buildFrameFilter(w: number, h: number, fit: FrameFit): string {
  if (fit === 'fill') return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const fitted = `scale=${w}:${h}:force_original_aspect_ratio=decrease`;
  if (fit === 'fit') return `${fitted},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`;
  const bw = Math.max(2, Math.round(w / 8 / 2) * 2);
  const bh = Math.max(2, Math.round(h / 8 / 2) * 2);
  // boxblur rejects a radius over half the (half-size) colour planes, so tiny frames blur less.
  const radius = Math.max(1, Math.min(6, Math.floor(Math.min(bw, bh) / 4)));
  return [
    'split=2[vwbg][vwfg]',
    `[vwbg]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=${radius}:2,eq=brightness=-0.06:saturation=1.1,scale=${w}:${h}[vwback]`,
    `[vwfg]${fitted}[vwfront]`,
    '[vwback][vwfront]overlay=(W-w)/2:(H-h)/2',
  ].join(';');
}

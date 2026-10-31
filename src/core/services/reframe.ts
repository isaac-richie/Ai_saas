export const REFRAME_TARGETS = {
  '9:16': { label: 'Vertical', ratio: 9 / 16, width: 1080, height: 1920 },
  '1:1': { label: 'Square', ratio: 1, width: 1080, height: 1080 },
  '4:5': { label: 'Portrait', ratio: 4 / 5, width: 1080, height: 1350 },
} as const;

export type ReframeAspect = keyof typeof REFRAME_TARGETS;

/** Subject centre at a moment, as fractions of the frame (0..1). */
export interface SubjectKeyframe {
  t: number;
  x: number;
  y: number;
}

export const MAX_KEYFRAMES = 30;

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5);

/** The largest window of the target aspect that fits inside the source. */
export function cropSize(sourceW: number, sourceH: number, ratio: number): { w: number; h: number } {
  if (sourceW / sourceH > ratio) return { w: Math.min(even(sourceW), even(sourceH * ratio)), h: even(sourceH) };
  return { w: even(sourceW), h: Math.min(even(sourceH), even(sourceW / ratio)) };
}

/** Evenly spaced sample times, one per interval midpoint, capped so long videos stay cheap. */
export function sampleTimes(durationSec: number, max = 24): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const count = Math.max(1, Math.min(max, Math.ceil(durationSec)));
  const step = durationSec / count;
  return Array.from({ length: count }, (_, i) => Math.round((i + 0.5) * step * 1000) / 1000);
}

/**
 * Cleans raw detections into a calm camera path: invalid points dropped, values clamped,
 * a three-point average to remove jitter, and a dead zone so tiny drifts hold the frame still.
 */
export function smoothKeyframes(raw: SubjectKeyframe[], deadZone = 0.04): SubjectKeyframe[] {
  const points = raw
    .filter((k) => Number.isFinite(k.t) && k.t >= 0)
    .map((k) => ({ t: k.t, x: clamp01(k.x), y: clamp01(k.y) }))
    .sort((a, b) => a.t - b.t)
    .filter((k, i, all) => i === 0 || k.t > all[i - 1].t);
  if (points.length === 0) return [];

  // A symmetric window: steady motion passes through unchanged, and the ends are never pulled inward.
  const averaged = points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    const [a, b] = [points[i - 1], points[i + 1]];
    return { t: p.t, x: (a.x + p.x + b.x) / 3, y: (a.y + p.y + b.y) / 3 };
  });

  const held: SubjectKeyframe[] = [averaged[0]];
  for (const p of averaged.slice(1)) {
    const prev = held[held.length - 1];
    held.push({
      t: p.t,
      x: Math.abs(p.x - prev.x) < deadZone ? prev.x : p.x,
      y: Math.abs(p.y - prev.y) < deadZone ? prev.y : p.y,
    });
  }

  if (held.length <= MAX_KEYFRAMES) return held;
  const stride = (held.length - 1) / (MAX_KEYFRAMES - 1);
  return Array.from({ length: MAX_KEYFRAMES }, (_, i) => held[Math.round(i * stride)]);
}

/** Pixel offsets of the crop window that centre it on each keyframe without leaving the frame. */
export function cropPath(
  keyframes: SubjectKeyframe[],
  sourceW: number,
  sourceH: number,
  crop: { w: number; h: number },
): { t: number; x: number; y: number }[] {
  const maxX = sourceW - crop.w;
  const maxY = sourceH - crop.h;
  const path = (keyframes.length ? keyframes : [{ t: 0, x: 0.5, y: 0.5 }]).map((k) => ({
    t: k.t,
    x: Math.round(Math.max(0, Math.min(maxX, k.x * sourceW - crop.w / 2))),
    y: Math.round(Math.max(0, Math.min(maxY, k.y * sourceH - crop.h / 2))),
  }));
  return path;
}

/** An ffmpeg expression in `t` that moves linearly between points and holds at both ends. */
export function piecewiseExpr(points: { t: number; v: number }[]): string {
  if (points.length === 0) return '0';
  const num = (n: number) => String(Math.round(n * 1000) / 1000);
  let expr = num(points[points.length - 1].v);
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i];
    const b = points[i + 1];
    const span = b.t - a.t;
    const segment = a.v === b.v || span <= 0 ? num(a.v) : `${num(a.v)}+(${num(b.v - a.v)})*(t-${num(a.t)})/${num(span)}`;
    expr = `if(lt(t,${num(b.t)}),${segment},${expr})`;
  }
  return `if(lt(t,${num(points[0].t)}),${num(points[0].v)},${expr})`;
}

export function buildReframeFilter(
  keyframes: SubjectKeyframe[],
  sourceW: number,
  sourceH: number,
  aspect: ReframeAspect,
): string {
  const target = REFRAME_TARGETS[aspect];
  const crop = cropSize(sourceW, sourceH, target.ratio);
  const path = cropPath(smoothKeyframes(keyframes), sourceW, sourceH, crop);
  const x = piecewiseExpr(path.map((p) => ({ t: p.t, v: p.x })));
  const y = piecewiseExpr(path.map((p) => ({ t: p.t, v: p.y })));
  // Quoted so the commas inside if() are not read as filter separators.
  return `crop=${crop.w}:${crop.h}:'${x}':'${y}',scale=${target.width}:${target.height}:flags=lanczos,setsar=1`;
}

export function buildReframeArgs(input: string, output: string, filter: string): string[] {
  return [
    '-y', '-i', input,
    '-vf', filter,
    '-map', '0:v:0', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    output,
  ];
}

/** Maps the vision model's per-frame answers onto sample times, ignoring unknown frame numbers. */
export function detectionsToKeyframes(
  times: number[],
  detections: { frame: number; x: number; y: number }[],
): SubjectKeyframe[] {
  const seen = new Set<number>();
  const keyframes: SubjectKeyframe[] = [];
  for (const d of detections) {
    const index = d.frame - 1;
    if (!Number.isInteger(index) || index < 0 || index >= times.length || seen.has(index)) continue;
    if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
    seen.add(index);
    keyframes.push({ t: times[index], x: d.x, y: d.y });
  }
  return keyframes.sort((a, b) => a.t - b.t);
}

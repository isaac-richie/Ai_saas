import { buildFrameFilter, type FrameFit } from '@/core/services/video-format';

export interface NormalizeOptions {
  input: string;
  output: string;
  trimStartSec: number;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  colorFilter: string;
  hasAudio: boolean;
  volume: number;
  /** How footage of another shape fills the frame; black bars when not given. */
  fit?: FrameFit;
  /** Plays the footage faster (2) or in slow motion (0.5); 1 when not given. */
  speed?: number;
  /** Fades picture and sound out at the end of this clip (used for the last shot). */
  fadeOut?: { sec: number; color: 'black' | 'white' };
}

export function parseResolution(resolution: string | null | undefined): [number, number] {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(resolution || '');
  if (!match) return [1920, 1080];
  // libx264 with yuv420p needs even dimensions.
  const even = (n: number) => Math.max(2, Math.min(7680, n - (n % 2)));
  return [even(Number(match[1])), even(Number(match[2]))];
}

/** The usable length of a clip: what the timeline asks for, limited by the footage after the trim point. */
export function effectiveDurationSec(requestedSec: number, probedSec: number, trimStartSec: number): number {
  const remaining = probedSec - Math.max(0, trimStartSec);
  if (!Number.isFinite(remaining) || remaining <= 0.05) return 0;
  return Math.min(Math.max(0.05, requestedSec), remaining);
}

/** atempo only takes 0.5–2 per step, so wider changes are chained (0.25 = 0.5 × 0.5). */
export function atempoChain(speed: number): string[] {
  const steps: string[] = [];
  let rest = Math.max(0.25, Math.min(4, speed));
  while (rest > 2 + 1e-9) { steps.push('atempo=2'); rest /= 2; }
  while (rest < 0.5 - 1e-9) { steps.push('atempo=0.5'); rest /= 0.5; }
  if (Math.abs(rest - 1) > 1e-9) steps.push(`atempo=${rest.toFixed(4)}`);
  return steps;
}

/** The whole-number frame rate a render uses. */
export function renderFps(fps: number | null | undefined): number {
  return Number.isFinite(fps) && fps! > 0 ? Math.min(120, Math.round(fps!)) : 24;
}

/**
 * How many frames a clip lasts. Its start and end are each rounded to the nearest frame, so
 * rounding never adds up along the edit and cuts stay where the timeline puts them (which
 * keeps beat-synced cuts and captions in place). Never longer than the footage allows.
 */
export function clipFrames(startMs: number, endMs: number, footageSec: number, fps: number): number {
  const span = Math.round((endMs * fps) / 1000) - Math.round((startMs * fps) / 1000);
  const available = Math.floor(footageSec * fps + 1e-6);
  return Math.max(1, Math.min(span, available));
}

/**
 * Re-encodes one clip (to a .mov) at the timeline's frame size, rate and grade. Every output gets a
 * stereo track (silence when the source has none) because the transition chain crossfades audio.
 */
export function buildNormalizeArgs(o: NormalizeOptions): string[] {
  const fps = renderFps(o.fps);
  const endFade = o.fadeOut && o.fadeOut.sec > 0 ? Math.min(o.fadeOut.sec, o.durationSec / 2) : 0;
  const speed = Number.isFinite(o.speed) && o.speed! > 0 ? Math.max(0.25, Math.min(4, o.speed!)) : 1;
  const vf = [
    // Retime first, so the frame rate and padding below work on the new timing.
    ...(speed !== 1 ? [`setpts=PTS/${speed.toFixed(4)}`] : []),
    buildFrameFilter(o.width, o.height, o.fit ?? 'fit'),
    'setsar=1',
    `fps=${fps}`,
    // Holds the last frame if the picture ends before the sound, so every clip is exactly -t long.
    'tpad=stop_mode=clone:stop=-1',
    ...(o.colorFilter ? [o.colorFilter] : []),
    ...(endFade ? [`fade=t=out:st=${(o.durationSec - endFade).toFixed(3)}:d=${endFade.toFixed(3)}:color=${o.fadeOut!.color}`] : []),
  ].join(',');

  const volume = Number.isFinite(o.volume) ? Math.max(0, Math.min(2, o.volume)) : 1;
  // apad + -t makes the sound exactly as long as the picture, so joined clips stay in sync.
  const af = [
    `volume=${volume.toFixed(3)}`, 'aresample=48000', 'aformat=channel_layouts=stereo',
    ...(speed !== 1 && o.hasAudio ? atempoChain(speed) : []),
    ...(endFade ? [`afade=t=out:st=${(o.durationSec - endFade).toFixed(3)}:d=${endFade.toFixed(3)}`] : []),
    'apad',
  ].join(',');

  const args = ['-y'];
  if (o.trimStartSec > 0) args.push('-ss', o.trimStartSec.toFixed(3));
  args.push('-i', o.input);
  if (!o.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  args.push(
    '-t', o.durationSec.toFixed(3),
    '-map', '0:v:0',
    '-map', o.hasAudio ? '0:a:0' : '1:a:0',
    '-vf', vf,
    '-af', af,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    // Uncompressed sound in a .mov: AAC would pad every clip to its frame size and the
    // padding adds up to audible drift across a long edit.
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    o.output,
  );
  return args;
}

export interface MusicCue {
  path: string;
  /** Where the music starts in the finished video. */
  startSec: number;
  /** Where playback starts inside the music file. */
  trimSec: number;
  durationSec: number;
  volume: number;
  fadeInSec: number;
  fadeOutSec: number;
}

const n3 = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0).toFixed(3);

/**
 * Lays music under the finished picture: each cue trimmed, faded and delayed into place,
 * ducked beneath the clips' own sound, and the whole mix faded out with the last shot.
 */
export function buildMusicMixArgs(o: {
  video: string;
  output: string;
  totalSec: number;
  keepVideoAudio: boolean;
  music: MusicCue[];
}): string[] {
  if (o.music.length === 0) throw new Error('No music to mix');
  const filters: string[] = [];
  o.music.forEach((m, i) => {
    const duration = Math.max(0.05, Math.min(m.durationSec, o.totalSec - m.startSec));
    const fadeIn = Math.min(m.fadeInSec, duration / 2);
    const fadeOut = Math.min(m.fadeOutSec, duration / 2);
    const delayMs = Math.round(Math.max(0, m.startSec) * 1000);
    const volume = Number.isFinite(m.volume) ? Math.max(0, Math.min(2, m.volume)) : 1;
    filters.push(
      `[${i + 1}:a]atrim=start=${n3(m.trimSec)}:duration=${n3(duration)},asetpts=PTS-STARTPTS,` +
        `aresample=48000,aformat=channel_layouts=stereo,volume=${volume.toFixed(3)},` +
        `afade=t=in:st=0:d=${n3(fadeIn)},afade=t=out:st=${n3(duration - fadeOut)}:d=${n3(fadeOut)},` +
        `adelay=${delayMs}|${delayMs}[m${i}]`,
    );
  });
  const musicInputs = o.music.map((_, i) => `[m${i}]`).join('');
  filters.push(
    o.music.length > 1
      ? `${musicInputs}amix=inputs=${o.music.length}:duration=longest:normalize=0[music]`
      : `${musicInputs}anull[music]`,
  );

  const endFade = Math.min(1.5, o.totalSec / 4);
  const tail = `afade=t=out:st=${n3(o.totalSec - endFade)}:d=${n3(endFade)}`;
  if (o.keepVideoAudio) {
    filters.push(
      '[0:a]asplit=2[voice][key]',
      '[music][key]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=400[ducked]',
      `[voice][ducked]amix=inputs=2:duration=first:normalize=0,${tail}[aout]`,
    );
  } else {
    filters.push(`[music]apad,${tail}[aout]`);
  }

  return [
    '-y', '-i', o.video,
    ...o.music.flatMap((m) => ['-i', m.path]),
    '-filter_complex', filters.join(';'),
    '-map', '0:v:0', '-map', '[aout]',
    '-t', n3(o.totalSec),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    o.output,
  ];
}

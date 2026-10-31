export interface BeatMarker {
  time_sec: number;
  strength: number;
}

export interface AudioDuckingConfig {
  threshold_db: number;
  reduction_db: number;
  attack_ms: number;
  release_ms: number;
}

export const DEFAULT_DUCKING: AudioDuckingConfig = {
  threshold_db: -20,
  reduction_db: -12,
  attack_ms: 50,
  release_ms: 300,
};

export interface AudioFadeConfig {
  fade_in_ms: number;
  fade_out_ms: number;
}

export function snapCutsToBeats(
  cutPoints: number[],
  beats: BeatMarker[],
  toleranceSec: number = 0.15,
): number[] {
  let previous = -Infinity;
  return cutPoints.map((cut) => {
    let closest = cut;
    let minDist = Infinity;
    for (const beat of beats) {
      const dist = Math.abs(cut - beat.time_sec);
      if (dist < minDist) {
        minDist = dist;
        closest = beat.time_sec;
      }
    }
    let snapped = minDist <= toleranceSec ? closest : cut;
    // Two cuts landing on one beat would leave a zero-length clip between them.
    if (snapped <= previous) snapped = cut > previous ? cut : previous + 0.001;
    previous = snapped;
    return snapped;
  });
}

export function buildDuckingFilter(
  voiceTrackIndex: number,
  musicTrackIndex: number,
  config: AudioDuckingConfig = DEFAULT_DUCKING,
): string {
  return [
    `[${voiceTrackIndex}:a]asplit=2[voice][voicesc]`,
    `[voicesc]agate=threshold=${config.threshold_db}dB:attack=${config.attack_ms}:release=${config.release_ms}[gate]`,
    `[${musicTrackIndex}:a][gate]sidechaincompress=threshold=${config.threshold_db}dB:ratio=4:attack=${config.attack_ms}:release=${config.release_ms}:level_sc=1[ducked]`,
    `[voice][ducked]amix=inputs=2:duration=longest[out]`,
  ].join(';');
}

export function buildAudioFadeFilter(
  streamIndex: number,
  durationSec: number,
  config: AudioFadeConfig,
): string {
  const filters: string[] = [];

  if (config.fade_in_ms > 0) {
    filters.push(`afade=t=in:st=0:d=${config.fade_in_ms / 1000}`);
  }

  if (config.fade_out_ms > 0) {
    const fadeOutStart = Math.max(0, durationSec - config.fade_out_ms / 1000);
    filters.push(`afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${config.fade_out_ms / 1000}`);
  }

  if (filters.length === 0) return '';
  return `[${streamIndex}:a]${filters.join(',')}[afaded${streamIndex}]`;
}

export function buildVolumeFilter(streamIndex: number, volume: number): string {
  if (volume === 1.0) return '';
  const db = 20 * Math.log10(Math.max(0.001, volume));
  return `[${streamIndex}:a]volume=${db.toFixed(2)}dB[vol${streamIndex}]`;
}

export function buildSilenceDetectArgs(thresholdDb: number = -30, minDurationSec: number = 0.5): string[] {
  return [
    '-af',
    `silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`,
    '-f',
    'null',
    '-',
  ];
}

export interface SilenceRange {
  start_sec: number;
  end_sec: number;
  duration_sec: number;
}

export function parseSilenceRanges(ffmpegStderr: string): SilenceRange[] {
  const ranges: SilenceRange[] = [];
  const lines = ffmpegStderr.split('\n');
  let pendingStart: number | null = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      pendingStart = parseFloat(startMatch[1]);
      continue;
    }

    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (endMatch && pendingStart !== null) {
      ranges.push({
        start_sec: pendingStart,
        end_sec: parseFloat(endMatch[1]),
        duration_sec: parseFloat(endMatch[2]),
      });
      pendingStart = null;
    }
  }

  return ranges;
}

export function buildLoudnormFilter(
  targetLufs: number = -14,
  targetTp: number = -1.5,
  targetLra: number = 11,
): string {
  return `loudnorm=I=${targetLufs}:TP=${targetTp}:LRA=${targetLra}`;
}

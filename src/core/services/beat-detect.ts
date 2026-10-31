import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const ANALYSIS_RATE = 22050;
const HOP = 256;
const FRAME = 1024;
const MIN_BPM = 60;
const MAX_BPM = 200;

export interface BeatAnalysis {
  bpm: number;
  beats: number[];
  confidence: number;
  durationSec: number;
}

/** Onset strength per hop: how sharply the energy of the transient-emphasised signal rises. */
export function onsetEnvelope(samples: Float32Array): Float32Array {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const logEnergy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    let sum = 0;
    for (let i = start + 1; i < start + FRAME; i++) {
      const d = samples[i] - samples[i - 1];
      sum += d * d;
    }
    logEnergy[f] = Math.log(1e-10 + sum / FRAME);
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, logEnergy[f] - logEnergy[f - 1]);

  // Subtract a moving average so steady loud passages do not count as onsets.
  const half = Math.round((0.25 * ANALYSIS_RATE) / HOP);
  const out = new Float32Array(frames);
  let windowSum = 0;
  let lo = 0;
  let hi = -1;
  for (let f = 0; f < frames; f++) {
    while (hi < Math.min(frames - 1, f + half)) windowSum += onset[++hi];
    while (lo < f - half) windowSum -= onset[lo++];
    out[f] = Math.max(0, onset[f] - windowSum / (hi - lo + 1));
  }
  return out;
}

// Beat spacing is rarely a whole number of hops, so one-hop-wide peaks are widened before matching.
function smooth(env: Float32Array): Float32Array {
  const kernel = [1, 2, 3, 2, 1];
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) {
    let sum = 0;
    let weight = 0;
    for (let k = -2; k <= 2; k++) {
      const v = env[i + k];
      if (v === undefined) continue;
      sum += v * kernel[k + 2];
      weight += kernel[k + 2];
    }
    out[i] = sum / weight;
  }
  return out;
}

function autocorr(env: Float32Array, lag: number): number {
  let sum = 0;
  for (let i = lag; i < env.length; i++) sum += env[i] * env[i - lag];
  return sum / Math.max(1, env.length - lag);
}

export function detectBeats(samples: Float32Array, sampleRate = ANALYSIS_RATE): BeatAnalysis {
  const durationSec = samples.length / sampleRate;
  const none = { bpm: 0, beats: [], confidence: 0, durationSec };
  if (sampleRate !== ANALYSIS_RATE || durationSec < 4) return none;

  const env = onsetEnvelope(samples);
  const wide = smooth(env);
  const rate = ANALYSIS_RATE / HOP;
  const zero = autocorr(wide, 0);
  if (zero <= 1e-9) return none;

  // Tempo: the strongest repeat interval, gently favouring tempos near 120 to avoid half/double errors.
  let bestLag = 0;
  let bestScore = -Infinity;
  const minLag = Math.floor((60 * rate) / MAX_BPM);
  const maxLag = Math.ceil((60 * rate) / MIN_BPM);
  const scores = new Map<number, number>();
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * rate) / lag;
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.2) ** 2);
    const raw = autocorr(wide, lag);
    scores.set(lag, raw);
    if (raw * weight > bestScore) {
      bestScore = raw * weight;
      bestLag = lag;
    }
  }
  const a = scores.get(bestLag - 1) ?? 0;
  const b = scores.get(bestLag) ?? 0;
  const c = scores.get(bestLag + 1) ?? 0;
  const denom = a - 2 * b + c;
  const period = bestLag + (denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0);
  const confidence = Math.max(0, Math.min(1, b / zero));

  // Phase: the grid offset that lands on the most onset energy.
  let bestPhase = 0;
  let bestPhaseScore = -Infinity;
  for (let phase = 0; phase < period; phase++) {
    let sum = 0;
    for (let x = phase; x < wide.length; x += period) sum += wide[Math.round(x)] ?? 0;
    if (sum > bestPhaseScore) {
      bestPhaseScore = sum;
      bestPhase = phase;
    }
  }

  // Nudge each grid beat onto the strongest nearby onset to follow small tempo drift.
  const reach = Math.max(1, Math.round(period * 0.1));
  const beats: number[] = [];
  for (let x = bestPhase; x < env.length; x += period) {
    const centre = Math.round(x);
    let at = centre;
    for (let i = Math.max(0, centre - reach); i <= Math.min(env.length - 1, centre + reach); i++) {
      if (env[i] > env[at]) at = i;
    }
    const sec = Math.round(((at * HOP + FRAME / 2) / ANALYSIS_RATE) * 1000) / 1000;
    if (beats.length === 0 || sec > beats[beats.length - 1] + 0.05) beats.push(sec);
  }

  return { bpm: Math.round(((60 * rate) / period) * 10) / 10, beats, confidence: Math.round(confidence * 100) / 100, durationSec };
}

/** Decodes any audio or video file to mono float samples at the analysis rate using ffmpeg. */
export async function decodeMono(ffmpegPath: string, file: string, maxSec = 600): Promise<Float32Array> {
  const { stdout } = await execFileAsync(
    ffmpegPath,
    ['-v', 'error', '-i', file, '-t', String(maxSec), '-vn', '-ac', '1', '-ar', String(ANALYSIS_RATE), '-f', 'f32le', '-'],
    { encoding: 'buffer', maxBuffer: ANALYSIS_RATE * 4 * maxSec + 1024 },
  );
  const bytes = stdout as Buffer;
  const copy = new Uint8Array(bytes.byteLength - (bytes.byteLength % 4));
  copy.set(bytes.subarray(0, copy.byteLength));
  return new Float32Array(copy.buffer);
}

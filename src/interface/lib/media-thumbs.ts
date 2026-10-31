'use client';

import { useEffect, useState } from 'react';

/** Frames sampled evenly through a clip's footage, oldest first; empty when the footage can't be read. */
export type Filmstrip = { frames: string[]; durationSec: number; aspect: number };
/** Loudness peaks (0..1) at a fixed rate through the whole song. */
export type Waveform = { peaks: Float32Array; perSec: number; durationSec: number };

export const FILMSTRIP_FRAMES = 10;
const THUMB_HEIGHT = 72;
const PEAKS_PER_SEC = 40;

const strips = new Map<string, Promise<Filmstrip | null>>();
const waves = new Map<string, Promise<Waveform | null>>();

// One decode at a time keeps the editor responsive on phones.
let chain: Promise<unknown> = Promise.resolve();
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

function once(target: EventTarget, event: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeoutMs);
    target.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    target.addEventListener('error', () => { clearTimeout(timer); reject(new Error('media error')); }, { once: true });
  });
}

async function extractFilmstrip(url: string): Promise<Filmstrip | null> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadeddata');
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const canvas = document.createElement('canvas');
    canvas.height = THUMB_HEIGHT;
    canvas.width = Math.round(THUMB_HEIGHT * aspect);
    const ctx = canvas.getContext('2d');
    if (!ctx || durationSec <= 0) return null;
    const frames: string[] = [];
    for (let i = 0; i < FILMSTRIP_FRAMES; i++) {
      video.currentTime = Math.min(durationSec - 0.05, ((i + 0.5) / FILMSTRIP_FRAMES) * durationSec);
      await once(video, 'seeked');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Throws when the host sends no CORS headers; the timeline then shows plain tiles.
      frames.push(canvas.toDataURL('image/jpeg', 0.62));
    }
    return { frames, durationSec, aspect };
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

async function extractWaveform(url: string): Promise<Waveform | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const audio = await ctx.decodeAudioData(bytes);
      const data = audio.getChannelData(0);
      const bucket = Math.max(1, Math.floor(audio.sampleRate / PEAKS_PER_SEC));
      const peaks = new Float32Array(Math.ceil(data.length / bucket));
      let loudest = 0;
      for (let i = 0; i < peaks.length; i++) {
        let sum = 0;
        const end = Math.min(data.length, (i + 1) * bucket);
        for (let j = i * bucket; j < end; j += 4) sum += data[j] * data[j];
        peaks[i] = Math.sqrt(sum / Math.max(1, (end - i * bucket) / 4));
        if (peaks[i] > loudest) loudest = peaks[i];
      }
      if (loudest > 0) for (let i = 0; i < peaks.length; i++) peaks[i] = Math.min(1, peaks[i] / loudest);
      return { peaks, perSec: audio.sampleRate / bucket, durationSec: audio.duration };
    } finally {
      void ctx.close();
    }
  } catch {
    return null;
  }
}

function useCached<T>(cache: Map<string, Promise<T | null>>, load: (url: string) => Promise<T | null>, url: string | null | undefined) {
  const [state, setState] = useState<{ url: string; value: T | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    if (!cache.has(url)) cache.set(url, queued(() => load(url)));
    cache.get(url)!.then((value) => alive && setState({ url, value }));
    return () => { alive = false; };
  }, [cache, load, url]);
  return url && state?.url === url ? state.value : null;
}

export function useFilmstrip(url: string | null | undefined) {
  return useCached(strips, extractFilmstrip, url);
}

export function useWaveform(url: string | null | undefined) {
  return useCached(waves, extractWaveform, url);
}

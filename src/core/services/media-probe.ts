import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface MediaInfo {
  durationSec: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

/** Reads what `ffmpeg -i` prints, so probing works with the bundled ffmpeg alone (no ffprobe needed). */
export function parseFfmpegInfo(stderr: string): MediaInfo {
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const durationSec = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : NaN;
  const videoLine = stderr.split('\n').find((l) => /Stream #\d+:\d+.*: Video:/.test(l) && !/attached pic/.test(l));
  // Skip "0x31637661"-style codec tags; a real size is followed by a comma, space or bracket.
  const size = videoLine ? /[\s,](\d{2,5})x(\d{2,5})(?=[\s,\[]|$)/.exec(videoLine) : null;
  let width = size ? Number(size[1]) : 0;
  let height = size ? Number(size[2]) : 0;
  const rotation = /rotation of (-?\d+(?:\.\d+)?) degrees|rotate\s*:\s*(-?\d+)/.exec(stderr);
  const degrees = rotation ? Math.abs(Number(rotation[1] ?? rotation[2])) % 180 : 0;
  if (degrees === 90) [width, height] = [height, width];
  return {
    durationSec,
    width,
    height,
    hasVideo: Boolean(videoLine),
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(stderr),
  };
}

export async function probeMedia(ffmpegPath: string, file: string): Promise<MediaInfo> {
  try {
    const { stderr } = await execFileAsync(ffmpegPath, ['-hide_banner', '-i', file], { maxBuffer: 4 * 1024 * 1024 });
    return parseFfmpegInfo(stderr);
  } catch (error) {
    // With no output file ffmpeg exits non-zero after printing the stream info we need.
    const stderr = (error as { stderr?: string }).stderr;
    if (typeof stderr === 'string' && stderr.includes('Duration:')) return parseFfmpegInfo(stderr);
    throw error;
  }
}

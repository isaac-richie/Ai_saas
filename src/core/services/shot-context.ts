import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** What the creator asked the generator for, kept with each clip so the AI editor knows its content. */
export interface ShotInfo {
  subject?: string;
  prompt?: string;
  scene?: string;
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** A short plain description of a shot from its storyboard info, or '' when there is none. */
export function describeShot(info: ShotInfo | null | undefined): string {
  if (!info) return '';
  const subject = clean(info.subject, 120);
  const prompt = clean(info.prompt, 260);
  const text = subject && prompt && !prompt.toLowerCase().includes(subject.toLowerCase()) ? `${subject}: ${prompt}` : prompt || subject;
  return text.slice(0, 320);
}

export function shotInfoFromStoryboard(item: { subject?: string | null; prompt?: string | null; enhanced_prompt?: string | null }, scene?: string): ShotInfo {
  return {
    subject: clean(item.subject, 120) || undefined,
    // The prompt the generator actually received describes the picture best.
    prompt: clean(item.enhanced_prompt || item.prompt, 600) || undefined,
    scene: clean(scene, 80) || undefined,
  };
}

/**
 * Only footage in our own storage is opened by ffmpeg directly. ffmpeg follows redirects and
 * speaks many protocols, so anything else must never reach it.
 */
export function isOwnStorageUrl(url: unknown, supabaseUrl: string | undefined): url is string {
  if (typeof url !== 'string' || !supabaseUrl) return false;
  try {
    const u = new URL(url);
    const own = new URL(supabaseUrl);
    return u.protocol === 'https:' && u.host === own.host && u.pathname.startsWith('/storage/v1/object/public/') && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** One small JPEG from a moment of a video, as a data URL; null when it can't be read in time. */
export async function frameAt(ffmpeg: string, input: string, atSec: number, width = 384): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      ffmpeg,
      [
        '-v', 'error', '-protocol_whitelist', 'file,https,tls,tcp',
        '-ss', Math.max(0, atSec).toFixed(2), '-i', input,
        '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '6', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-',
      ],
      { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024, timeout: 15_000 },
    );
    return stdout.length ? `data:image/jpeg;base64,${stdout.toString('base64')}` : null;
  } catch {
    return null;
  }
}

/** Runs jobs with at most `limit` at once, keeping their order. */
export async function mapLimited<T, R>(items: T[], limit: number, job: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await job(items[i], i);
      }
    }),
  );
  return out;
}

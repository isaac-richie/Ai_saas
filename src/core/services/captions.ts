export interface CaptionSegment {
  start_sec: number;
  end_sec: number;
  text: string;
  words?: CaptionWord[];
}

export interface CaptionWord {
  word: string;
  start_sec: number;
  end_sec: number;
}

export const CAPTION_FONT = 'Noto Sans';

export type CaptionStyle = 'standard' | 'karaoke' | 'cinematic_lower_third' | 'bold_center';

export interface CaptionStyleConfig {
  label: string;
  /** Size as a fraction of the frame's shorter side, so captions read the same at any resolution. */
  size: number;
  primary_color: string;
  secondary_color: string;
  outline_color: string;
  outline: number;
  shadow: number;
  alignment: 2 | 5 | 8;
  /** Distance from the edge as a fraction of the frame height. */
  margin: number;
  bold: boolean;
  italic: boolean;
}

// ASS colours are &HAABBGGRR.
export const CAPTION_STYLES: Record<CaptionStyle, CaptionStyleConfig> = {
  standard: {
    label: 'Clean', size: 0.065, primary_color: '&H00FFFFFF', secondary_color: '&H00FFFFFF',
    outline_color: '&H00000000', outline: 0.0035, shadow: 0.0015, alignment: 2, margin: 0.07, bold: true, italic: false,
  },
  karaoke: {
    label: 'Word by word', size: 0.075, primary_color: '&H008AC0D9', secondary_color: '&H00FFFFFF',
    outline_color: '&H00000000', outline: 0.004, shadow: 0, alignment: 2, margin: 0.09, bold: true, italic: false,
  },
  cinematic_lower_third: {
    label: 'Cinematic', size: 0.055, primary_color: '&H00F2F2F2', secondary_color: '&H00F2F2F2',
    outline_color: '&H40000000', outline: 0.0015, shadow: 0.002, alignment: 2, margin: 0.06, bold: false, italic: true,
  },
  bold_center: {
    label: 'Big title', size: 0.11, primary_color: '&H00FFFFFF', secondary_color: '&H00FFFFFF',
    outline_color: '&H00000000', outline: 0.006, shadow: 0, alignment: 5, margin: 0, bold: true, italic: false,
  },
};

export function isCaptionStyle(value: unknown): value is CaptionStyle {
  return typeof value === 'string' && value in CAPTION_STYLES;
}

export function segmentsToSrt(segments: CaptionSegment[]): string {
  return segments
    .map((seg, i) => {
      const start = formatSrtTime(seg.start_sec);
      const end = formatSrtTime(seg.end_sec);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join('\n');
}

export function parseSrt(srt: string): CaptionSegment[] {
  const blocks = srt.trim().split(/\n\n+/);
  const segments: CaptionSegment[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
    );
    if (!timeMatch) continue;

    const start_sec =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const end_sec =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    const text = lines.slice(2).join('\n').trim();
    if (text) segments.push({ start_sec, end_sec, text });
  }

  return segments;
}

export function segmentsToAss(
  segments: (CaptionSegment & { style?: CaptionStyle })[],
  fallback: CaptionStyle = 'standard',
  videoWidth: number = 1920,
  videoHeight: number = 1080,
): string {
  const short = Math.min(videoWidth, videoHeight);
  const used = new Set<CaptionStyle>([fallback, ...segments.map((s) => (isCaptionStyle(s.style) ? s.style : fallback))]);
  const styleLines = [...used].map((id) => {
    const c = CAPTION_STYLES[id];
    const px = (f: number) => Math.round(f * short * 10) / 10;
    const margin = Math.round(c.margin * videoHeight);
    const side = Math.round(videoWidth * 0.06);
    return `Style: ${id},${CAPTION_FONT},${px(c.size)},${c.primary_color},${c.secondary_color},${c.outline_color},&H80000000,${c.bold ? -1 : 0},${c.italic ? -1 : 0},0,0,100,100,0,0,1,${px(c.outline)},${px(c.shadow)},${c.alignment},${side},${side},${margin},1`;
  });

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${videoWidth}`,
    `PlayResY: ${videoHeight}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styleLines,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = segments
    .filter((seg) => seg.end_sec > seg.start_sec && seg.text.trim())
    .map((seg) => {
      const style = isCaptionStyle(seg.style) ? seg.style : fallback;
      let text = escapeAssText(seg.text);
      if (style === 'karaoke' && seg.words?.length) {
        text = seg.words
          .map((w) => `{\\kf${Math.max(0, Math.round((w.end_sec - w.start_sec) * 100))}}${escapeAssText(w.word)}`)
          .join(' ');
      }
      return `Dialogue: 0,${formatAssTime(seg.start_sec)},${formatAssTime(seg.end_sec)},${style},,0,0,0,,${text}`;
    });

  return [...header, ...events].join('\n');
}

/**
 * Groups transcribed words into short caption lines: a new line starts at a sentence end,
 * a pause, or when the line would get too long to read comfortably.
 */
export function wordsToCaptionSegments(
  words: CaptionWord[],
  opts: { maxChars?: number; maxSec?: number; pauseSec?: number } = {},
): CaptionSegment[] {
  const maxChars = opts.maxChars ?? 32;
  const maxSec = opts.maxSec ?? 3.2;
  const pauseSec = opts.pauseSec ?? 0.6;
  const clean = words
    .map((w) => ({ word: w.word.trim(), start_sec: w.start_sec, end_sec: Math.max(w.start_sec, w.end_sec) }))
    .filter((w) => w.word && Number.isFinite(w.start_sec) && Number.isFinite(w.end_sec))
    .sort((a, b) => a.start_sec - b.start_sec);

  const segments: CaptionSegment[] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (!current.length) return;
    segments.push({
      start_sec: current[0].start_sec,
      end_sec: current[current.length - 1].end_sec,
      text: current.map((w) => w.word).join(' '),
      words: current,
    });
    current = [];
  };

  for (const w of clean) {
    if (current.length) {
      const last = current[current.length - 1];
      const length = current.map((c) => c.word).join(' ').length + 1 + w.word.length;
      if (w.start_sec - last.end_sec > pauseSec || length > maxChars || w.end_sec - current[0].start_sec > maxSec || /[.!?]$/.test(last.word)) {
        flush();
      }
    }
    current.push(w);
  }
  flush();

  // Hold each line until the next one starts (up to half a second) so captions do not flicker.
  for (let i = 0; i < segments.length; i++) {
    const next = segments[i + 1];
    const hold = Math.min(0.5, next ? next.start_sec - segments[i].end_sec : 0.5);
    segments[i].end_sec = Math.max(segments[i].end_sec + Math.max(0, hold), segments[i].start_sec + 0.4);
    if (next && segments[i].end_sec > next.start_sec) segments[i].end_sec = next.start_sec;
  }
  return segments;
}

// Round the whole timestamp once so a value like 1.9996s becomes 2.000s, never 1s + 1000ms.
function splitTime(sec: number, unitsPerSecond: number) {
  const total = Math.round((Number.isFinite(sec) && sec > 0 ? sec : 0) * unitsPerSecond);
  const frac = total % unitsPerSecond;
  const whole = (total - frac) / unitsPerSecond;
  return { h: Math.floor(whole / 3600), m: Math.floor((whole % 3600) / 60), s: whole % 60, frac };
}

export function formatSrtTime(sec: number): string {
  const { h, m, s, frac } = splitTime(sec, 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(frac)}`;
}

export function formatAssTime(sec: number): string {
  const { h, m, s, frac } = splitTime(sec, 100);
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(frac)}`;
}

// Braces start override blocks and backslashes start escapes, so user text must not contain them.
function escapeAssText(text: string): string {
  return text.replace(/[{}\\]/g, '').replace(/\r?\n/g, '\\N');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** Escapes a path for use inside an ffmpeg filter option. */
function filterPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/([:'\[\],;])/g, '\\$1');
}

export function buildCaptionBurnInArgs(inputPath: string, assPath: string, outputPath: string, fontsDir: string): string[] {
  return [
    '-y', '-i', inputPath,
    '-vf', `ass=filename=${filterPath(assPath)}:fontsdir=${filterPath(fontsDir)}`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy', '-movflags', '+faststart',
    outputPath,
  ];
}

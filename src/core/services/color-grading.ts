export interface ColorGrade {
  id: string;
  name: string;
  category: 'film_stock' | 'mood' | 'genre' | 'custom';
  description: string;
  ffmpeg_filter: string;
  lut_url?: string;
  thumbnail_css: string;
}

export const BUILT_IN_GRADES: ColorGrade[] = [
  {
    id: 'natural',
    name: 'Natural',
    category: 'film_stock',
    description: 'No color grading applied',
    ffmpeg_filter: '',
    thumbnail_css: 'bg-gradient-to-br from-gray-400 to-gray-600',
  },
  {
    id: 'warm-film',
    name: 'Warm Film',
    category: 'film_stock',
    description: 'Warm Kodak-style film stock with lifted shadows',
    ffmpeg_filter: "colorbalance=rs=0.06:gs=0.02:bs=-0.04,eq=contrast=1.05:saturation=1.08:brightness=0.02,curves=m='0/0.05 0.5/0.52 1/0.95'",
    thumbnail_css: 'bg-gradient-to-br from-amber-500 to-orange-700',
  },
  {
    id: 'cool-noir',
    name: 'Cool Noir',
    category: 'mood',
    description: 'Cold blue shadows, desaturated highlights',
    ffmpeg_filter: "colorbalance=rs=-0.03:bs=0.06,eq=contrast=1.12:saturation=0.82:brightness=-0.02,curves=m='0/0 0.25/0.2 0.75/0.78 1/0.92'",
    thumbnail_css: 'bg-gradient-to-br from-blue-800 to-slate-900',
  },
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    category: 'genre',
    description: 'Hollywood blockbuster complementary grade',
    ffmpeg_filter: 'colorbalance=rs=0.08:gs=-0.02:bs=-0.06:rh=0.04:gh=-0.01:bh=-0.03:rm=-0.02:gm=0.01:bm=0.04,eq=contrast=1.08:saturation=1.15',
    thumbnail_css: 'bg-gradient-to-br from-teal-500 to-orange-500',
  },
  {
    id: 'bleach-bypass',
    name: 'Bleach Bypass',
    category: 'film_stock',
    description: 'High contrast, low saturation silver-retained look',
    ffmpeg_filter: 'eq=contrast=1.25:saturation=0.55:brightness=-0.03,unsharp=5:5:0.8',
    thumbnail_css: 'bg-gradient-to-br from-gray-300 to-gray-800',
  },
  {
    id: 'vintage-fade',
    name: 'Vintage Fade',
    category: 'mood',
    description: 'Lifted blacks, faded colors, warm cast',
    ffmpeg_filter: "colorbalance=rs=0.04:gs=0.02:bs=-0.02,eq=contrast=0.92:saturation=0.75,curves=m='0/0.12 0.5/0.54 1/0.88'",
    thumbnail_css: 'bg-gradient-to-br from-yellow-200 to-amber-400',
  },
  {
    id: 'cinematic-vignette',
    name: 'Cinematic',
    category: 'genre',
    description: 'Subtle warmth with edge vignette',
    ffmpeg_filter: 'colorbalance=rs=0.03:bs=-0.02,eq=contrast=1.06:saturation=1.05,vignette=PI/4',
    thumbnail_css: 'bg-gradient-to-br from-gold-600 to-obsidian-900',
  },
  {
    id: 'horror-green',
    name: 'Horror',
    category: 'genre',
    description: 'Sickly green cast, crushed shadows',
    ffmpeg_filter: "colorbalance=gs=0.06:bs=-0.04:rs=-0.02,eq=contrast=1.15:saturation=0.7:brightness=-0.05,curves=m='0/0 0.3/0.15 0.7/0.72 1/0.85'",
    thumbnail_css: 'bg-gradient-to-br from-green-900 to-gray-900',
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    category: 'mood',
    description: 'Warm golden light with soft highlights',
    ffmpeg_filter: "colorbalance=rs=0.1:gs=0.05:bs=-0.08,eq=contrast=1.02:saturation=1.2:brightness=0.04,curves=m='0/0 0.5/0.55 1/1'",
    thumbnail_css: 'bg-gradient-to-br from-yellow-400 to-orange-600',
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    category: 'mood',
    description: 'Blue-silver night ambience',
    ffmpeg_filter: "colorbalance=rs=-0.05:bs=0.1:gs=0.01,eq=contrast=1.08:saturation=0.6:brightness=-0.08,curves=m='0/0.02 0.5/0.45 1/0.85'",
    thumbnail_css: 'bg-gradient-to-br from-blue-400 to-indigo-900',
  },
  {
    id: 'documentary',
    name: 'Documentary',
    category: 'genre',
    description: 'Clean, slightly desaturated, natural contrast',
    ffmpeg_filter: 'eq=contrast=1.04:saturation=0.9,unsharp=3:3:0.4',
    thumbnail_css: 'bg-gradient-to-br from-stone-400 to-stone-700',
  },
  {
    id: 'music-video',
    name: 'Music Video',
    category: 'genre',
    description: 'High saturation, punchy contrast, vivid colors',
    ffmpeg_filter: 'eq=contrast=1.2:saturation=1.4:brightness=0.02,colorbalance=rs=0.02:bs=0.02',
    thumbnail_css: 'bg-gradient-to-br from-fuchsia-500 to-cyan-500',
  },
];

export function getGradeById(id: string): ColorGrade | undefined {
  return BUILT_IN_GRADES.find((g) => g.id === id);
}

export function buildColorGradeFilter(
  grade: ColorGrade,
  options?: { lut_path?: string },
): string {
  if (grade.lut_url && options?.lut_path) {
    return `lut3d=${options.lut_path}`;
  }
  return grade.ffmpeg_filter;
}

export function buildShotMatchFilter(
  referenceStats: { avg_r: number; avg_g: number; avg_b: number },
  targetStats: { avg_r: number; avg_g: number; avg_b: number },
): string {
  const offset = (ref: number, target: number) => {
    const value = (ref - target) / 255;
    return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  };
  const dr = offset(referenceStats.avg_r, targetStats.avg_r);
  const dg = offset(referenceStats.avg_g, targetStats.avg_g);
  const db = offset(referenceStats.avg_b, targetStats.avg_b);

  return `colorbalance=rs=${dr.toFixed(3)}:gs=${dg.toFixed(3)}:bs=${db.toFixed(3)}`;
}

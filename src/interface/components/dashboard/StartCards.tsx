import fs from 'node:fs';
import path from 'node:path';
import Image from 'next/image';
import { CardClip } from './CardClip';
import Link from 'next/link';
import { ArrowRight, Clapperboard, Images, Sparkles } from 'lucide-react';

const STARTS = [
  {
    href: '/dashboard/fast-video',
    title: 'Quick video',
    body: 'Type an idea, get a cinematic clip in minutes.',
    cta: 'Start creating',
    image: '/presets/style_cyberpunk_neon.jpg',
    clip: '/home/quick.mp4',
    icon: Sparkles,
    featured: true,
  },
  {
    href: '/dashboard/fast-video?mode=film',
    title: 'Longer film',
    body: 'Plan a few shots that tell one story.',
    cta: 'Plan a film',
    image: '/studio-plate-2.webp',
    clip: '/home/film.mp4',
    icon: Clapperboard,
  },
  {
    href: '/dashboard/gallery',
    title: 'My videos',
    body: "Watch, download and share what you've made.",
    cta: 'Open my videos',
    image: '/presets/style_golden_hour_film.jpg',
    clip: '/home/videos.mp4',
    icon: Images,
  },
];

/** A card plays its clip only once the file has been generated (film/gen/40-home-cards.mjs). */
const hasClip = (clip: string) => fs.existsSync(path.join(process.cwd(), 'public', clip));

/** Home's first question: what do you want to make? Three big, plain starting points. */
export function StartCards() {
  return (
    <section aria-label="Start something" className="grid gap-3 md:grid-cols-[1.35fr_1fr_1fr] md:gap-4">
      {STARTS.map(({ href, title, body, cta, image, clip, icon: Icon, featured }) => (
        <Link
          key={title}
          href={href}
          className={`lux-sheen group relative isolate flex overflow-hidden rounded-3xl border transition-all duration-500 hover:-translate-y-0.5 ${
            featured
              ? 'min-h-[220px] border-gold-300/40 shadow-[0_24px_60px_-34px_rgba(217,192,138,0.75)] md:min-h-[300px]'
              : 'min-h-[132px] border-gold-400/[0.14] hover:border-gold-400/40 md:min-h-[300px]'
          }`}
        >
          {hasClip(clip) ? (
            <CardClip src={clip} poster={image} />
          ) : (
            <Image src={image} alt="" fill sizes="(max-width: 768px) 100vw, 40vw" className="-z-20 object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-105" />
          )}
          <span className="absolute inset-0 -z-10 bg-gradient-to-t from-[#070807] via-[#070807]/75 to-[#070807]/20" />
          <span className="mt-auto flex w-full flex-wrap items-end justify-between gap-4 p-5 md:p-6">
            <span className="min-w-0 flex-1 basis-[210px]">
              <span className={`mb-3 grid size-10 place-items-center rounded-xl ${featured ? 'bg-gold-300 text-[#1a160e]' : 'border border-gold-400/25 bg-black/40 text-gold-200 backdrop-blur'}`}>
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              <span className={`block font-light tracking-tight text-[#f6f1e5] ${featured ? 'text-[28px] md:text-[34px]' : 'text-[22px]'}`}>{title}</span>
              <span className="mt-1 block text-[14px] leading-snug text-[#c8cdd5]">{body}</span>
            </span>
            <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all duration-300 ${
              featured
                ? 'bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] text-[#1a160e] group-hover:shadow-[0_10px_26px_-10px_rgba(217,192,138,0.9)]'
                : 'hidden border border-gold-400/25 bg-black/30 text-gold-100 backdrop-blur md:flex'
            }`}>
              {cta} <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </span>
        </Link>
      ))}
    </section>
  );
}

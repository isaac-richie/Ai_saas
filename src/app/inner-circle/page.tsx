import type { Metadata } from 'next';
import Link from 'next/link';
import { Clapperboard, Film, MessageSquareQuote, Sparkles } from 'lucide-react';
import { AnimatedBrandMark } from '@/interface/components/branding/AnimatedBrandMark';
import { InnerCircleForm } from '@/interface/components/landing/InnerCircleForm';
import { InnerCircleShowcase } from '@/interface/components/landing/InnerCircleShowcase';
import { createAdminClient, hasSupabaseAdminEnv } from '@/infrastructure/supabase/admin';
import { getAppBaseUrl } from '@/core/utils/app-url';
import styles from './inner-circle.module.css';

export const dynamic = 'force-dynamic';

const TITLE = 'The Inner Circle: Beta Access';
const DESCRIPTION =
  'Limited spots available. Direct cinematic multi-shot films with true character continuity and 1:1 acoustic lip-sync.';

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: { absolute: `${TITLE} · Visiowave Studios` },
  description: DESCRIPTION,
  alternates: { canonical: '/inner-circle' },
  openGraph: {
    type: 'website',
    siteName: 'Visiowave Studios',
    title: TITLE,
    description: DESCRIPTION,
    url: '/inner-circle',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  robots: { index: false, follow: false },
};

/** The list size is shown only once it reads as momentum, never as a small number. */
const SHOW_COUNT_FROM = 100;

async function waitlistSize(): Promise<number | null> {
  if (!hasSupabaseAdminEnv()) return null;
  try {
    const { count } = await createAdminClient()
      .from('inner_circle_waitlist')
      .select('id', { count: 'exact', head: true });
    return count ?? null;
  } catch {
    return null;
  }
}

const PERKS = [
  {
    icon: Clapperboard,
    title: 'First into the studio',
    body: 'Selected members create in Visiowave before anyone else.',
  },
  {
    icon: MessageSquareQuote,
    title: 'Shape what we build',
    body: 'Your answer goes straight to the founding team.',
  },
  {
    icon: Film,
    title: 'Films, not clips',
    body: 'Multi-shot scenes, the same characters in every cut, lip-sync to your own audio.',
  },
];

export default async function InnerCirclePage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const params = await searchParams;
  const referredByCode = params.ref?.trim().toUpperCase().slice(0, 32) || null;
  const size = await waitlistSize();
  const showSize = size !== null && size >= SHOW_COUNT_FROM;

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.plate} />
        <div className={styles.shade} />
        <div className={styles.grain} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 sm:px-8">
        <header className={`${styles.rise} flex h-20 items-center justify-between gap-4 sm:h-24`} style={{ ['--i' as string]: 0 }}>
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Visiowave Studios home">
            <AnimatedBrandMark />
            <span className="text-[13px] font-semibold leading-tight tracking-[0.14em] text-[var(--ic-paper)]">
              VISIOWAVE
              <small className="block text-[8px] font-normal tracking-[0.46em] text-white/60">STUDIOS</small>
            </span>
          </Link>
          <span className="inline-flex items-center gap-2.5 rounded-full border border-[var(--ic-line)] bg-black/30 px-3.5 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--ic-gold-soft)] backdrop-blur">
            <span className={styles.live} aria-hidden="true" />
            Applications open
          </span>
        </header>

        <div className="grid flex-1 items-center gap-10 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-12">
          <section className="min-w-0 max-w-xl">
            <p className={`${styles.rise} text-[11px] uppercase tracking-[0.28em] text-[var(--ic-gold)]`} style={{ ['--i' as string]: 1 }}>
              Private access
            </p>
            <h1
              className={`${styles.rise} mt-4 text-[44px] font-medium leading-[0.98] tracking-[-0.02em] sm:text-6xl lg:text-7xl`}
              style={{ ['--i' as string]: 2 }}
            >
              The Inner Circle:
              <span className={`${styles.serif} mt-1 block text-[var(--ic-gold-soft)]`}>Beta access.</span>
            </h1>
            <p className={`${styles.rise} mt-6 max-w-md text-[16px] leading-relaxed text-[var(--ic-muted)] sm:text-[17px]`} style={{ ['--i' as string]: 3 }}>
              {DESCRIPTION}
            </p>

            {referredByCode || showSize ? (
              <div className={`${styles.rise} mt-6 flex flex-wrap gap-2`} style={{ ['--i' as string]: 4 }}>
                {referredByCode ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ic-line)] bg-[rgba(217,192,138,0.08)] px-3.5 py-2 text-[13px] text-[var(--ic-gold-soft)]">
                    <Sparkles className="size-3.5" aria-hidden="true" /> You were invited by a member
                  </span>
                ) : null}
                {showSize ? (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] text-[var(--ic-muted)]">
                    {(Math.floor(size! / 10) * 10).toLocaleString('en')}+ creators on the list
                  </span>
                ) : null}
              </div>
            ) : null}

            <ul className="mt-10 hidden space-y-6 lg:block">
              {PERKS.map(({ icon: Icon, title, body }, index) => (
                <Perk key={title} icon={<Icon className="size-4" />} title={title} body={body} index={index} />
              ))}
            </ul>
          </section>

          {/* min-w-0: a long invite link must truncate instead of widening the column past the screen. */}
          <div className={`${styles.rise} min-w-0`} style={{ ['--i' as string]: 4 }}>
            <InnerCircleForm referredByCode={referredByCode} />
          </div>
        </div>

        <ul className="space-y-6 pb-4 pt-4 lg:hidden">
          {PERKS.map(({ icon: Icon, title, body }, index) => (
            <Perk key={title} icon={<Icon className="size-4" />} title={title} body={body} index={index} />
          ))}
        </ul>

        <InnerCircleShowcase />

        <footer className="mt-auto flex flex-col gap-3 border-t border-white/[0.07] py-8 text-[13px] text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Visiowave Studios</span>
          <nav aria-label="Legal" className="flex gap-5">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/" className="hover:text-white">visiowaveai.com</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}

function Perk({ icon, title, body, index }: { icon: React.ReactNode; title: string; body: string; index: number }) {
  return (
    <li className={`${styles.rise} flex gap-4`} style={{ ['--i' as string]: 5 + index }}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--ic-line)] bg-[rgba(217,192,138,0.06)] text-[var(--ic-gold)]">
        {icon}
      </span>
      <span>
        <span className="block text-[15px] font-medium text-[var(--ic-paper)]">{title}</span>
        <span className="mt-1 block text-[14px] leading-relaxed text-[var(--ic-muted)]">{body}</span>
      </span>
    </li>
  );
}

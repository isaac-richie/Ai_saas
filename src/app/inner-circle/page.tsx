import Link from 'next/link';
import { InnerCircleForm } from '@/interface/components/landing/InnerCircleForm';

export const dynamic = 'force-dynamic';

export default async function InnerCirclePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  const referredByCode = params.ref ? params.ref.trim().toUpperCase() : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040507] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:54px_100%]" />
      <div className="pointer-events-none absolute -left-[10%] top-[-8%] h-[420px] w-[420px] rounded-full bg-cyan-400/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-[-12%] top-[30%] h-[420px] w-[420px] rounded-full bg-orange-400/15 blur-[150px]" />

      <section className="relative z-10 mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.14em] text-white/75 transition hover:border-cyan-300/60"
        >
          ← Back to Visiowave
        </Link>

        <div className="mt-7 rounded-3xl border border-white/12 bg-black/45 p-6 shadow-[0_35px_80px_-42px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">Private Access</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            THE INNER CIRCLE: <span className="text-cyan-300">BETA ACCESS</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
            We&apos;re building in silence. Be the first to see the tech, the design, and the future of Visiowave Studios.
          </p>

          <InnerCircleForm referredByCode={referredByCode} />

          <p className="mt-4 text-xs text-white/45">
            By joining, you agree to receive early access updates and beta invitations.
          </p>
        </div>
      </section>
    </main>
  );
}

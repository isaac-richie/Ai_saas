import Link from 'next/link';

export const dynamic = 'force-dynamic';

function baseUrlFromEnv(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (siteUrl) return siteUrl.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export default async function InnerCircleThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; name?: string }>;
}) {
  const params = await searchParams;
  const referralCode = params.code?.trim().toUpperCase() || 'PENDINGCODE';
  const firstName = params.name?.trim().split(' ')[0] || 'Creator';
  const referralLink = `${baseUrlFromEnv()}/inner-circle?ref=${encodeURIComponent(referralCode)}`;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040507] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:54px_100%]" />
      <div className="pointer-events-none absolute -left-[10%] top-[-8%] h-[420px] w-[420px] rounded-full bg-cyan-400/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-[-12%] top-[30%] h-[420px] w-[420px] rounded-full bg-orange-400/15 blur-[150px]" />

      <section className="relative z-10 mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <div className="rounded-3xl border border-white/12 bg-black/45 p-6 shadow-[0_35px_80px_-42px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">You&apos;re In</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            Welcome, <span className="text-cyan-300">{firstName}</span>
          </h1>

          <p className="mt-5 text-sm leading-relaxed text-white/70 sm:text-base">
            You&apos;re now on the Visiowave Inner Circle waitlist. Share your referral link to compete for one of 10 beta slots.
          </p>

          <div className="mt-7 space-y-3 rounded-2xl border border-white/12 bg-white/[0.03] p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Your Referral Link</p>
            <p className="break-all text-sm text-cyan-200">{referralLink}</p>
          </div>

          <div className="mt-8 space-y-4 text-sm text-white/75">
            <h2 className="text-base font-semibold text-white">How to win 1 of 10 beta access slots</h2>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Follow Visiowave on IG, TikTok, and Facebook.</li>
              <li>Engage with the Visiowave feed and latest showcase post.</li>
              <li>Share your referral link with people you actually want to build with.</li>
              <li>Top referrals and strongest engagement get hand-picked for beta.</li>
            </ol>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={referralLink}
              className="beam-button inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] px-6 py-3 text-sm font-semibold text-black"
            >
              COPY & SHARE LINK
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white/85"
            >
              BACK TO HOME
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function InnerCircleThanksPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#040507] px-6 py-16 text-white">
      <div className="pointer-events-none absolute -left-20 top-0 h-96 w-96 rounded-full bg-cyan-400/15 blur-[140px]" />
      <section className="relative w-full max-w-xl rounded-3xl border border-white/12 bg-black/45 p-8 text-center sm:p-12">
        <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Visiowave / Inner Circle</p>
        <h1 className="mt-5 text-3xl font-semibold sm:text-4xl">Thank you for joining.</h1>
        <p className="mt-5 text-sm leading-relaxed text-white/70">Your beta application has been received. We will contact you by email if you are selected to test Visiowave.</p>
        <p className="mt-8 text-xs text-white/45">You can close this page now.</p>
      </section>
    </main>
  );
}

import Link from 'next/link';

export const LEGAL_CONTACT_EMAIL = 'tom925330@gmail.com';
export const LEGAL_LAST_UPDATED = '13 October 2026';

export type LegalSection = {
  heading: string;
  body: React.ReactNode;
};

export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <main className="min-h-screen bg-[#050505] px-4 py-14 text-white sm:px-8 sm:py-20">
      <article className="mx-auto w-full max-w-3xl">
        <Link href="/" className="text-xs uppercase tracking-[0.2em] text-white/50 hover:text-white">
          ← Visiowave Studios
        </Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/40">Last updated {LEGAL_LAST_UPDATED}</p>
        <p className="mt-8 text-base leading-relaxed text-white/75">{intro}</p>
        <div className="mt-10 space-y-10">
          {sections.map((section, index) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold">
                {index + 1}. {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/70 [&_a]:text-white [&_a]:underline [&_li]:ml-5 [&_li]:list-disc">
                {section.body}
              </div>
            </section>
          ))}
        </div>
        <footer className="mt-16 flex flex-wrap gap-4 border-t border-white/10 pt-6 text-xs text-white/45">
          <span>© {new Date().getFullYear()} Visiowave Studios</span>
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white">Terms of Service</Link>
        </footer>
      </article>
    </main>
  );
}

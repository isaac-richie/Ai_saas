import Link from "next/link"
import {
  ArrowRight,
  Camera,
  Check,
  Film,
  Github,
  KeyRound,
  Layers,
  Linkedin,
  PlayCircle,
  Send,
  Sparkles,
  Users,
  WandSparkles,
  Workflow,
  Youtube,
} from "lucide-react"

const logos = ["A24 LAB", "FRAMEFORGE", "NORTHLIGHT", "SIGNAL HOUSE", "FIFTH UNIT"]
const footerNav = {
  Product: [
    { label: "Studio", href: "/dashboard/studio" },
    { label: "Gallery", href: "/dashboard/gallery" },
    { label: "Workflow", href: "#workflow" },
    { label: "Pricing", href: "#pricing" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Showcase", href: "#showcase" },
    { label: "Docs", href: "#docs" },
    { label: "Contact", href: "#" },
  ],
  Resources: [
    { label: "Quickstart", href: "/signup" },
    { label: "API Status", href: "#" },
    { label: "Release Notes", href: "#" },
    { label: "Support", href: "#" },
  ],
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-white/45">{children}</p>
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] pb-24 text-white selection:bg-cyan-500/25">
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.1]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 100%",
        }}
      />

      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="film-grain" />
        <div className="vignette" />
      </div>

      <div className="pointer-events-none absolute -left-[12%] top-[-10%] z-0 h-[520px] w-[520px] rounded-full bg-cyan-400/12 blur-[160px]" />
      <div className="pointer-events-none absolute right-[-10%] top-[8%] z-0 h-[460px] w-[460px] rounded-full bg-orange-400/12 blur-[160px]" />
      <div className="neon-aurora pointer-events-none absolute -left-20 top-10 z-0 h-[44vh] w-[46vw]" />
      <div className="neon-aurora neon-aurora-slow pointer-events-none absolute bottom-[-10vh] right-[-8vw] z-0 h-[52vh] w-[52vw]" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6">
        <header className="sticky top-4 z-40 py-6">
          <nav className="relative flex items-center justify-between rounded-2xl border border-white/10 bg-[#070708]/85 px-3 py-2.5 backdrop-blur-xl">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="inline-flex h-6 w-8 items-center justify-center">
                <svg viewBox="0 0 48 26" className="h-3.5 w-6" aria-hidden="true">
                  <defs>
                    <linearGradient id="vwLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#18E0FF" />
                      <stop offset="55%" stopColor="#3C8DFF" />
                      <stop offset="100%" stopColor="#B12EFF" />
                    </linearGradient>
                  </defs>
                  <path d="M2 13 C10 2, 18 2, 24 13 C30 24, 38 24, 46 13" fill="none" stroke="url(#vwLogoGrad)" strokeWidth="2" />
                  <path d="M2 13 C10 24, 18 24, 24 13 C30 2, 38 2, 46 13" fill="none" stroke="url(#vwLogoGrad)" strokeWidth="2" />
                  <path d="M9 13 L14 13 L16 8 L19 18 L22 4 L25 22 L28 8 L31 16 L34 10 L37 13 L41 13" fill="none" stroke="url(#vwLogoGrad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-sm font-medium text-white/90">VISIOWAVE Studio Control</span>
            </Link>

            <div className="hidden items-center gap-7 text-sm text-white/55 md:flex">
              <a href="#showcase" className="transition hover:text-white">Showcase</a>
              <a href="#workflow" className="transition hover:text-white">Workflow</a>
              <a href="#pricing" className="transition hover:text-white">Pricing</a>
              <a href="#docs" className="transition hover:text-white">Docs</a>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-4 lg:flex">
                <Link href="/login" className="text-sm text-white/75 transition hover:text-white">
                  Sign in
                </Link>
                <Link href="/signup" className="text-sm text-cyan-300 transition hover:text-cyan-200">
                  Sign up
                </Link>
              </div>
              <Link href="/dashboard" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 transition hover:bg-white/10 hover:text-white">
                Open Dashboard
              </Link>
            </div>
          </nav>
        </header>

        <main className="pb-24 pt-10 lg:pt-14">
          <section data-reveal="hero" className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="pt-6">
              <h1 className="text-5xl leading-[0.95] tracking-[-0.03em] md:text-7xl">
                <span className="block font-semibold text-white drop-shadow-[0_8px_28px_rgba(0,0,0,0.5)]">Studio control</span>
                <span className="mt-1 block font-serif text-[0.82em] italic font-normal tracking-normal text-white/90">for</span>
                <span className="neon-flow-text block text-[1.03em] font-medium tracking-[-0.02em]">AI shot design.</span>
              </h1>

              <p className="mt-6 max-w-lg text-lg font-light leading-relaxed text-white/65">
                Build cinematic shots with ARRI cameras + Zeiss lenses. Real film vocabulary, consistent frames, one seamless workflow.
              </p>
              <p className="mt-3 text-sm text-white/50">Trusted by 50+ creators (beta).</p>

              <div className="mt-10 flex flex-wrap gap-4">
                <Link href="/signup" className="beam-button inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]">
                  Launch Studio
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#showcase" className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm transition hover:bg-white/10">See Product Tour</a>
              </div>

              <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-3" data-reveal="card">
                  <p className="text-2xl font-semibold text-cyan-300">12x</p>
                  <p className="text-xs text-white/45">Faster scene iteration</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-3" data-reveal="card">
                  <p className="text-2xl font-semibold text-cyan-300">4K</p>
                  <p className="text-xs text-white/45">Prompt-ready outputs</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-3" data-reveal="card">
                  <p className="text-2xl font-semibold text-cyan-300">BYOK</p>
                  <p className="text-xs text-white/45">Provider routing control</p>
                </div>
              </div>

              <div className="mt-8 grid gap-3 md:grid-cols-3">
                <article className="rounded-2xl border border-white/12 bg-[#0b0b0d] p-4">
                  <Camera className="mb-2 h-4 w-4 text-cyan-300" />
                  <p className="text-sm font-semibold">1. Pick Specs</p>
                  <p className="mt-1 text-xs text-white/50">Select camera body, lens, angle, and shot composition.</p>
                </article>
                <article className="rounded-2xl border border-white/12 bg-[#0b0b0d] p-4">
                  <KeyRound className="mb-2 h-4 w-4 text-cyan-300" />
                  <p className="text-sm font-semibold">2. Connect Keys</p>
                  <p className="mt-1 text-xs text-white/50">Bring your own provider keys for full generation control.</p>
                </article>
                <article className="rounded-2xl border border-white/12 bg-[#0b0b0d] p-4">
                  <WandSparkles className="mb-2 h-4 w-4 text-cyan-300" />
                  <p className="text-sm font-semibold">3. Generate & Export</p>
                  <p className="mt-1 text-xs text-white/50">Render frames and export directly to your sequence.</p>
                </article>
              </div>
            </div>

            <div className="space-y-3" data-reveal="card">
              <article className="overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015]">
                <div className="grid grid-cols-[0.9fr_1fr_1.5fr] text-xs">
                  <div className="border-b border-r border-white/10 px-3 py-2 text-white/40" />
                  <div className="border-b border-r border-white/10 px-3 py-2 text-white/55">Old way</div>
                  <div className="border-b border-white/10 px-3 py-2 font-medium text-cyan-300">Visiowave Studio Control</div>

                  <div className="border-b border-r border-white/10 px-3 py-2 font-medium text-white/75">Credits</div>
                  <div className="border-b border-r border-white/10 px-3 py-2 text-white/55">Expire</div>
                  <div className="border-b border-white/10 px-3 py-2 text-white/90">One-Time Keys</div>

                  <div className="border-b border-r border-white/10 px-3 py-2 font-medium text-white/75">Models</div>
                  <div className="border-b border-r border-white/10 px-3 py-2 text-white/55">Limited</div>
                  <div className="border-b border-white/10 px-3 py-2 text-white/90">Multiple (NanoBanana, Kling, Veo 3)</div>

                  <div className="border-b border-r border-white/10 px-3 py-2 font-medium text-white/75">Prompts</div>
                  <div className="border-b border-r border-white/10 px-3 py-2 text-white/55">Generic</div>
                  <div className="border-b border-white/10 px-3 py-2 text-white/90">Cinematic (ARRI/Zeiss terms)</div>

                  <div className="border-r border-white/10 px-3 py-2 font-medium text-white/75">Structure</div>
                  <div className="border-r border-white/10 px-3 py-2 text-white/55">Single box</div>
                  <div className="px-3 py-2 text-white/90">Projects-Scenes-Shots</div>
                </div>
              </article>

              <article className="rounded-3xl border border-violet-400/40 bg-gradient-to-b from-violet-500/12 to-violet-500/5 p-4 shadow-[0_0_0_1px_rgba(167,139,250,0.08)]">
                <p className="text-sm font-semibold text-white"><Users className="mr-2 inline h-4 w-4 text-violet-300" />Community Collabs — <span className="text-violet-300">Coming Soon</span></p>
                <ul className="mt-3 space-y-1.5 text-sm text-white/75">
                  <li>💜 Neon Dreams (12 votes)</li>
                  <li>🧠 Cyber Pulse (9 votes)</li>
                  <li>🛰️ Future Echo (7 votes)</li>
                </ul>
                <p className="mt-3 text-xs text-white/55">Your votes: 2/2 (Free) | Upgrade for 10 votes/day</p>
                <div className="mt-3 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-center text-xs text-white/45">Vote Now - Coming Soon</div>
              </article>

              <article className="overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015]">
                <div className="grid grid-cols-2 gap-0 border-b border-white/10">
                  <div className="p-4">
                    <p className="text-sm font-semibold text-white/85">Creator</p>
                    <p className="mt-1 text-3xl font-semibold">$0</p>
                    <p className="text-xs text-white/55">Start Free (5 projects)</p>
                    <ul className="mt-3 space-y-1.5 text-xs text-white/65">
                      <li>✓ Create up to 5 projects</li>
                      <li>✓ BYOK provider routing</li>
                      <li>✓ Core shot builder workflow</li>
                    </ul>
                  </div>
                  <div className="border-l border-white/10 p-4">
                    <p className="text-sm font-semibold text-white/85">Studio</p>
                    <p className="mt-1 text-3xl font-semibold">$39 <span className="text-sm font-medium text-white/65">one-time</span></p>
                    <p className="text-xs text-white/55">Pro (Unlimited + lifetime)</p>
                    <ul className="mt-3 space-y-1.5 text-xs text-white/65">
                      <li>✓ Unlimited projects</li>
                      <li>✓ Priority generation orchestration</li>
                      <li>✓ Shared presets and templates</li>
                    </ul>
                  </div>
                </div>
                <div className="border-t border-white/10 bg-[#09090b] p-3">
                  <Link href="/signup" className="beam-button inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90">
                    Start Free Trial
                  </Link>
                </div>
              </article>
            </div>
          </section>

          <section data-reveal="card" className="mt-14 rounded-full border border-white/5 bg-[#0A0A0A] py-4">
            <div className="flex flex-wrap items-center justify-center gap-10 text-[10px] tracking-[0.18em] text-white/35">
              {logos.map((logo) => (
                <span key={logo}>{logo}</span>
              ))}
            </div>
          </section>

          <section id="showcase" className="mt-24 scroll-mt-24">
            <SectionLabel>Showcase</SectionLabel>
            <h2 className="mb-8 text-3xl font-medium tracking-tight">
              Built for directors, DPs, and <span className="text-cyan-300">creative teams.</span>
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <article data-reveal="card" className="md:col-span-2 rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_42px_-34px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-white/45">
                  Composition Engine
                </div>
                <h3 className="mb-3 text-xl font-medium">Design shots with cinematic precision</h3>
                <p className="mb-8 max-w-md text-sm leading-relaxed text-white/50">
                  Combine shot type, movement, angle, lens, and mood in one builder that outputs consistent prompt structures.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/45">Shot archetypes</div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/45">Lens metadata</div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/45">Lighting presets</div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/45">Prompt snapshots</div>
                </div>
              </article>

              <div className="flex flex-col gap-4">
                <article data-reveal="card" className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_42px_-34px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                  <Layers className="mb-4 h-5 w-5 text-cyan-300" />
                  <h3 className="mb-2 text-lg font-medium">Scene layering</h3>
                  <p className="text-xs leading-relaxed text-white/50">Group shots into scenes and sequence your visual narrative without losing context.</p>
                </article>
                <article data-reveal="card" className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_42px_-34px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                  <Film className="mb-4 h-5 w-5 text-orange-300" />
                  <h3 className="mb-2 text-lg font-medium">Generation history</h3>
                  <p className="text-xs leading-relaxed text-white/50">Track outputs by shot and keep creative alternatives attached to production decisions.</p>
                </article>
              </div>
            </div>
          </section>

          <section id="workflow" className="mt-24 scroll-mt-24">
            <SectionLabel>Workflow</SectionLabel>
            <h2 className="mb-8 text-3xl font-medium tracking-tight">
              Three steps from idea to <span className="text-cyan-300">directed frame.</span>
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <article data-reveal="card" className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_42px_-34px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                <Workflow className="mb-4 h-5 w-5 text-cyan-300" />
                <h3 className="mb-2 text-sm font-semibold">Structure Project</h3>
                <p className="text-xs text-white/50">Create project, break into scenes, define narrative beats.</p>
              </article>
              <article data-reveal="card" className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_42px_-34px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                <WandSparkles className="mb-4 h-5 w-5 text-blue-300" />
                <h3 className="mb-2 text-sm font-semibold">Build Shot Specs</h3>
                <p className="text-xs text-white/50">Set camera language and generate robust prompts automatically.</p>
              </article>
              <article data-reveal="card" className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_42px_-34px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                <PlayCircle className="mb-4 h-5 w-5 text-orange-300" />
                <h3 className="mb-2 text-sm font-semibold">Generate + Iterate</h3>
                <p className="text-xs text-white/50">Render outputs, compare variants, and refine scene continuity.</p>
              </article>
            </div>
          </section>

          <section id="pricing" className="mt-24 scroll-mt-24">
            <article data-reveal="card" className="mb-8 overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-6 md:p-8">
              <p className="mb-4 text-xs uppercase tracking-[0.14em] text-white/45">Plan Comparison</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/60">
                      <th className="py-3 pr-3 font-medium">Feature</th>
                      <th className="py-3 px-3 font-medium">Start Free</th>
                      <th className="py-3 pl-3 font-medium">Pro</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/75">
                    <tr className="border-b border-white/5"><td className="py-3 pr-3">Projects</td><td className="py-3 px-3">5 projects</td><td className="py-3 pl-3">Unlimited</td></tr>
                    <tr className="border-b border-white/5"><td className="py-3 pr-3">Shot Builder</td><td className="py-3 px-3">Included</td><td className="py-3 pl-3">Included</td></tr>
                    <tr className="border-b border-white/5"><td className="py-3 pr-3">Provider Routing</td><td className="py-3 px-3">BYOK</td><td className="py-3 pl-3">BYOK + Priority</td></tr>
                    <tr><td className="py-3 pr-3">License</td><td className="py-3 px-3">Free</td><td className="py-3 pl-3">One-time lifetime</td></tr>
                  </tbody>
                </table>
              </div>
            </article>

            <SectionLabel>Pricing</SectionLabel>
            <h2 className="mb-10 text-3xl font-medium tracking-tight">
              Start free. <span className="text-cyan-300">Scale when production scales.</span>
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <article data-reveal="card" className="rounded-[2.25rem] border border-white/12 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_48px_-36px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                <h3 className="mb-2 text-lg font-medium">Start Free</h3>
                <p className="mb-4 text-5xl font-semibold">$0</p>
                <p className="mb-8 border-b border-white/5 pb-8 text-sm text-white/50">For independent creators exploring concepts and look development (5 projects).</p>
                <ul className="space-y-4 text-sm text-white/55">
                  <li className="flex items-center gap-3"><Check className="h-4 w-4 text-cyan-300" />Up to 5 projects</li>
                  <li className="flex items-center gap-3"><Check className="h-4 w-4 text-cyan-300" />Shot builder + scene boards</li>
                  <li className="flex items-center gap-3"><Check className="h-4 w-4 text-cyan-300" />Bring your own provider keys</li>
                </ul>
                <Link href="/signup" className="beam-button mt-7 inline-flex rounded-full border border-white/10 bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15">
                  Start Free Trial
                </Link>
              </article>

              <article data-reveal="card" className="relative overflow-hidden rounded-[2.25rem] border border-orange-400/35 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_40px_rgba(255,122,89,0.07)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-300/45">
                <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-orange-400/8 blur-[90px]" />
                <div className="relative z-10">
                  <div className="mb-4 inline-flex rounded-full bg-orange-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-orange-300">Most Popular</div>
                  <h3 className="mb-2 text-lg font-medium">Pro</h3>
                  <p className="mb-1 text-5xl font-semibold">$39 <span className="text-sm font-normal text-white/45">one-time</span></p>
                  <p className="mb-8 mt-3 border-b border-white/5 pb-8 text-sm text-white/50">For teams shipping sequences on active timelines (unlimited + lifetime).</p>
                  <ul className="space-y-4 text-sm text-white/55">
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-orange-300" />Everything in Start Free</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-orange-300" />Unlimited projects</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-orange-300" />Shared presets and templates</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 text-orange-300" />Priority generation orchestration</li>
                  </ul>
                  <a href="#pricing" className="beam-button mt-7 inline-flex rounded-full border border-orange-300/35 bg-orange-400/15 px-5 py-2.5 text-sm font-medium text-orange-200 hover:bg-orange-400/25">
                    Unlock Pro ($39 one-time)
                  </a>
                </div>
              </article>
            </div>
          </section>

          <section id="testimonials" className="mt-24 scroll-mt-24">
            <SectionLabel>Testimonials</SectionLabel>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <article data-reveal="card" className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-6">
                <p className="text-sm leading-relaxed text-white/75">&quot;Shot consistency jumped immediately. We blocked an entire sequence in one evening.&quot;</p>
                <p className="mt-4 text-xs text-white/45">Director · Beta Creator</p>
              </article>
              <article data-reveal="card" className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-6">
                <p className="text-sm leading-relaxed text-white/75">&quot;Having ARRI-style language and lens control made prompts actually usable on set.&quot;</p>
                <p className="mt-4 text-xs text-white/45">DP · Commercial Team</p>
              </article>
              <article data-reveal="card" className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.015] p-6">
                <p className="text-sm leading-relaxed text-white/75">&quot;The scene workflow feels like pre-production software, not random prompting.&quot;</p>
                <p className="mt-4 text-xs text-white/45">Creative Producer · Indie Studio</p>
              </article>
            </div>
          </section>

          <section id="docs" className="mt-24 scroll-mt-24">
            <article data-reveal="card" className="rounded-[2.25rem] border border-white/12 bg-gradient-to-b from-white/[0.08] via-white/[0.035] to-white/[0.015] p-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_48px_-36px_rgba(0,0,0,0.92)] transition-all duration-300 hover:border-white/20 md:p-12">
              <SectionLabel>Docs</SectionLabel>
              <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
                <div>
                  <h2 className="mb-4 text-3xl font-medium tracking-tight">
                    Deploy your first <span className="text-cyan-300">cinematic workflow</span> in minutes.
                  </h2>
                  <p className="max-w-xl text-sm text-white/55">
                    Connect provider keys, spin up a project, create scenes, and run your first shot generation through the dashboard flow.
                  </p>
                </div>

                <div className="flex shrink-0 gap-4">
                  <Link
                    href="/signup"
                    className="beam-button rounded-full bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] px-6 py-3 text-sm font-semibold text-black"
                  >
                    Read Quickstart
                  </Link>
                  <Link href="/login" className="rounded-full border border-white/10 px-6 py-3 text-sm transition hover:bg-white/5">
                    Open Studio Docs
                  </Link>
                </div>
              </div>
            </article>
          </section>

          <footer data-reveal="card" className="mt-24 overflow-hidden rounded-[2.25rem] border border-white/12 bg-gradient-to-b from-white/[0.06] via-white/[0.025] to-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_60px_-40px_rgba(0,0,0,0.95)]">
            <div className="grid gap-10 p-8 md:grid-cols-[1.1fr_0.9fr] md:p-10">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/50">
                  <Sparkles className="h-3 w-3 text-cyan-300" />
                  Visiowave Studios
                </div>
                <h3 className="mt-5 text-2xl font-semibold tracking-tight md:text-3xl">
                  Built for directors who care about every frame.
                </h3>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/55">
                  Visiowave unifies scene planning, shot design, and generation history so teams can move from idea to sequence with production-ready continuity.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <a href="#" className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/65 transition hover:bg-white/10 hover:text-white">
                    <Github className="h-4 w-4" />
                  </a>
                  <a href="#" className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/65 transition hover:bg-white/10 hover:text-white">
                    <Youtube className="h-4 w-4" />
                  </a>
                  <a href="#" className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/65 transition hover:bg-white/10 hover:text-white">
                    <Linkedin className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className="grid gap-8 sm:grid-cols-2">
                {Object.entries(footerNav).map(([group, links]) => (
                  <div key={group}>
                    <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-white/40">{group}</p>
                    <ul className="space-y-2.5">
                      {links.map((item) => (
                        <li key={item.label}>
                          <a href={item.href} className="text-sm text-white/65 transition hover:text-white">
                            {item.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-white/40">Join Updates</p>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b0b0d] p-1.5">
                    <input
                      type="email"
                      placeholder="you@studio.com"
                      className="h-9 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/35"
                    />
                    <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 text-xs font-medium text-white transition hover:bg-white/15">
                      Subscribe
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 px-8 py-4 text-xs text-white/45 md:flex-row md:items-center md:justify-between md:px-10">
              <p>© {new Date().getFullYear()} Visiowave Studios. Crafted for cinematic teams.</p>
              <div className="flex items-center gap-4">
                <a href="#" className="transition hover:text-white">Privacy</a>
                <a href="#" className="transition hover:text-white">Terms</a>
                <a href="#" className="transition hover:text-white">Security</a>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

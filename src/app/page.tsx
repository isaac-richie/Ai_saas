import Link from "next/link"
import { Check, Github, Linkedin, Sparkles, Youtube } from "lucide-react"
import { LandingNavbar } from "@/interface/components/landing/LandingNavbar"
import { LandingSpotlight } from "@/interface/components/landing/LandingSpotlight"
import { HeroEntrance } from "@/interface/components/landing/HeroEntrance"
import { FeatureGrid } from "@/interface/components/landing/FeatureGrid"
import { ModelShowcase } from "@/interface/components/landing/ModelShowcase"
import { ProductDemo } from "@/interface/components/landing/ProductDemo"
import { InnerCircleCTA } from "@/interface/components/landing/InnerCircleCTA"
import { createClient } from "@/infrastructure/supabase/server"

export const dynamic = "force-dynamic"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
      <span className="h-px w-6 bg-gradient-to-r from-cyan-400/50 to-transparent" />
      {children}
    </p>
  )
}

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthenticated = Boolean(user)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] pb-24 text-white selection:bg-cyan-500/25">
      {/* Grid lines */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "80px 100%",
        }}
      />

      {/* Film grain + vignette */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="film-grain" />
        <div className="vignette" />
      </div>

      {/* Ambient glow */}
      <LandingSpotlight />
      <HeroEntrance />
      <div className="pointer-events-none absolute -left-[12%] top-[-10%] z-0 h-[520px] w-[520px] rounded-full bg-cyan-400/10 blur-[160px]" />
      <div className="pointer-events-none absolute right-[-10%] top-[8%] z-0 h-[420px] w-[420px] rounded-full bg-orange-400/10 blur-[160px]" />
      <div className="neon-aurora pointer-events-none absolute -left-20 top-10 z-0 h-[44vh] w-[46vw]" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-6">
        <LandingNavbar isAuthenticated={isAuthenticated} />

        <main className="pb-24 pt-10 lg:pt-16">
          {/* ═══════════════════════════════════════════
              HERO
          ═══════════════════════════════════════════ */}
          <section className="mx-auto max-w-4xl pt-6 text-center sm:pt-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 text-[11px] text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Now with Sora 2, Kling 2.5 &amp; Seedance
            </div>

            <h1 className="text-[2.5rem] leading-[0.95] tracking-[-0.035em] sm:text-5xl md:text-[4.8rem]">
              <span data-hero-line="line1" className="block font-semibold text-white drop-shadow-[0_8px_28px_rgba(0,0,0,0.5)]">
                AI video generation
              </span>
              <span data-hero-line="line2" className="mt-1 block font-serif text-[0.75em] italic font-normal tracking-normal text-white/80">
                with
              </span>
              <span data-hero-line="line3" className="neon-flow-text block text-[0.95em] font-medium tracking-[-0.02em]">
                cinematic control.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base font-light leading-relaxed text-white/50 sm:text-lg">
              Choose your model — Kling 2.5, Seedance, Sora 2 — set your camera language, and generate production-ready video from text or image. One studio, every provider.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10">
              <Link
                href="/signup"
                data-hero-cta
                className="liquid-metal-primary inline-flex items-center rounded-full px-7 py-3.5 text-sm font-semibold text-black"
              >
                Open Studio — Free
              </Link>
              <a
                href="#demo"
                data-hero-cta
                className="liquid-metal inline-flex items-center rounded-full px-6 py-3.5 text-sm text-white/70"
              >
                Watch Demo
              </a>
            </div>

            {/* Stat pills */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <div data-hero-stat className="rounded-xl border border-white/[0.08] bg-[#0b0b0d] px-4 py-2.5">
                <p className="text-lg font-semibold text-cyan-300">3 Models</p>
                <p className="text-[11px] text-white/40">Kling + Seedance + Sora</p>
              </div>
              <div data-hero-stat className="rounded-xl border border-white/[0.08] bg-[#0b0b0d] px-4 py-2.5">
                <p className="text-lg font-semibold text-cyan-300">BYOK</p>
                <p className="text-[11px] text-white/40">Bring your own API keys</p>
              </div>
              <div data-hero-stat className="rounded-xl border border-white/[0.08] bg-[#0b0b0d] px-4 py-2.5">
                <p className="text-lg font-semibold text-orange-300">Text + Image</p>
                <p className="text-[11px] text-white/40">Two generation modes</p>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              PRODUCT DEMO
          ═══════════════════════════════════════════ */}
          <section id="demo" className="mt-24 scroll-mt-24 sm:mt-32">
            <SectionLabel>In Action</SectionLabel>
            <h2 className="mb-8 text-2xl font-medium tracking-tight sm:text-3xl">
              From prompt to <span className="neon-flow-text-soft">cinematic video.</span>
            </h2>
            <ProductDemo />
          </section>

          {/* ═══════════════════════════════════════════
              FEATURES
          ═══════════════════════════════════════════ */}
          <section id="features" className="mt-24 scroll-mt-24 sm:mt-32">
            <SectionLabel>Features</SectionLabel>
            <h2 className="mb-3 text-2xl font-medium tracking-tight sm:text-3xl">
              Everything you need to <span className="text-cyan-300">direct AI video.</span>
            </h2>
            <p className="mb-10 max-w-xl text-sm text-white/40">
              Professional camera vocabulary, multi-model routing, project organization, and an AI director — all in one workspace.
            </p>
            <FeatureGrid />
          </section>

          {/* ═══════════════════════════════════════════
              MODELS
          ═══════════════════════════════════════════ */}
          <section id="models" className="mt-24 scroll-mt-24 sm:mt-32">
            <SectionLabel>AI Models</SectionLabel>
            <h2 className="mb-3 text-2xl font-medium tracking-tight sm:text-3xl">
              Pick your engine.
            </h2>
            <p className="mb-10 max-w-xl text-sm text-white/40">
              Three world-class video models, one studio. Switch per shot based on what the scene demands.
            </p>
            <ModelShowcase />
          </section>

          {/* ═══════════════════════════════════════════
              HOW IT WORKS
          ═══════════════════════════════════════════ */}
          <section className="mt-24 sm:mt-32">
            <SectionLabel>How It Works</SectionLabel>
            <h2 className="mb-10 text-2xl font-medium tracking-tight sm:text-3xl">
              Three steps to <span className="text-cyan-300">directed video.</span>
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Describe your vision",
                  description: "Type a prompt or upload a reference image. Choose your AI model and generation mode.",
                },
                {
                  step: "02",
                  title: "Set cinematic specs",
                  description: "Pick camera body, lens, shot type, angle, lighting mood. Real film vocabulary, consistent framing.",
                },
                {
                  step: "03",
                  title: "Generate and iterate",
                  description: "Render video, compare variants, save to gallery. Stitch shots into sequences and export.",
                },
              ].map((item) => (
                <article
                  key={item.step}
                  className="group rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.15]"
                >
                  <span className="mb-4 inline-block text-3xl font-bold text-white/[0.08]">
                    {item.step}
                  </span>
                  <h3 className="mb-2 text-[15px] font-semibold text-white/85">
                    {item.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-white/40">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              PRICING
          ═══════════════════════════════════════════ */}
          <section id="pricing" className="mt-24 scroll-mt-24 sm:mt-32">
            <SectionLabel>Pricing</SectionLabel>
            <h2 className="mb-3 text-2xl font-medium tracking-tight sm:text-3xl">
              Start free. <span className="text-cyan-300">Scale when production scales.</span>
            </h2>
            <p className="mb-10 max-w-xl text-sm text-white/40">
              You only pay your AI provider for generations. Visiowave never charges per-render.
            </p>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* Free */}
              <article className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.15] md:p-10">
                <h3 className="mb-2 text-lg font-medium text-white/85">Creator</h3>
                <p className="mb-1 text-4xl font-semibold">$0</p>
                <p className="mb-8 mt-2 border-b border-white/[0.06] pb-8 text-sm text-white/40">
                  For independent creators exploring concepts and look development.
                </p>
                <ul className="space-y-3.5 text-sm text-white/50">
                  <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-cyan-300" />Up to 5 projects</li>
                  <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-cyan-300" />All 3 AI video models</li>
                  <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-cyan-300" />Shot builder + AI Director</li>
                  <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-cyan-300" />Bring your own API keys</li>
                  <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-cyan-300" />Gallery + export</li>
                </ul>
                <Link
                  href="/signup"
                  className="liquid-metal mt-8 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-medium text-white"
                >
                  Start Free
                </Link>
              </article>

              {/* Pro */}
              <article className="relative overflow-hidden rounded-2xl border border-orange-400/25 bg-gradient-to-b from-white/[0.05] to-transparent p-8 shadow-[0_0_50px_-20px_rgba(255,122,89,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-300/35 md:p-10">
                <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-orange-400/[0.06] blur-[90px]" />
                <div className="relative z-10">
                  <div className="mb-4 inline-flex rounded-full bg-orange-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-orange-300">
                    Lifetime Access
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-white/85">Studio Pro</h3>
                  <p className="mb-1 text-4xl font-semibold">
                    $39 <span className="text-sm font-normal text-white/35">one-time</span>
                  </p>
                  <p className="mb-8 mt-2 border-b border-white/[0.06] pb-8 text-sm text-white/40">
                    For teams shipping sequences on active timelines. Pay once, keep forever.
                  </p>
                  <ul className="space-y-3.5 text-sm text-white/50">
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-orange-300" />Everything in Creator</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-orange-300" />Unlimited projects</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-orange-300" />Priority generation routing</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-orange-300" />Shared presets + templates</li>
                    <li className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-orange-300" />Batch export pipeline</li>
                  </ul>
                  <Link
                    href="/signup"
                    className="liquid-metal-primary mt-8 inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-semibold text-black"
                  >
                    Get Studio Pro — $39
                  </Link>
                </div>
              </article>
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              INNER CIRCLE
          ═══════════════════════════════════════════ */}
          <section id="inner-circle" className="mt-24 scroll-mt-24 sm:mt-32">
            <InnerCircleCTA />
          </section>

          {/* ═══════════════════════════════════════════
              FOOTER
          ═══════════════════════════════════════════ */}
          <footer className="mt-24 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
            <div className="grid gap-10 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-10">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
                  <Sparkles className="h-3 w-3 text-cyan-300" />
                  Visiowave Studios
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight md:text-2xl">
                  The AI video studio built for filmmakers.
                </h3>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/40">
                  Cinematic shot design, multi-model video generation, and project-level organization in one workspace.
                </p>

                <div className="mt-5 flex items-center gap-2">
                  <a href="#" className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-white/50 transition hover:bg-white/[0.08] hover:text-white">
                    <Github className="h-4 w-4" />
                  </a>
                  <a href="#" className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-white/50 transition hover:bg-white/[0.08] hover:text-white">
                    <Youtube className="h-4 w-4" />
                  </a>
                  <a href="#" className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-white/50 transition hover:bg-white/[0.08] hover:text-white">
                    <Linkedin className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-white/35">Product</p>
                  <ul className="space-y-2.5">
                    <li><a href="#features" className="text-sm text-white/50 transition hover:text-white">Features</a></li>
                    <li><a href="#models" className="text-sm text-white/50 transition hover:text-white">Models</a></li>
                    <li><a href="#pricing" className="text-sm text-white/50 transition hover:text-white">Pricing</a></li>
                    <li><Link href="/dashboard/studio" className="text-sm text-white/50 transition hover:text-white">Studio</Link></li>
                  </ul>
                </div>
                <div>
                  <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-white/35">Get Started</p>
                  <ul className="space-y-2.5">
                    <li><Link href="/signup" className="text-sm text-white/50 transition hover:text-white">Create Account</Link></li>
                    <li><Link href="/login" className="text-sm text-white/50 transition hover:text-white">Sign In</Link></li>
                    <li><a href="#inner-circle" className="text-sm text-white/50 transition hover:text-white">Inner Circle</a></li>
                    <li><Link href="/dashboard/gallery" className="text-sm text-white/50 transition hover:text-white">Gallery</Link></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/[0.06] px-8 py-4 text-xs text-white/30 md:flex-row md:items-center md:justify-between md:px-10">
              <p>&copy; {new Date().getFullYear()} Visiowave Studios. Built for cinematic teams.</p>
              <div className="flex items-center gap-4">
                <a href="#" className="transition hover:text-white">Privacy</a>
                <a href="#" className="transition hover:text-white">Terms</a>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

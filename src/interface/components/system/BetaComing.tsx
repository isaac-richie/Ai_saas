import Link from "next/link"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { logout } from "@/core/actions/auth"
import { TopLayer } from "./TopLayer"

/** Shown across the studio to signed-in people who have not been let into the private beta yet. */
export function BetaComing({ email }: { email: string }) {
  return (
    // Covers the whole studio shell (sidebar, menu, tab bar, tour) so locked-out people have nothing to wander into.
    <TopLayer>
    <div role="dialog" aria-modal="true" aria-labelledby="beta-coming-title" className="fixed inset-0 z-[200] overflow-y-auto bg-[#0b0c0b] bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(217,192,138,0.12),transparent_70%)]">
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-gold-300/30 bg-gold-300/[0.06] text-gold-300">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-gold-300/80">Private beta</p>
      <h1 id="beta-coming-title" className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        Your next film <span className="lux-serif text-gold-200">starts here.</span>
      </h1>
      <p className="mt-4 text-base leading-relaxed text-white/75">
        Visiowave is in private beta as we refine multi-shot filmmaking, character continuity and lip-sync.
      </p>
      <p className="mt-3 text-base leading-relaxed text-white/75">
        We&apos;re inviting creators in small groups. Join the Inner Circle to register your interest&mdash;we&apos;ll email you if you&apos;re selected.
      </p>
      <p className="mt-5 text-sm text-[#b0b8c4]">
        Signed in as: <span className="text-white/85">{email}</span>
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Link
          href="/inner-circle"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f3e5c0] via-[#d9c08a] to-[#b08d52] px-6 text-sm font-semibold text-black transition hover:opacity-95"
        >
          JOIN THE INNER CIRCLE <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
        <form action={logout}>
          <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/15 px-6 text-sm text-white/75 transition hover:border-white/30 hover:text-white">
            Sign out
          </button>
        </form>
      </div>
    </div>
    </div>
    </TopLayer>
  )
}

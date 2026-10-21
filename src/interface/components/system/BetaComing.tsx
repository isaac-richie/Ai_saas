import Link from "next/link"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { logout } from "@/core/actions/auth"

/** Shown across the studio to signed-in people who have not been let into the private beta yet. */
export function BetaComing({ email }: { email: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-gold-300/30 bg-gold-300/[0.06] text-gold-300">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-gold-300/80">Private beta</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">The studio opens soon.</h1>
      <p className="mt-4 text-base leading-relaxed text-white/70">
        Visiowave is in a private beta while we polish multi-shot films, character continuity and lip-sync.
        We&apos;re letting creators in a few at a time.
      </p>
      <p className="mt-3 text-sm text-white/50">
        Signed in as <span className="text-white/75">{email}</span>. Join the Inner Circle with this email and we&apos;ll contact you if you&apos;re selected.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Link
          href="/inner-circle"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f3e5c0] via-[#d9c08a] to-[#b08d52] px-6 text-sm font-semibold text-black transition hover:opacity-95"
        >
          Join the Inner Circle <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
        <form action={logout}>
          <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/15 px-6 text-sm text-white/75 transition hover:border-white/30 hover:text-white">
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}

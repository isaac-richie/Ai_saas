import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { TopLayer } from "@/interface/components/system/TopLayer"

export const metadata = { title: "Page not found" }

/**
 * Private beta: a wrong address must not drop people into the studio shell's menu. It covers the
 * whole screen and offers one way forward, the Inner Circle.
 */
export default function NotFound() {
  return (
    <TopLayer>
      <main className="fixed inset-0 z-[200] overflow-y-auto bg-[#0b0c0b] bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(217,192,138,0.12),transparent_70%)] text-white">
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
          <p className="text-[11px] uppercase tracking-[0.26em] text-gold-300/80">404 · Page not found</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            This scene <span className="lux-serif text-gold-200">didn&apos;t make the cut.</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/75">
            The link may be mistyped or out of date. If you were invited to Visiowave, the Inner Circle is this way.
          </p>
          <Link
            href="/inner-circle"
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f3e5c0] via-[#d9c08a] to-[#b08d52] px-6 text-sm font-semibold text-black transition hover:opacity-95"
          >
            JOIN THE INNER CIRCLE <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </main>
    </TopLayer>
  )
}

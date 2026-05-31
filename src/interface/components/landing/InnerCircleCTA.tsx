"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Sparkles, ArrowRight, Loader2 } from "lucide-react"

const fadeUpInitial = { opacity: 0, y: 24 }
const fadeUpAnimate = { opacity: 1, y: 0 }
const fadeUpTransition = { duration: 0.5, ease: "easeOut" as const }

export function InnerCircleCTA() {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setStatus("loading")
    try {
      const res = await fetch("/api/inner-circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      })

      if (res.ok) {
        setStatus("success")
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  return (
    <motion.div
      initial={fadeUpInitial}
      whileInView={fadeUpAnimate}
      transition={fadeUpTransition}
      viewport={{ once: true, amount: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent"
    >
      {/* Background glow */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/[0.08] blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-orange-400/[0.06] blur-[80px]" />

      <div className="relative z-10 p-8 md:p-10">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-300">
          <Sparkles className="h-3 w-3" />
          Inner Circle
        </div>

        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <h3 className="mb-3 text-2xl font-semibold tracking-tight text-white/90 md:text-3xl">
              Get early access to new models and features.
            </h3>
            <p className="max-w-lg text-sm leading-relaxed text-white/45">
              Join the creator circle for priority access when we ship new AI models, studio tools, and collaboration features. No spam.
            </p>
          </div>

          {status === "success" ? (
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.08] p-6 text-center">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-cyan-300" />
              <p className="text-sm font-medium text-white/80">You&apos;re in. We&apos;ll be in touch.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-cyan-400/30"
              />
              <input
                type="email"
                placeholder="you@studio.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-cyan-400/30"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="beam-button inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
              >
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Join Inner Circle
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
              {status === "error" && (
                <p className="text-xs text-red-400">Something went wrong. Try again.</p>
              )}
            </form>
          )}
        </div>
      </div>
    </motion.div>
  )
}

"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { AnimatedBrandMark } from "@/interface/components/branding/AnimatedBrandMark"

const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#models", label: "Models" },
    { href: "#pricing", label: "Pricing" },
    { href: "#inner-circle", label: "Inner Circle" },
]

export function LandingNavbar({ isAuthenticated }: { isAuthenticated: boolean }) {
    const [compact, setCompact] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)

    useEffect(() => {
        const onScroll = () => setCompact(window.scrollY > 28)
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    return (
        <header className="sticky top-4 z-50 py-1">
            <motion.nav
                animate={{
                    scale: compact ? 0.985 : 1,
                    y: compact ? -2 : 0,
                    backdropFilter: compact ? "blur(22px)" : "blur(14px)",
                }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
                className="relative flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#070708]/85 px-3 py-2.5 shadow-[0_26px_40px_-32px_rgba(0,0,0,0.98),0_8px_20px_-16px_rgba(0,0,0,0.9)]"
            >
                <Link href="/" className="inline-flex items-center gap-2">
                    <AnimatedBrandMark className="h-8 w-8 shrink-0" />
                    <span className="hidden text-sm font-medium text-white/90 sm:inline">VISIOWAVE</span>
                    <span className="text-xs font-medium tracking-[0.08em] text-white/90 sm:hidden">VISIOWAVE</span>
                </Link>

                {/* Desktop nav */}
                <div className="hidden items-center gap-7 text-[13px] text-white/50 md:flex">
                    {navLinks.map((item) => (
                        <a
                            key={item.href}
                            href={item.href}
                            className="transition hover:text-white"
                        >
                            {item.label}
                        </a>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    {/* Mobile hamburger */}
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-white/60 transition hover:bg-white/[0.06] md:hidden"
                        aria-label="Toggle menu"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d={mobileOpen ? "M4 4L12 12M12 4L4 12" : "M2 4H14M2 8H14M2 12H14"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </button>

                    {isAuthenticated ? (
                        <Link
                            href="/dashboard/studio"
                            className="beam-button inline-flex items-center rounded-full bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
                        >
                            Launch Studio
                        </Link>
                    ) : (
                        <div className="flex items-center gap-3">
                            <Link href="/login" className="hidden text-sm text-white/60 transition hover:text-white sm:inline">
                                Sign in
                            </Link>
                            <Link
                                href="/signup"
                                className="beam-button inline-flex items-center rounded-full bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
                            >
                                Get Started
                            </Link>
                        </div>
                    )}
                </div>
            </motion.nav>

            {/* Mobile dropdown */}
            {mobileOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 rounded-xl border border-white/[0.08] bg-[#0a0a0c]/95 p-4 backdrop-blur-xl md:hidden"
                >
                    <div className="flex flex-col gap-3">
                        {navLinks.map((item) => (
                            <a
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className="text-sm text-white/60 transition hover:text-white"
                            >
                                {item.label}
                            </a>
                        ))}
                        {!isAuthenticated && (
                            <Link href="/login" className="text-sm text-white/60 transition hover:text-white">
                                Sign in
                            </Link>
                        )}
                    </div>
                </motion.div>
            )}
        </header>
    )
}

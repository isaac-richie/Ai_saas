"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"

const navLinks = [
    { href: "#showcase", label: "Showcase" },
    { href: "#workflow", label: "Workflow" },
    { href: "#pricing", label: "Pricing" },
    { href: "#docs", label: "Docs" },
]

export function LandingNavbar() {
    const [compact, setCompact] = useState(false)
    const [active, setActive] = useState("#showcase")

    useEffect(() => {
        const onScroll = () => {
            setCompact(window.scrollY > 28)
        }

        const onHash = () => {
            if (window.location.hash) setActive(window.location.hash)
        }

        onScroll()
        onHash()
        window.addEventListener("scroll", onScroll)
        window.addEventListener("hashchange", onHash)
        return () => {
            window.removeEventListener("scroll", onScroll)
            window.removeEventListener("hashchange", onHash)
        }
    }, [])

    const activeIndex = useMemo(() => {
        const idx = navLinks.findIndex((item) => item.href === active)
        return idx >= 0 ? idx : 0
    }, [active])

    return (
        <header className="sticky top-4 z-40 py-6">
            <motion.nav
                animate={{
                    scale: compact ? 0.985 : 1,
                    y: compact ? -2 : 0,
                    backdropFilter: compact ? "blur(22px)" : "blur(14px)",
                }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
                className="relative flex items-center justify-between rounded-[1.15rem] border border-white/10 bg-[#070708]/85 px-3 py-2.5 shadow-[0_14px_28px_-24px_rgba(0,0,0,0.95)]"
            >
                <Link href="/" className="inline-flex items-center gap-2.5">
                    <span className="inline-flex h-6 w-8 items-center justify-center">
                        <svg viewBox="0 0 48 26" className="h-3.5 w-6" aria-hidden="true">
                            <defs>
                                <linearGradient id="vwLogoGradNav" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#18E0FF" />
                                    <stop offset="55%" stopColor="#3C8DFF" />
                                    <stop offset="100%" stopColor="#B12EFF" />
                                </linearGradient>
                            </defs>
                            <path d="M2 13 C10 2, 18 2, 24 13 C30 24, 38 24, 46 13" fill="none" stroke="url(#vwLogoGradNav)" strokeWidth="2" />
                            <path d="M2 13 C10 24, 18 24, 24 13 C30 2, 38 2, 46 13" fill="none" stroke="url(#vwLogoGradNav)" strokeWidth="2" />
                            <path d="M9 13 L14 13 L16 8 L19 18 L22 4 L25 22 L28 8 L31 16 L34 10 L37 13 L41 13" fill="none" stroke="url(#vwLogoGradNav)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                    <span className="text-sm font-medium text-white/90">VISIOWAVE Studio Control</span>
                </Link>

                <div className="relative hidden items-center gap-7 text-sm text-white/55 md:flex">
                    <motion.span
                        className="absolute bottom-[-10px] h-[2px] w-[56px] rounded-full bg-gradient-to-r from-cyan-300 to-orange-300"
                        animate={{ x: activeIndex * 84 }}
                        transition={{ type: "spring", stiffness: 260, damping: 28 }}
                    />
                    {navLinks.map((item) => (
                        <a
                            key={item.href}
                            href={item.href}
                            onClick={() => setActive(item.href)}
                            className="transition hover:text-white"
                        >
                            {item.label}
                        </a>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden items-center gap-5 lg:flex">
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
            </motion.nav>
        </header>
    )
}

"use client"

import Link from "next/link"
import Image from "next/image"
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
            <header className="sticky top-4 z-50 py-1">
            <motion.nav
                animate={{
                    scale: compact ? 0.985 : 1,
                    y: compact ? -2 : 0,
                    backdropFilter: compact ? "blur(22px)" : "blur(14px)",
                }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
                className="relative flex items-center justify-between rounded-[1.15rem] border border-white/12 bg-[#070708]/82 px-3 py-2.5 shadow-[0_26px_40px_-32px_rgba(0,0,0,0.98),0_8px_20px_-16px_rgba(0,0,0,0.9)]"
            >
                <Link href="/" className="inline-flex items-center gap-2.5">
                    <Image
                        src="/brand-logo.jpeg"
                        alt="Visiowave logo"
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 scale-[1.28] object-contain"
                        priority
                    />
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

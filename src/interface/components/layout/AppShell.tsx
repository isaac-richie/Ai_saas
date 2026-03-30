"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"
import { cn } from "@/core/utils"
import { GuidedTour } from "@/interface/components/onboarding/GuidedTour"
import { AnimatePresence, motion } from "framer-motion"

const REDUCE_MOTION_STORAGE_KEY = "aisas.motion.reduce"

export function AppShell({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [motionReduced, setMotionReduced] = useState(false)
    const pathname = usePathname()
    const mainRef = useRef<HTMLElement>(null)

    useEffect(() => {
        if (typeof window !== "undefined" && window.innerWidth >= 768) {
            setIsSidebarOpen(true)
        }
    }, [])

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === "1"
            setMotionReduced(saved)
            document.documentElement.classList.toggle("motion-reduce-user", saved)
        } catch {
            // no-op
        }
    }, [])

    const toggleMotion = () => {
        setMotionReduced((prev) => {
            const next = !prev
            try {
                window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, next ? "1" : "0")
            } catch {
                // no-op
            }
            document.documentElement.classList.toggle("motion-reduce-user", next)
            return next
        })
    }

    useEffect(() => {
        let active = true
        let revert: (() => void) | undefined

        ; (async () => {
            try {
                if (!active || !mainRef.current) {
                    return
                }
                if (motionReduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                    return
                }

                const elements = Array.from(
                    mainRef.current.querySelectorAll("[data-reveal='hero'], [data-reveal='card']")
                ) as HTMLElement[]

                elements.forEach((el) => el.classList.add("reveal-ready"))

                const observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting) {
                                const target = entry.target as HTMLElement
                                target.classList.add("reveal-in")
                                observer.unobserve(target)
                            }
                        })
                    },
                    { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
                )

                elements.forEach((el) => observer.observe(el))

                const mod = await import("gsap")
                const gsap = mod.gsap
                const ctx = gsap.context(() => {
                    gsap.to(".ambient-orb-a", {
                        x: 18,
                        y: -14,
                        duration: 10,
                        repeat: -1,
                        yoyo: true,
                        ease: "sine.inOut",
                    })

                    gsap.to(".ambient-orb-b", {
                        x: -16,
                        y: 20,
                        duration: 12,
                        repeat: -1,
                        yoyo: true,
                        ease: "sine.inOut",
                    })
                }, mainRef)

                revert = () => {
                    observer.disconnect()
                    ctx.revert()
                }
            } catch {
                // Motion is progressive enhancement.
            }
        })()

        return () => {
            active = false
            if (revert) revert()
        }
    }, [motionReduced, pathname])

    const isAuthRoute =
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/verify") ||
        pathname.startsWith("/auth/")

    const isPublicRoute = pathname === "/"

    if (isAuthRoute || isPublicRoute) {
        return (
            <div className="relative min-h-screen bg-[#050505] text-white">
                <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                    {!isAuthRoute && (
                        <>
                            <div className="ambient-orb-a absolute -left-20 top-12 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
                            <div className="ambient-orb-b absolute right-0 top-1/3 h-80 w-80 rounded-full bg-accent/14 blur-3xl" />
                            <div className="data-grid-bg absolute inset-0 opacity-35" />
                        </>
                    )}
                </div>
                <main
                    ref={mainRef}
                    className="w-full min-h-screen mx-auto"
                >
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={pathname}
                            initial={motionReduced ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
                            animate={motionReduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={motionReduced ? { opacity: 1 } : { opacity: 0, y: -8, filter: "blur(5px)" }}
                            transition={{ duration: motionReduced ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        )
    }

    return (
        <div className="relative min-h-screen bg-[#050505] text-white">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-black focus:px-3 focus:py-2 focus:text-white">
                Skip to main content
            </a>
            <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                <div
                    className="absolute inset-0 opacity-[0.08]"
                    style={{
                        backgroundImage:
                            "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                    }}
                />
            </div>

            {isSidebarOpen && (
                <button
                    aria-label="Close sidebar"
                    className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

            <div
                className={cn(
                    "relative z-20 flex min-h-screen flex-1 flex-col transition-[margin] duration-300 ease-out",
                    isSidebarOpen ? "ml-0 md:ml-72" : "ml-0 md:ml-20"
                )}
            >
                <Header
                    toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    motionReduced={motionReduced}
                    onToggleMotion={toggleMotion}
                />
                <main id="main-content" ref={mainRef} className="flex-1 overflow-y-auto px-4 pb-10 pt-6 md:px-8 lg:px-10">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={pathname}
                            initial={motionReduced ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
                            animate={motionReduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={motionReduced ? { opacity: 1 } : { opacity: 0, y: -8, filter: "blur(5px)" }}
                            transition={{ duration: motionReduced ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
                <footer className="border-t border-white/10 px-4 py-3 text-xs text-white/45 md:px-8 lg:px-10">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>Visiowave Studio Control</span>
                        <div className="flex items-center gap-3">
                            <a href="#main-content" className="hover:text-white">Back to top</a>
                            <a href="/dashboard/settings" className="hover:text-white">Help Center</a>
                            <a href="/dashboard/exports" className="hover:text-white">Export Docs</a>
                        </div>
                    </div>
                </footer>
            </div>
            <GuidedTour />
        </div>
    )
}

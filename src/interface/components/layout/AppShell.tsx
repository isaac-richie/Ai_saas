"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"
import { cn } from "@/core/utils"
import { createClient as createBrowserSupabaseClient } from "@/infrastructure/supabase/client"

export function AppShell({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const pathname = usePathname()
    const router = useRouter()
    const mainRef = useRef<HTMLElement>(null)

    useEffect(() => {
        if (typeof window !== "undefined" && window.innerWidth >= 768) {
            setIsSidebarOpen(true)
        }
    }, [])

    useEffect(() => {
        let active = true
        let revert: (() => void) | undefined

        ; (async () => {
            try {
                if (!active || !mainRef.current) {
                    return
                }
                if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
    }, [pathname])

    const isAuthRoute =
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/auth/")

    const isPublicRoute = pathname === "/"

    useEffect(() => {
        if (isAuthRoute || isPublicRoute) return

        let active = true

        ;(async () => {
            try {
                const supabase = createBrowserSupabaseClient()
                const { data } = await supabase.auth.getSession()
                if (!active || data.session) return

                const { data: anonData } = await supabase.auth.signInAnonymously()
                if (!active) return
                if (anonData.session) {
                    router.refresh()
                }
            } catch {
                // Silent fallback: server actions also attempt anonymous auth.
            }
        })()

        return () => {
            active = false
        }
    }, [isAuthRoute, isPublicRoute, router])

    if (isAuthRoute || isPublicRoute) {
        return (
            <div className={cn("relative min-h-screen", isAuthRoute && "px-4 py-6 md:px-6 md:py-8")}>
                <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                    <div className="ambient-orb-a absolute -left-20 top-12 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
                    <div className="ambient-orb-b absolute right-0 top-1/3 h-80 w-80 rounded-full bg-accent/14 blur-3xl" />
                    <div className="data-grid-bg absolute inset-0 opacity-35" />
                </div>
                <main
                    ref={mainRef}
                    className={cn(
                        "w-full",
                        isAuthRoute ? "mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center" : "max-w-none"
                    )}
                >
                    {children}
                </main>
            </div>
        )
    }

    return (
        <div className="relative min-h-screen bg-[#050505] text-white">
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
                <Header toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
                <main ref={mainRef} className="flex-1 overflow-y-auto px-4 pb-10 pt-6 md:px-8 lg:px-10">
                    {children}
                </main>
            </div>
        </div>
    )
}

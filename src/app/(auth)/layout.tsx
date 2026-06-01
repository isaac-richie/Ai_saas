"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { AnimatedBrandMark } from "@/interface/components/branding/AnimatedBrandMark"
import { CinematicBackground } from "@/interface/components/ui/CinematicBackground"
import { RecentGenerations } from "@/interface/components/auth/RecentGenerations"
import { SystemStatus } from "@/interface/components/auth/SystemStatus"

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [timecode, setTimecode] = useState("00:00:00:00")
    
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date()
            const frames = Math.floor((now.getMilliseconds() / 1000) * 24).toString().padStart(2, '0')
            const seconds = now.getSeconds().toString().padStart(2, '0')
            const minutes = now.getMinutes().toString().padStart(2, '0')
            const hours = now.getHours().toString().padStart(2, '0')
            setTimecode(`${hours}:${minutes}:${seconds}:${frames}`)
        }, 41.6)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="relative min-h-dvh overflow-x-hidden text-white font-sans selection:bg-cyan-500/30 selection:text-cyan-200 bg-[#05070A]">
            <CinematicBackground />

            {/* Viewfinder Frame (Global) */}
            <div className="fixed inset-0 z-50 pointer-events-none opacity-20 border-[10px] border-black/10 sm:border-[24px]">
               <div className="absolute top-4 left-4 h-8 w-8 border-t border-l border-white/20 sm:top-6 sm:left-6 sm:h-12 sm:w-12" />
               <div className="absolute top-4 right-4 h-8 w-8 border-t border-r border-white/20 sm:top-6 sm:right-6 sm:h-12 sm:w-12" />
               <div className="absolute bottom-4 left-4 h-8 w-8 border-b border-l border-white/20 sm:bottom-6 sm:left-6 sm:h-12 sm:w-12" />
               <div className="absolute bottom-4 right-4 h-8 w-8 border-b border-r border-white/20 sm:bottom-6 sm:right-6 sm:h-12 sm:w-12" />
            </div>

            <main className="relative z-10 grid min-h-dvh w-full grid-cols-1 lg:grid-cols-2">
                
                {/* Left Side: Cinematic Branding & Previews */}
                <section className="relative hidden h-dvh lg:flex flex-col gap-4 p-8 xl:p-12 overflow-hidden">
                    <div className="relative z-10 flex-1 space-y-3 transition-all duration-700">
                        <BrandLockup className="w-fit" />

                        <div className="space-y-3">
                            <motion.h1 
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, delay: 0.2 }}
                                className="max-w-xl text-4xl xl:text-5xl font-black leading-[0.95] tracking-tight font-display text-white uppercase"
                            >
                                Cinematic <br />
                                <span className="bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent italic decoration-cyan-500/20 underline-offset-8">Precision.</span>
                            </motion.h1>
                            <motion.p 
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, delay: 0.4 }}
                                className="max-w-md text-sm leading-relaxed text-white/45 font-light tracking-wide font-sans mt-1"
                            >
                                Build scenes faster with pro shot controls,
                                clean prompts, and production-ready outputs.
                            </motion.p>
                        </div>
                        
                        <motion.div
                           initial={{ opacity: 0, y: 24 }}
                           animate={{ opacity: 1, y: 0 }}
                           transition={{ duration: 0.9, delay: 0.5 }}
                           className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/35 shadow-[0_24px_70px_-40px_rgba(0,0,0,0.95)]"
                        >
                            <img
                                src="/director.png"
                                alt="Studio director monitoring cinematic shots"
                                loading="eager"
                                decoding="async"
                                className="block h-[210px] w-full object-cover xl:h-[250px]"
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                        </motion.div>

                        {/* Live Preview Component */}
                        <motion.div
                           initial={{ opacity: 0, y: 30 }}
                           animate={{ opacity: 1, y: 0 }}
                           transition={{ duration: 1, delay: 0.6 }}
                        >
                           <RecentGenerations />
                        </motion.div>
                    </div>

                    <div className="relative z-10 mt-auto hidden items-center justify-between opacity-30 text-[9px] font-mono tracking-[0.4em] text-white/40 xl:flex">
                         <div className="flex gap-8">
                            <span className="tabular-nums">REC ● {timecode}</span>
                            <span>4K // 24FPS</span>
                            <span>ISO 800</span>
                         </div>
                         <div className="uppercase">
                            SNC-VISWAVE-8821 // SYSTEM STATUS: NOMINAL
                         </div>
                    </div>
                </section>

                {/* Right Side: Interaction Console */}
                <section className="relative flex min-h-dvh flex-col items-center justify-start overflow-y-auto bg-black/40 p-4 py-6 backdrop-blur-sm sm:p-8 sm:py-10 lg:justify-center lg:bg-transparent lg:p-10">
                    <div className="w-full max-w-sm xl:max-w-[440px] z-20 flex flex-col items-center">
                        <BrandLockup className="mb-6 self-start lg:hidden" />
                        
                        {children}

                        {/* System Status Details */}
                        <div className="w-full max-w-sm xl:max-w-[440px]">
                           <SystemStatus />
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}

function BrandLockup({ className = "" }: { className?: string }) {
    return (
        <Link href="/" className={`group inline-flex items-center gap-2 ${className}`}>
            <AnimatedBrandMark className="h-9 w-9 shrink-0" />
            <span className="hidden text-sm font-medium text-white/90 sm:inline">VISIOWAVE Studio Control</span>
            <span className="text-xs font-medium tracking-[0.08em] text-white/90 sm:hidden">VISIOWAVE</span>
        </Link>
    )
}

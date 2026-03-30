"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
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
        <div className="relative h-screen overflow-hidden text-white font-sans selection:bg-cyan-500/30 selection:text-cyan-200 bg-[#05070A]">
            <CinematicBackground />

            {/* Viewfinder Frame (Global) */}
            <div className="fixed inset-0 z-50 pointer-events-none opacity-20 border-[24px] border-black/10">
               <div className="absolute top-6 left-6 h-12 w-12 border-t border-l border-white/20" />
               <div className="absolute top-6 right-6 h-12 w-12 border-t border-r border-white/20" />
               <div className="absolute bottom-6 left-6 h-12 w-12 border-b border-l border-white/20" />
               <div className="absolute bottom-6 right-6 h-12 w-12 border-b border-r border-white/20" />
            </div>

            <main className="relative z-10 grid h-screen w-full grid-cols-1 lg:grid-cols-2">
                
                {/* Left Side: Cinematic Branding & Previews */}
                <section className="relative hidden h-screen lg:flex flex-col gap-4 p-8 xl:p-12 overflow-hidden">
                    <div className="relative z-10 flex-1 space-y-3 transition-all duration-700">
                        <Link href="/" className="group flex items-center gap-6">
                            <div className="relative">
                                <AnimatedBrandMark className="h-16 w-16 xl:h-20 xl:w-20 shrink-0 drop-shadow-[0_0_25px_rgba(34,211,238,0.4)]" />
                                <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-2xl font-black tracking-[0.4em] text-white uppercase leading-none">VISIOWAVE</span>
                                <span className="text-[10px] tracking-[0.6em] text-cyan-400 font-bold uppercase mt-2">Studio Intelligence System</span>
                            </div>
                        </Link>

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
                <section className="relative flex h-screen flex-col items-center justify-center p-4 sm:p-8 lg:p-10 bg-black/40 backdrop-blur-sm lg:bg-transparent">
                    <div className="w-full max-w-sm xl:max-w-[440px] z-20 flex flex-col items-center">
                        
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

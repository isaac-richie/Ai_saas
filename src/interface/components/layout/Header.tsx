"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/interface/components/ui/button"
import { Menu, Sparkles, HelpCircle, Gauge } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { CommandPalette } from "./CommandPalette"

interface HeaderProps {
    toggleSidebar: () => void
    motionReduced: boolean
    onToggleMotion: () => void
}

export function Header({ toggleSidebar, motionReduced, onToggleMotion }: HeaderProps) {
    const pathname = usePathname()

    const title = useMemo(() => {
        if (pathname.includes("/settings")) return "Studio Settings"
        if (pathname.includes("/fast-video")) return "Fast Track"
        if (pathname.includes("/scenes/")) return "Scene Builder"
        if (pathname.includes("/studio")) return "Studio"
        if (pathname.includes("/gallery")) return "Gallery"
        if (pathname.includes("/exports")) return "Exports"
        if (pathname.includes("/projects")) return "Project Workspace"
        return "Dashboard"
    }, [pathname])

    return (
        <header className="workspace-topbar sticky top-0 z-30 flex h-16 w-full items-center border-b px-3 sm:px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Button aria-label="Toggle sidebar" variant="ghost" size="icon" onClick={toggleSidebar} className="rounded-xl border border-transparent text-[#c9c5b8] hover:border-gold-400/20">
                    <Menu className="size-4" />
                </Button>
                <div className="relative min-w-0 overflow-hidden">
                    <p className="workspace-topbar-crumb hidden whitespace-nowrap xl:block">VISIOWAVE · STUDIO</p>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                            key={title}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="workspace-topbar-title truncate whitespace-nowrap text-[#f3eee2]"
                        >
                            {title}
                        </motion.p>
                    </AnimatePresence>
                </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                <CommandPalette />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="workspace-topbar-pill px-2 sm:px-3"
                    onClick={() => window.dispatchEvent(new CustomEvent("aisas:start-tour"))}
                    title="Start tour"
                    aria-label="Start product tour"
                >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Tour</span>
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="workspace-topbar-pill px-2 sm:px-3"
                    onClick={onToggleMotion}
                    title={motionReduced ? "Enable motion effects" : "Reduce motion effects"}
                    aria-label={motionReduced ? "Enable motion effects" : "Reduce motion effects"}
                    aria-pressed={motionReduced}
                >
                    <Gauge className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{motionReduced ? "Motion: Off" : "Motion: On"}</span>
                </Button>
                <span className="lux-hairline hidden h-8 items-center gap-1.5 rounded-full bg-gold-400/[0.06] px-3 text-[11px] text-gold-200 xl:inline-flex">
                    <Sparkles className="h-3 w-3 text-gold-400" />
                    Creative Mode
                </span>
            </div>
        </header>
    )
}

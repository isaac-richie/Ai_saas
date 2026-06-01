"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/interface/components/ui/button"
import { Badge } from "@/interface/components/ui/badge"
import { Menu, Sparkles, HelpCircle, Gauge } from "lucide-react"
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
        if (pathname.includes("/scenes/")) return "Scene Builder"
        if (pathname.includes("/studio")) return "Studio"
        if (pathname.includes("/gallery")) return "Gallery"
        if (pathname.includes("/exports")) return "Exports"
        if (pathname.includes("/projects")) return "Project Workspace"
        return "Dashboard"
    }, [pathname])

    return (
        <header className="sticky top-0 z-30 flex h-16 w-full items-center border-b border-white/10 bg-[#050505]/90 px-3 backdrop-blur-xl sm:px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Button variant="ghost" size="icon" onClick={toggleSidebar} className="rounded-xl text-white/90 hover:bg-white/10 hover:text-white">
                    <Menu className="size-4" />
                </Button>
                <div className="min-w-0">
                    <h1 className="truncate text-sm font-semibold text-white md:text-base">{title}</h1>
                </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                <CommandPalette />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-lg border border-white/10 bg-white/5 px-2 text-white/70 hover:bg-white/10 sm:px-3"
                    onClick={() => window.dispatchEvent(new CustomEvent("aisas:start-tour"))}
                    title="Start tour"
                >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Tour</span>
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-lg border border-white/10 bg-white/5 px-2 text-white/70 hover:bg-white/10 sm:px-3"
                    onClick={onToggleMotion}
                    title={motionReduced ? "Enable motion effects" : "Reduce motion effects"}
                >
                    <Gauge className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{motionReduced ? "Motion: Off" : "Motion: On"}</span>
                </Button>
                <Badge className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-normal text-white hover:bg-white/10 sm:inline-flex">
                    <Sparkles className="mr-1 h-3 w-3" />
                    Creative Mode
                </Badge>
            </div>
        </header>
    )
}

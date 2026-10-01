"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/core/utils"
import { Button } from "@/interface/components/ui/button"
import {
    Home,
    LayoutDashboard,
    Settings,
    LogOut,
    Clapperboard,
    Images,
    Video,
    Download,
    Lock,
} from "lucide-react"
import { motion } from "framer-motion"
import { AnimatedBrandMark } from "@/interface/components/branding/AnimatedBrandMark"
import { logout } from "@/core/actions/auth"
import { STUDIO_ENABLED } from "@/core/config/feature-flags"

interface SidebarProps {
    isOpen: boolean
    setIsOpen: (isOpen: boolean) => void
}

const navItems = [
    { name: "Home", href: "/", icon: Home, tour: "nav-home", isActive: (pathname: string) => pathname === "/" },
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard, tour: "nav-overview", isActive: (pathname: string) => pathname === "/dashboard" || pathname.startsWith("/dashboard/projects") && !pathname.includes("/scenes/") },
    { name: "Studio", href: "/dashboard/studio", icon: Clapperboard, tour: "nav-studio", disabled: !STUDIO_ENABLED, isActive: (pathname: string) => pathname.startsWith("/dashboard/studio") || pathname.includes("/scenes/") },
    { name: "Fast Track", href: "/dashboard/fast-video", icon: Video, tour: "nav-fast-video", isActive: (pathname: string) => pathname.startsWith("/dashboard/fast-video") },
    { name: "Gallery", href: "/dashboard/gallery", icon: Images, tour: "nav-gallery", isActive: (pathname: string) => pathname.startsWith("/dashboard/gallery") },
    { name: "Exports", href: "/dashboard/exports", icon: Download, tour: "nav-exports", isActive: (pathname: string) => pathname.startsWith("/dashboard/exports") },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, tour: "nav-settings", isActive: (pathname: string) => pathname.startsWith("/dashboard/settings") },
]

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
    const pathname = usePathname()

    return (
        <aside
            className={cn(
                "workspace-sidebar fixed left-0 top-0 z-40 h-screen border-r text-white backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                isOpen ? "translate-x-0 w-72" : "-translate-x-full w-72 md:translate-x-0 md:w-20"
            )}
        >
            <div className="flex h-16 items-center border-b border-white/10 px-4">
                <Link href="/dashboard" className="group flex items-center gap-3" onClick={() => setIsOpen(false)}>
                    <AnimatedBrandMark className="h-9 w-9 transition-transform duration-500 group-hover:scale-105" />
                    <span className={cn("leading-none transition-all", !isOpen && "md:hidden")}>
                        <span className="block text-[13px] font-semibold tracking-[0.2em] text-[#f3eee2]">VISIOWAVE</span>
                        <span className="lux-serif mt-1 block text-[12px] text-gold-400/85">Studios</span>
                    </span>
                </Link>
            </div>

            <div className="flex h-[calc(100%-4rem)] flex-col justify-between py-4">
                <nav className="space-y-1 px-2">
                    <span className={cn("workspace-nav-label", !isOpen && "md:invisible")}>STUDIO</span>
                    {navItems.map((item, index) => {
                        const isActive = item.isActive(pathname)
                        const isDisabled = Boolean(item.disabled)

                        const itemClassName = cn(
                            "group relative isolate flex items-center gap-3 px-3 py-2.5 text-sm font-medium",
                            isDisabled && "cursor-not-allowed !border-dashed !border-white/10 bg-white/[0.02] opacity-55",
                            !isOpen && "md:justify-center md:px-2"
                        )

                        if (isDisabled) {
                            return (
                                <div
                                    key={item.href}
                                    data-tour={item.tour}
                                    aria-disabled="true"
                                    className={itemClassName}
                                >
                                    <item.icon className="size-4 shrink-0" />
                                    <span className={cn("transition-all", !isOpen && "md:hidden")}>{item.name}</span>
                                    {isOpen ? (
                                        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold-400/20 bg-gold-400/5 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-gold-300/70">
                                            <Lock className="size-3" />
                                            Beta
                                        </span>
                                    ) : null}
                                </div>
                            )
                        }

                        return (
                            <motion.div
                                key={item.href}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.5, delay: 0.04 * index, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <Link
                                    href={item.href}
                                    aria-current={isActive ? "page" : undefined}
                                    title={item.name}
                                    data-tour={item.tour}
                                    onClick={() => setIsOpen(false)}
                                    className={itemClassName}
                                >
                                    {isActive ? (
                                        <motion.span
                                            layoutId="workspace-nav-pill"
                                            className="workspace-nav-pill"
                                            transition={{ type: "spring", stiffness: 420, damping: 36 }}
                                        />
                                    ) : null}
                                    <item.icon className="size-[17px] shrink-0" strokeWidth={1.6} />
                                    <span className={cn("transition-all", !isOpen && "md:hidden")}>{item.name}</span>
                                </Link>
                            </motion.div>
                        )
                    })}
                </nav>

                <div className="px-2">
                    {isOpen ? (
                        <Link
                            href="/dashboard/fast-video"
                            onClick={() => setIsOpen(false)}
                            className="workspace-sidebar-card lux-sheen group block"
                        >
                            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gold-300/80">
                                <span className="lux-live-dot" /> Ready to roll
                            </span>
                            <span className="mt-2 block text-[13px] text-[#eeeae1]">
                                Start a new <span className="lux-serif text-gold-300">production</span>
                            </span>
                            <span className="mt-1 block text-[11px] text-[#8f9086] transition-colors group-hover:text-gold-200/80">
                                Prompt to directed shots in minutes →
                            </span>
                        </Link>
                    ) : null}
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-3 rounded-xl text-[#a3a59a] hover:bg-white/[0.04] hover:text-white",
                            !isOpen && "md:justify-center md:px-2"
                        )}
                        onClick={async () => {
                            await logout()
                        }}
                    >
                        <LogOut className="size-4 shrink-0" />
                        <span className={cn("transition-all", !isOpen && "md:hidden")}>Log out</span>
                    </Button>
                </div>
            </div>
        </aside>
    )
}

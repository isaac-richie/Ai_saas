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
    MenuSquare,
    Clapperboard,
    Images,
    Video,
    Download,
    Users,
} from "lucide-react"
import { logout } from "@/core/actions/auth"

interface SidebarProps {
    isOpen: boolean
    setIsOpen: (isOpen: boolean) => void
}

const navItems = [
    { name: "Home", href: "/", icon: Home, tour: "nav-home", isActive: (pathname: string) => pathname === "/" },
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard, tour: "nav-overview", isActive: (pathname: string) => pathname === "/dashboard" || pathname.startsWith("/dashboard/projects") && !pathname.includes("/scenes/") },
    { name: "Studio", href: "/dashboard/studio", icon: Clapperboard, tour: "nav-studio", isActive: (pathname: string) => pathname.startsWith("/dashboard/studio") || pathname.includes("/scenes/") },
    { name: "Fast Track", href: "/dashboard/fast-video", icon: Video, tour: "nav-fast-video", isActive: (pathname: string) => pathname.startsWith("/dashboard/fast-video") },
    { name: "Gallery", href: "/dashboard/gallery", icon: Images, tour: "nav-gallery", isActive: (pathname: string) => pathname.startsWith("/dashboard/gallery") },
    { name: "Exports", href: "/dashboard/exports", icon: Download, tour: "nav-exports", isActive: (pathname: string) => pathname.startsWith("/dashboard/exports") },
    { name: "Inner Circle", href: "/dashboard/inner-circle", icon: Users, tour: "nav-inner-circle", isActive: (pathname: string) => pathname.startsWith("/dashboard/inner-circle") },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, tour: "nav-settings", isActive: (pathname: string) => pathname.startsWith("/dashboard/settings") },
]

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
    const pathname = usePathname()

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 z-40 h-screen border-r border-white/10 bg-[#09090b]/95 text-white backdrop-blur-xl transition-all duration-300 ease-out",
                isOpen ? "translate-x-0 w-72" : "-translate-x-full w-72 md:translate-x-0 md:w-20"
            )}
        >
            <div className="flex h-16 items-center border-b border-white/10 px-4">
                <Link href="/dashboard" className="flex items-center gap-2.5 font-bold" onClick={() => setIsOpen(false)}>
                    <div className="grid size-8 place-items-center rounded-xl bg-white/10 text-white">
                        <MenuSquare className="size-4" />
                    </div>
                </Link>
            </div>

            <div className="flex h-[calc(100%-4rem)] flex-col justify-between py-4">
                <nav className="space-y-1.5 px-2">
                    {navItems.map((item) => {
                        const isActive = item.isActive(pathname)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                data-tour={item.tour}
                                onClick={() => setIsOpen(false)}
                                className={cn(
                                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                                    isActive
                                        ? "bg-white/10 text-white"
                                        : "text-white/55 hover:bg-white/10 hover:text-white",
                                    !isOpen && "md:justify-center md:px-2"
                                )}
                            >
                                <item.icon className="size-4 shrink-0" />
                                <span className={cn("transition-all", !isOpen && "md:hidden")}>{item.name}</span>
                            </Link>
                        )
                    })}
                </nav>

                <div className="px-2">
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-3 rounded-xl text-white hover:bg-white/10 hover:text-white",
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

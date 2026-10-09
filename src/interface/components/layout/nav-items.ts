import { Clapperboard, Home, Images, Settings, Sparkles, type LucideIcon } from "lucide-react"
import { STUDIO_ENABLED } from "@/core/config/feature-flags"

export type NavItem = {
    name: string
    href: string
    icon: LucideIcon
    tour: string
    disabled?: boolean
    /** The one primary action; the phone tab bar raises it in the middle. */
    primary?: boolean
    isActive: (pathname: string) => boolean
}

/** One menu for every screen size: plain names that say what each page does. */
export const NAV_ITEMS: NavItem[] = [
    { name: "Home", href: "/dashboard", icon: Home, tour: "nav-home", isActive: (pathname) => pathname === "/dashboard" || (pathname.startsWith("/dashboard/projects") && !pathname.includes("/scenes/")) },
    { name: "Create", href: "/dashboard/fast-video", icon: Sparkles, tour: "nav-create", primary: true, isActive: (pathname) => pathname.startsWith("/dashboard/fast-video") },
    { name: "Studio", href: "/dashboard/studio", icon: Clapperboard, tour: "nav-studio", disabled: !STUDIO_ENABLED, isActive: (pathname) => pathname.startsWith("/dashboard/studio") || pathname.includes("/scenes/") || pathname.startsWith("/dashboard/sequences") },
    { name: "My videos", href: "/dashboard/gallery", icon: Images, tour: "nav-videos", isActive: (pathname) => pathname.startsWith("/dashboard/gallery") || pathname.startsWith("/dashboard/exports") },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, tour: "nav-settings", isActive: (pathname) => pathname.startsWith("/dashboard/settings") || pathname.startsWith("/settings") },
]

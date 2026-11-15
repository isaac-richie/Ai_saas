// Phosphor duotone: an outline plus a soft filled accent, like the editor's own glyphs. Active items turn solid.
import { FilmReel, FilmSlate, GearSix, House, MaskHappy, Scissors, Sparkle, type Icon } from "@phosphor-icons/react"
import { MIMIC_ENABLED, STUDIO_ENABLED } from "@/core/config/feature-flags"

export type NavItem = {
    name: string
    href: string
    icon: Icon
    tour: string
    /** A short tag after the name, such as "Beta". */
    badge?: string
    disabled?: boolean
    /** The one primary action; the phone tab bar raises it in the middle. */
    primary?: boolean
    /** Left out of the phone tab bar (it has four slots); still in the desktop sidebar. */
    desktopOnly?: boolean
    isActive: (pathname: string) => boolean
}

/** One menu for every screen size: plain names that say what each page does. */
export const NAV_ITEMS: NavItem[] = [
    { name: "Home", href: "/dashboard", icon: House, tour: "nav-home", isActive: (pathname) => pathname === "/dashboard" },
    { name: "Create", href: "/dashboard/fast-video", icon: Sparkle, tour: "nav-create", primary: true, isActive: (pathname) => pathname.startsWith("/dashboard/fast-video") },
    // The phone tab bar has four slots beside Create, so Mimic is reached there from the Edit page.
    { name: "Mimic", badge: "Beta", href: "/dashboard/mimic", icon: MaskHappy, tour: "nav-mimic", disabled: !MIMIC_ENABLED, desktopOnly: true, isActive: (pathname) => pathname.startsWith("/dashboard/mimic") },
    { name: "Edit", href: "/dashboard/edit", icon: Scissors, tour: "nav-edit", isActive: (pathname) => pathname.startsWith("/dashboard/edit") },
    { name: "Studio", href: "/dashboard/studio", icon: FilmSlate, tour: "nav-studio", disabled: !STUDIO_ENABLED, desktopOnly: true, isActive: (pathname) => pathname.startsWith("/dashboard/studio") || pathname.startsWith("/dashboard/projects") || pathname.startsWith("/dashboard/sequences") },
    { name: "My videos", href: "/dashboard/gallery", icon: FilmReel, tour: "nav-videos", isActive: (pathname) => pathname.startsWith("/dashboard/gallery") || pathname.startsWith("/dashboard/exports") },
    { name: "Settings", href: "/dashboard/settings", icon: GearSix, tour: "nav-settings", isActive: (pathname) => pathname.startsWith("/dashboard/settings") || pathname.startsWith("/settings") },
]

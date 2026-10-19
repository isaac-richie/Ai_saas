"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/core/utils"
import { NAV_ITEMS } from "./nav-items"

/**
 * Phone navigation: a bottom tab bar within thumb reach, with Create raised in
 * the middle as the one primary action (quiet while you are already on Create). Hidden from md up, where the sidebar takes over.
 */
export function MobileTabBar() {
    const pathname = usePathname()
    const primary = NAV_ITEMS.find((item) => item.primary)!
    const others = NAV_ITEMS.filter((item) => !item.primary && !item.disabled)
    const slots = [others[0], others[1], primary, others[2], others[3]].filter(Boolean)

    return (
        <nav aria-label="Main" className="mobile-tabbar fixed inset-x-0 bottom-0 z-40 md:hidden">
            <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
                {slots.map((item) => {
                    const active = item.isActive(pathname)
                    const Icon = item.icon
                    if (item.primary) {
                        return (
                            <li key={item.href} className="flex justify-center">
                                <Link
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    data-tour={item.tour}
                                    className="group -mt-5 flex flex-col items-center gap-1"
                                >
                                    {/* On Create itself the page's own Create button is the primary action, so the tab goes quiet. */}
                                    <span className={cn(
                                        "grid size-14 place-items-center rounded-full transition-transform duration-300 group-active:scale-95",
                                        active
                                            ? "border border-gold-300/50 bg-[#141614] text-gold-200 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)]"
                                            : "bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[#1a160e] shadow-[0_10px_30px_-8px_rgba(217,192,138,0.75),inset_0_1px_0_rgba(255,255,255,0.6)]"
                                    )}>
                                        <Icon className="size-6" strokeWidth={1.8} />
                                    </span>
                                    <span className={cn("text-[11px] font-medium", active ? "text-gold-100" : "text-[#d6d0c0]")}>{item.name}</span>
                                </Link>
                            </li>
                        )
                    }
                    return (
                        <li key={item.href}>
                            <Link
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                data-tour={item.tour}
                                className={cn(
                                    "flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors",
                                    active ? "text-gold-200" : "text-[#a9aba3] active:text-white"
                                )}
                            >
                                <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.6} />
                                {item.name}
                                <span className={cn("h-0.5 w-4 rounded-full transition-opacity", active ? "bg-gold-300 opacity-100" : "opacity-0")} />
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}

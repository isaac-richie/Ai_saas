"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/core/utils"
import { NAV_ITEMS } from "./nav-items"

/**
 * Phone navigation: a bottom tab bar within thumb reach, with Create raised in
 * the middle as the one primary action. Hidden from md up, where the sidebar takes over.
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
                                    <span className={cn(
                                        "grid size-14 place-items-center rounded-full bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[#1a160e] shadow-[0_10px_30px_-8px_rgba(217,192,138,0.75),inset_0_1px_0_rgba(255,255,255,0.6)] transition-transform duration-300 group-active:scale-95",
                                        active && "ring-2 ring-gold-200/60 ring-offset-2 ring-offset-[#0b0c0b]"
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

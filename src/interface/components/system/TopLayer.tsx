"use client"

import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

const subscribe = () => () => {}

/**
 * Renders children straight into <body>. The studio shell animates each page inside a transformed
 * container, and a transformed ancestor traps `position: fixed`; a portal escapes it so a full-screen
 * layer really covers the sidebar, header and tab bar. The server renders it in place; the client
 * moves it to <body> right after hydration.
 */
export function TopLayer({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  return mounted ? createPortal(children, document.body) : <>{children}</>
}

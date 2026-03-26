"use client"

import { useEffect, useRef } from "react"

export function LandingSpotlight() {
    const spotlightRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const node = spotlightRef.current
        if (!node) return

        const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches
        if (isCoarsePointer) {
            node.style.setProperty("--spotlight-x", "50%")
            node.style.setProperty("--spotlight-y", "24%")
            return
        }

        let rafId = 0
        let currentX = window.innerWidth * 0.5
        let currentY = window.innerHeight * 0.24
        let targetX = currentX
        let targetY = currentY

        const render = () => {
            currentX += (targetX - currentX) * 0.12
            currentY += (targetY - currentY) * 0.12
            const x = `${(currentX / window.innerWidth) * 100}%`
            const y = `${(currentY / window.innerHeight) * 100}%`
            node.style.setProperty("--spotlight-x", x)
            node.style.setProperty("--spotlight-y", y)
            rafId = window.requestAnimationFrame(render)
        }

        const onPointerMove = (event: PointerEvent) => {
            targetX = event.clientX
            targetY = event.clientY
        }

        window.addEventListener("pointermove", onPointerMove, { passive: true })
        rafId = window.requestAnimationFrame(render)

        return () => {
            window.cancelAnimationFrame(rafId)
            window.removeEventListener("pointermove", onPointerMove)
        }
    }, [])

    return (
        <div
            ref={spotlightRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            style={{
                background: [
                    "radial-gradient(680px circle at var(--spotlight-x, 50%) var(--spotlight-y, 24%), rgba(34,211,238,0.18), rgba(53,166,255,0.06) 34%, rgba(5,5,5,0) 68%)",
                    "radial-gradient(480px circle at calc(var(--spotlight-x, 50%) + 6%) calc(var(--spotlight-y, 24%) - 4%), rgba(255,255,255,0.06), rgba(5,5,5,0) 70%)",
                ].join(","),
                willChange: "background",
            }}
        />
    )
}

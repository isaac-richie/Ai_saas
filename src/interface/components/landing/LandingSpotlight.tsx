"use client"

import { useEffect, useState } from "react"

export function LandingSpotlight() {
    const [position, setPosition] = useState({ x: 50, y: 20 })

    useEffect(() => {
        const onMove = (event: MouseEvent) => {
            const x = (event.clientX / window.innerWidth) * 100
            const y = (event.clientY / window.innerHeight) * 100
            setPosition({ x, y })
        }

        window.addEventListener("mousemove", onMove)
        return () => window.removeEventListener("mousemove", onMove)
    }, [])

    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 transition-[background] duration-200"
            style={{
                background: `radial-gradient(600px circle at ${position.x}% ${position.y}%, rgba(34,211,238,0.15), rgba(5,5,5,0.02) 45%, rgba(5,5,5,0) 70%)`,
            }}
        />
    )
}

"use client"

import React, { useRef, useEffect } from "react"
import { gsap } from "gsap"

interface MagneticButtonProps {
  children: React.ReactNode
  className?: string
  distance?: number
}

export function MagneticButton({ children, className = "", distance = 0.5 }: MagneticButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const button = buttonRef.current
    if (!button) return

    const xTo = gsap.quickTo(button, "x", { duration: 0.8, ease: "elastic.out(1, 0.3)" })
    const yTo = gsap.quickTo(button, "y", { duration: 0.8, ease: "elastic.out(1, 0.3)" })

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e
      const { left, top, width, height } = button.getBoundingClientRect()
      const x = clientX - (left + width / 2)
      const y = clientY - (top + height / 2)

      xTo(x * distance)
      yTo(y * distance)
    }

    const handleMouseLeave = () => {
      xTo(0)
      yTo(0)
    }

    button.addEventListener("mousemove", handleMouseMove)
    button.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      button.removeEventListener("mousemove", handleMouseMove)
      button.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [distance])

  return (
    <div ref={buttonRef} className={`inline-block ${className}`}>
      {children}
    </div>
  )
}

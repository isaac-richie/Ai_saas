"use client"

import { useEffect, useRef, useState } from "react"

interface CounterValueProps {
  end: number
  durationMs?: number
  suffix?: string
}

export function CounterValue({ end, durationMs = 1200, suffix = "" }: CounterValueProps) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let raf = 0
    let startedAt = 0
    let started = false

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || started) return
        started = true
        const step = (timestamp: number) => {
          if (!startedAt) startedAt = timestamp
          const progress = Math.min((timestamp - startedAt) / durationMs, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setValue(Math.round(end * eased))
          if (progress < 1) raf = window.requestAnimationFrame(step)
        }
        raf = window.requestAnimationFrame(step)
        observer.disconnect()
      },
      { threshold: 0.4 }
    )

    observer.observe(element)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(raf)
    }
  }, [durationMs, end])

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  )
}


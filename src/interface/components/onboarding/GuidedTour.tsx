"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/interface/components/ui/button"

type TourStep = {
  id: string
  title: string
  description: string
  selector: string
  route?: string
}

const STORAGE_KEY = "aisas.tour.completed.v1"

const STEPS: TourStep[] = [
  {
    id: "create",
    title: "Start here: Create",
    description: "Describe an idea in a sentence, tap Create video, and get a cinematic clip in a few minutes.",
    selector: "[data-tour='nav-create']",
  },
  {
    id: "studio",
    title: "Studio, for longer stories",
    description: "Plan a film scene by scene: pick the best image for each shot, then bring it to life.",
    selector: "[data-tour='nav-studio']",
  },
  {
    id: "videos",
    title: "My videos",
    description: "Everything you make lands here, ready to watch, download and share.",
    selector: "[data-tour='nav-videos']",
  },
]

/** The sidebar and the phone tab bar both carry tour targets; highlight whichever is on screen. */
function findVisible(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => element.getClientRects().length > 0) ?? null
}

export function GuidedTour() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const activeTargetRef = useRef<HTMLElement | null>(null)

  const step = STEPS[stepIndex]

  useEffect(() => {
    const completed = window.localStorage.getItem(STORAGE_KEY) === "1"
    if (!completed && pathname.startsWith("/dashboard")) {
      const timer = window.setTimeout(() => setOpen(true), 0)
      return () => window.clearTimeout(timer)
    }
  }, [pathname])

  useEffect(() => {
    const onStart = () => {
      setStepIndex(0)
      setOpen(true)
    }
    window.addEventListener("aisas:start-tour", onStart)
    return () => window.removeEventListener("aisas:start-tour", onStart)
  }, [])

  useEffect(() => {
    if (!open || !step) return
    if (step.route && pathname !== step.route) {
      router.push(step.route)
      return
    }

    const sync = () => {
      const element = findVisible(step.selector)
      if (element) {
        const target = element as HTMLElement
        if (activeTargetRef.current && activeTargetRef.current !== target) {
          activeTargetRef.current.classList.remove("tour-highlight-target")
        }
        target.classList.add("tour-highlight-target")
        activeTargetRef.current = target
        const rect = target.getBoundingClientRect()
        setTargetRect(rect)
        target.scrollIntoView({ block: "center", behavior: "smooth" })
      } else {
        if (activeTargetRef.current) {
          activeTargetRef.current.classList.remove("tour-highlight-target")
          activeTargetRef.current = null
        }
        setTargetRect(null)
      }
    }

    sync()
    window.addEventListener("resize", sync)
    const timer = window.setTimeout(sync, 180)
    return () => {
      window.removeEventListener("resize", sync)
      window.clearTimeout(timer)
      if (activeTargetRef.current) {
        activeTargetRef.current.classList.remove("tour-highlight-target")
        activeTargetRef.current = null
      }
    }
  }, [open, step, pathname, router])

  const spotlightStyle = useMemo(() => {
    if (!targetRect) return {}
    return {
      left: Math.max(8, targetRect.left - 8),
      top: Math.max(8, targetRect.top - 8),
      width: targetRect.width + 16,
      height: targetRect.height + 16,
    }
  }, [targetRect])

  if (!open || !step) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      {targetRect ? null : <div className="absolute inset-0 bg-black/70" />}
      {targetRect ? (
        <div
          className="absolute rounded-2xl border border-gold-300/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] transition-all duration-300"
          style={spotlightStyle}
        />
      ) : null}

      <div className="pointer-events-auto absolute inset-x-3 bottom-28 max-h-[68vh] overflow-y-auto rounded-2xl border border-gold-400/20 bg-obsidian-950 p-3 text-white shadow-2xl md:bottom-6 md:left-auto md:right-6 md:max-h-none md:w-[min(28rem,calc(100%-2rem))] md:overflow-visible md:p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-gold-300/80 md:text-xs">Quick tour</div>
        <h3 className="mt-1 text-sm font-semibold md:text-base">{step.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#B0B8C4] md:text-sm">{step.description}</p>
        <div className="mt-3 flex items-center justify-between text-[11px] text-white/45 md:text-xs">
          <span>
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            className="underline decoration-white/25 underline-offset-4 hover:text-white"
            onClick={() => {
              window.localStorage.setItem(STORAGE_KEY, "1")
              setOpen(false)
            }}
          >
            Skip tour
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:flex md:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="rounded-lg border border-gold-400/[0.12] bg-white/5 text-white/70 hover:bg-gold-400/[0.08]"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
          >
            Back
          </Button>
          <Button
            type="button"
            className="rounded-lg border border-gold-400/[0.12] bg-white/10 text-white hover:bg-gold-400/[0.12] hover:text-gold-50"
            onClick={() => {
              if (stepIndex >= STEPS.length - 1) {
                window.localStorage.setItem(STORAGE_KEY, "1")
                setOpen(false)
                return
              }
              setStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1))
            }}
          >
            {stepIndex >= STEPS.length - 1 ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  )
}

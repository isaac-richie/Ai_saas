"use client"

import { useState } from "react"
import { Card, CardContent } from "@/interface/components/ui/card"
import { Button } from "@/interface/components/ui/button"
import { Gauge } from "lucide-react"

const REDUCE_MOTION_STORAGE_KEY = "aisas.motion.reduce"

export function MotionSettingsCard() {
  const [motionReduced, setMotionReduced] = useState(() => {
    try {
      if (typeof window === "undefined") return false
      return window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })

  const toggle = () => {
    setMotionReduced((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, next ? "1" : "0")
      } catch {
        // no-op
      }
      document.documentElement.classList.toggle("motion-reduce-user", next)
      return next
    })
  }

  return (
    <Card data-reveal="card" className="rounded-2xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
      <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3 text-sm text-white/60">
          <Gauge className="mt-0.5 h-5 w-5 text-white/55" />
          <div>
            <p className="font-medium text-white/85">Motion Effects</p>
            <p>Control cinematic transitions and ambient animation intensity.</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/12"
          onClick={toggle}
        >
          {motionReduced ? "Enable Motion" : "Reduce Motion"}
        </Button>
      </CardContent>
    </Card>
  )
}

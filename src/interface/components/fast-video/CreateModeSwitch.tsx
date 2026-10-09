"use client"

import { useState } from "react"
import type * as React from "react"
import { Clapperboard, Sparkles } from "lucide-react"

export type CreateMode = "quick" | "film"

const MODES: { id: CreateMode; label: string; hint: string; icon: typeof Sparkles }[] = [
  { id: "quick", label: "Quick video", hint: "One idea, one clip", icon: Sparkles },
  { id: "film", label: "Longer film", hint: "Multi-shot story", icon: Clapperboard },
]

/**
 * Create starts on the simple path (one prompt, one video). The multi-shot film
 * planner sits one tap away. Both stay mounted so switching never loses work.
 */
export function CreateModeSwitch({ initialMode, quick, film }: { initialMode: CreateMode; quick: React.ReactNode; film: React.ReactNode }) {
  const [mode, setMode] = useState<CreateMode>(initialMode)
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="What are you making?" className="grid grid-cols-2 gap-1.5 rounded-2xl border border-gold-400/[0.14] bg-black/30 p-1.5 sm:inline-grid sm:min-w-[440px]">
        {MODES.map(({ id, label, hint, icon: Icon }) => {
          const active = mode === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`create-panel-${id}`}
              onClick={() => {
                setMode(id)
                const url = new URL(window.location.href)
                if (id === "film") url.searchParams.set("mode", "film")
                else url.searchParams.delete("mode")
                window.history.replaceState(null, "", url)
              }}
              className={`flex min-h-[56px] items-center gap-3 rounded-xl px-3.5 text-left transition-all duration-300 ${
                active
                  ? "bg-[linear-gradient(135deg,rgba(243,229,192,0.16),rgba(217,192,138,0.08))] text-gold-50 shadow-[inset_0_0_0_1px_rgba(229,169,60,0.55),0_10px_26px_-16px_rgba(217,192,138,0.9)]"
                  : "text-[#c9c5b8] hover:bg-white/[0.04]"
              }`}
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${active ? "bg-gold-300 text-[#1a160e]" : "bg-white/[0.06] text-gold-300/80"}`}>
                <Icon className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold leading-tight">{label}</span>
                <span className="block truncate text-[11.5px] text-[#B0B8C4]">{hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div id="create-panel-quick" role="tabpanel" hidden={mode !== "quick"}>{quick}</div>
      <div id="create-panel-film" role="tabpanel" hidden={mode !== "film"}>{film}</div>
    </div>
  )
}

"use client"

import { useMemo } from "react"
import Link from "next/link"
import { CheckCircle2, Circle, Sparkles } from "lucide-react"

interface NewUserChecklistProps {
  projectCount: number
  hasGeneratedAsset: boolean
}

export function NewUserChecklist({ projectCount, hasGeneratedAsset }: NewUserChecklistProps) {
  const steps = useMemo(
    () => [
      {
        id: "project",
        label: "Create your first project",
        done: projectCount > 0,
        href: "/dashboard",
      },
      {
        id: "generate",
        label: "Generate and save your first shot",
        done: hasGeneratedAsset,
        href: "/dashboard/fast-video?mode=single-shot",
      },
    ],
    [projectCount, hasGeneratedAsset]
  )

  const completed = steps.filter((step) => step.done).length

  return (
    <section data-reveal="card" className="rounded-2xl border border-white/10 bg-[#0f1012] p-4 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-white/45">Onboarding</p>
          <h3 className="mt-1 text-base font-semibold">Your first shot</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60">
          {completed}/{steps.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {steps.map((step) => (
          <Link
            key={step.id}
            href={step.href}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            <span className="inline-flex items-center gap-2">
              {step.done ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Circle className="h-4 w-4 text-white/45" />}
              {step.label}
            </span>
            {!step.done ? <Sparkles className="h-3.5 w-3.5 text-white/45" /> : null}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-white/55">After saving, review your take in Gallery and export it when it is ready.</p>
      <div className="mt-2 flex gap-4 text-xs text-[#d6ede7]">
        <Link href="/dashboard/gallery">Open Gallery</Link>
        <Link href="/dashboard/exports">Open Exports</Link>
      </div>
    </section>
  )
}

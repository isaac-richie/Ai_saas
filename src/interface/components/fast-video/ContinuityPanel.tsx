"use client"

import { Input } from "@/interface/components/ui/input"

export type ContinuityKey = "character" | "wardrobe" | "location" | "lighting" | "colorGrade" | "cameraStyle"

type ContinuityLockDef = {
  key: ContinuityKey
  label: string
}

const CONTINUITY_LOCKS: ContinuityLockDef[] = [
  { key: "character", label: "Character" },
  { key: "wardrobe", label: "Wardrobe" },
  { key: "location", label: "Location" },
  { key: "lighting", label: "Lighting" },
  { key: "colorGrade", label: "Color Grade" },
  { key: "cameraStyle", label: "Camera Style" },
]

interface ContinuityPanelProps {
  enabled: boolean
  onToggleEnabled: () => void
  locks: Record<ContinuityKey, boolean>
  onToggleLock: (key: ContinuityKey) => void
  values: Record<ContinuityKey, string>
  onChangeValue: (key: ContinuityKey, value: string) => void
}

export { CONTINUITY_LOCKS }

export function ContinuityPanel({
  enabled,
  onToggleEnabled,
  locks,
  onToggleLock,
  values,
  onChangeValue,
}: ContinuityPanelProps) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-white/45 font-medium">Continuity Locks</p>
        <button
          type="button"
          onClick={onToggleEnabled}
          className={`h-7 rounded-full border px-2.5 text-[10px] font-medium transition ${
            enabled
              ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
              : "border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </div>
      {enabled ? (
        <div className="grid gap-2">
          {CONTINUITY_LOCKS.map((item) => (
            <div key={item.key} className="grid gap-1.5 sm:grid-cols-[auto_1fr] sm:items-center">
              <button
                type="button"
                onClick={() => onToggleLock(item.key)}
                className={`h-8 rounded-lg border px-2.5 text-[11px] transition ${
                  locks[item.key]
                    ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                    : "border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
              <Input
                value={values[item.key]}
                onChange={(event) => onChangeValue(item.key, event.target.value)}
                placeholder={`${item.label} reference (optional)`}
                disabled={!locks[item.key]}
                className="h-8 rounded-lg border-white/12 bg-white/5 text-[11px] text-white placeholder:text-white/35 disabled:opacity-45"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function buildContinuityClauseFromState(
  enabled: boolean,
  locks: Record<ContinuityKey, boolean>,
  values: Record<ContinuityKey, string>
): string {
  if (!enabled) return ""
  const parts = CONTINUITY_LOCKS.filter((item) => locks[item.key]).map((item) => {
    const value = values[item.key]?.trim()
    if (!value) return `${item.label.toLowerCase()} consistency`
    return `${item.label.toLowerCase()}: ${value}`
  })
  if (parts.length === 0) return ""
  return `continuity locks -> ${parts.join(", ")}`
}

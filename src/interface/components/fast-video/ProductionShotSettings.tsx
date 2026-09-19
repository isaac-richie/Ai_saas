"use client"

import { useState } from "react"
import { productionShotSettingsSchema, type ProductionShotSettings as Settings } from "@/core/validation/production-settings"

export type ShotSettingDraft = { model: string; durationSeconds: number }
export const emptyShotSettings = (): ShotSettingDraft[] => Array.from({ length: 3 }, () => ({ model: "", durationSeconds: 0 }))

export function ProductionShotSettings({ value, onChange, disabled }: { value: ShotSettingDraft[]; onChange: (value: ShotSettingDraft[]) => void; disabled: boolean }) {
  return <fieldset disabled={disabled} className="my-4 rounded-xl border border-white/15 p-4">
    <legend className="px-2 text-sm text-white/80">Model & duration per shot</legend>
    <div className="grid gap-4 sm:grid-cols-3">{value.map((shot, index) => <div key={index} className="min-w-0 space-y-2">
      <p className="text-xs uppercase tracking-widest text-white/50">Shot {index + 1}</p>
      <label className="block text-xs text-white/70">Model<select required aria-label={`Shot ${index + 1} model`} value={shot.model} onChange={event => onChange(value.map((item, i) => i === index ? { ...item, model: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-white/20 bg-[#151717] p-2 text-white"><option value="">Choose model</option><option value="kling">Kling</option><option value="seedance">Seedance</option></select></label>
      <label className="block text-xs text-white/70">Duration<select required aria-label={`Shot ${index + 1} duration`} value={shot.durationSeconds || ""} onChange={event => onChange(value.map((item, i) => i === index ? { ...item, durationSeconds: Number(event.target.value) } : item))} className="mt-1 w-full rounded-lg border border-white/20 bg-[#151717] p-2 text-white"><option value="">Choose duration</option><option value="5">5 seconds</option><option value="10">10 seconds</option></select></label>
    </div>)}</div>
    <p className="mt-3 text-xs text-white/50">Choose settings for each shot. Durations shown are supported by our current integration.</p>
  </fieldset>
}

export function ReviseProductionSettings({ initial, disabled, onSubmit }: { initial: ShotSettingDraft[]; disabled: boolean; onSubmit: (settings: Settings) => void }) {
  const [value, setValue] = useState(initial)
  const parsed = productionShotSettingsSchema.safeParse(value)
  return <details className="my-4 text-sm text-white/70"><summary className="cursor-pointer">Change shot models & durations</summary>
    <ProductionShotSettings value={value} onChange={setValue} disabled={disabled} />
    <p className="mb-3 text-xs">Creates a revised plan so the crew can retime the action. Existing takes remain in their original workspace. AI planning credits apply when developing the revision.</p>
    <button type="button" disabled={disabled || !parsed.success} onClick={() => { if (parsed.success) onSubmit(parsed.data) }} className="rounded-full border border-white/20 px-4 py-2 text-white disabled:opacity-40">Save revised settings</button>
  </details>
}

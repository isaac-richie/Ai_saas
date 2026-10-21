"use client"

import { useId, useRef, useState } from "react"
import { productionShotSettingsSchema, type ProductionShotSettings as Settings } from "@/core/validation/production-settings"
import { KIE_VIDEO_MODEL_FAMILIES } from "@/core/config/kie-video-models"
import styles from "./ProductionShotSettings.module.css"

export type ShotSettingDraft = { model: string; durationSeconds: number }
// New films start ready to go: Kling 3.0 Pro at 5 s per shot; every shot can be changed.
export const emptyShotSettings = (): ShotSettingDraft[] => Array.from({ length: 3 }, () => ({ model: "kling", durationSeconds: 5 }))
const modelName = (model: string) => model === "seedance" ? "Seedance 2.5" : model === "kling" ? "Kling 3.0 Pro" : "Pick a model"
const runtime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
const MODELS = ["kling", "seedance"] as const
const MODEL_NOTES: Record<string, string> = { kling: "Steady realism · 3 to 15 s", seedance: "Punchy, stylised · 4 to 30 s" }
const MIN_SHOTS = 2
const MAX_SHOTS = 12
/** Every whole-second length the model accepts on Kie (Kling 3.0: 3–15 s, Seedance 2.5: 4–30 s). */
export const durationsFor = (model: string) => {
  const family = KIE_VIDEO_MODEL_FAMILIES.find((item) => item.id === model)
  return family ? Array.from({ length: family.maxSeconds - family.minSeconds + 1 }, (_, i) => family.minSeconds + i) : []
}

/** Keeps a shot ready when its model changes: unsupported timing snaps to the nearest allowed length. */
export function retimeForModel(model: string, seconds: number) {
  const allowed = durationsFor(model)
  if (!allowed.length) return 0
  if (!seconds) return 10
  return allowed.reduce((best, candidate) => Math.abs(candidate - seconds) < Math.abs(best - seconds) ? candidate : best, allowed[0])
}

const LENGTH_PRESETS = [
  { seconds: 30, label: "30 sec" },
  { seconds: 60, label: "1 min" },
  { seconds: 120, label: "2 min" },
] as const

export function ProductionShotSettings({ value, onChange, disabled }: { value: ShotSettingDraft[]; onChange: (value: ShotSettingDraft[]) => void; disabled: boolean }) {
  const [selection, setSelection] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const selected = Math.min(selection, Math.max(0, value.length - 1))
  const shot = value[selected]
  const total = value.reduce((sum, item) => sum + item.durationSeconds, 0)
  const incomplete = value.filter(item => !item.model || !item.durationSeconds).length
  const durations = durationsFor(shot?.model ?? "")
  const sharedModel = value.every(item => item.model && item.model === value[0].model) ? value[0].model : ""
  function update(patch: Partial<ShotSettingDraft>) {
    if (!disabled) onChange(value.map((item, index) => index === selected ? { ...item, ...patch } : item))
  }
  function setModel(model: string) {
    update({ model, durationSeconds: retimeForModel(model, shot.durationSeconds) })
  }
  function setModelForAll(model: string) {
    if (!disabled) onChange(value.map(item => ({ model, durationSeconds: retimeForModel(model, item.durationSeconds || 10) })))
  }
  function resize(count: number) {
    if (disabled || count < MIN_SHOTS || count > MAX_SHOTS) return
    const last = value[value.length - 1] ?? { model: "", durationSeconds: 0 }
    onChange(count > value.length ? [...value, ...Array.from({ length: count - value.length }, () => ({ ...last }))] : value.slice(0, count))
    if (count <= selected) setSelection(count - 1)
  }
  function select(index: number) {
    setSelection(index)
    tabs.current[index]?.focus()
    tabs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }
  if (!shot) return null

  return <fieldset disabled={disabled} className={styles.console}>
    <legend className={styles.srOnly}>Shot models and timing</legend>
    <div className={styles.topbar}>
      <div><h4 className={styles.heading}>Shape the pace</h4><span className={styles.eyebrow}>How long the film runs, and each shot&rsquo;s model and timing.</span></div>
      <div className={styles.runtime} aria-live="polite"><strong>{runtime(total)}</strong><span>{value.length} shots <i /> planned runtime</span></div>
    </div>

    <div className={styles.setup}>
      <div>
        <span className={styles.label}>Film length</span>
        <div role="group" aria-label="Film length presets" className={styles.lengths}>{LENGTH_PRESETS.map(({ seconds, label }) => <button key={seconds} type="button" aria-pressed={total === seconds && value.length === seconds / 10 && value.every(item => item.durationSeconds === 10)} onClick={() => {
          setSelection(0)
          onChange(Array.from({ length: seconds / 10 }, (_, index) => ({ model: value[index]?.model || value[0]?.model || "", durationSeconds: 10 })))
        }}>{label}</button>)}</div>
      </div>
      <div>
        <span className={styles.label}>Shots <small style={{ opacity: 0.7, fontWeight: 400 }}>· up to 12</small></span>
        <div className={styles.counter} role="group" aria-label="Number of shots">
          <button type="button" aria-label="Remove a shot" disabled={disabled || value.length <= MIN_SHOTS} onClick={() => resize(value.length - 1)}>−</button>
          <output aria-live="polite">{value.length}</output>
          <button type="button" aria-label="Add a shot" disabled={disabled || value.length >= MAX_SHOTS} onClick={() => resize(value.length + 1)}>+</button>
        </div>
      </div>
      <div>
        <span className={styles.label}>Model for all shots</span>
        <div role="group" aria-label="Model for all shots" className={styles.lengths}>{MODELS.map(model => <button key={model} type="button" aria-pressed={sharedModel === model} onClick={() => setModelForAll(model)}>{modelName(model)}</button>)}</div>
      </div>
    </div>

    <div className={styles.timeline} role="tablist" aria-label="Select a shot to edit">{value.map((item, index) => <button type="button" key={index} ref={node => { tabs.current[index] = node }} role="tab" id={`${id}-shot-${index}`} aria-controls={`${id}-editor`} aria-selected={index === selected} tabIndex={index === selected ? 0 : -1} onClick={() => setSelection(index)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % value.length : event.key === "ArrowLeft" ? (index - 1 + value.length) % value.length : event.key === "Home" ? 0 : event.key === "End" ? value.length - 1 : null
      if (next !== null) { event.preventDefault(); select(next) }
    }} className={styles.shot} data-model={item.model || "none"} style={{ flexGrow: Math.max(item.durationSeconds, 4) }}>
      <span className={styles.shotTop}><span>Shot {index + 1}</span><span className={styles.dot} data-ready={!!item.model && !!item.durationSeconds} /></span>
      <strong>{item.durationSeconds || "--"}<small>sec</small></strong>
      <span className={styles.shotModel}>{modelName(item.model)}</span>
      <span className={styles.ruler} aria-hidden="true" />
    </button>)}</div>

    <div role="tabpanel" id={`${id}-editor`} aria-labelledby={`${id}-shot-${selected}`} className={styles.editor}>
      <div className={styles.editorTitle}><strong>Shot {selected + 1}</strong><span>Set the look and timing.</span></div>
      <div className={styles.modelControl}><span className={styles.label}>Video model</span><div role="radiogroup" aria-label={`Shot ${selected + 1} model`} className={styles.modelCards}>{MODELS.map(model => <button key={model} type="button" role="radio" aria-checked={shot.model === model} onClick={() => setModel(model)}>{modelName(model)}<small>{MODEL_NOTES[model]}</small></button>)}</div></div>
      <div className={styles.durationControl}><span className={styles.label} id={`${id}-duration`}>Duration</span>
        {durations.length
          ? <div role="radiogroup" aria-label={`Shot ${selected + 1} duration`} className={styles.chips} data-many={durations.length > 2}>{durations.map(seconds => <button key={seconds} type="button" role="radio" aria-checked={shot.durationSeconds === seconds} onClick={() => update({ durationSeconds: seconds })}>{seconds}s</button>)}</div>
          : <small>Select a model first</small>}
      </div>
    </div>
    <div className={styles.footnote} aria-live="polite"><span>{incomplete ? `${incomplete} ${incomplete === 1 ? "shot needs" : "shots need"} a model or duration. Tip: set a model for all shots above.` : "All shots configured."}</span><span>Longer films use more generation credits.</span></div>
  </fieldset>
}

export function ReviseProductionSettings({ initial, disabled, onSubmit }: { initial: ShotSettingDraft[]; disabled: boolean; onSubmit: (settings: Settings) => void }) {
  const [value, setValue] = useState(initial)
  const parsed = productionShotSettingsSchema.safeParse(value)
  const changed = JSON.stringify(value) !== JSON.stringify(initial)
  return <details className={styles.revision}><summary><span className={styles.summaryIcon} aria-hidden="true">＋</span><span>Sequence settings<small>Models, timing & film length</small></span><span className={styles.summaryAction}>Edit sequence</span></summary>
    <ProductionShotSettings value={value} onChange={setValue} disabled={disabled} />
    <div className={styles.savebar}><div><strong>{changed ? "Ready for a new direction?" : "Your current sequence"}</strong><p>Rebuilding retimes the plan and uses AI planning credits. Existing takes stay in their workspace.</p></div><div className={styles.actions}>
      {changed && <button type="button" disabled={disabled} className={styles.reset} onClick={() => setValue(initial)}>Reset changes</button>}
      <button type="button" disabled={disabled || !parsed.success || !changed} onClick={() => { if (!disabled && parsed.success && changed) onSubmit(parsed.data) }} className={styles.rebuild}>{disabled ? "Working…" : "Rebuild production plan"}<span aria-hidden="true">↗</span></button>
    </div></div>
  </details>
}

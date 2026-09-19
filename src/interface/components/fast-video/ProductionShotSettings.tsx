"use client"

import { useId, useRef, useState } from "react"
import { productionShotSettingsSchema, type ProductionShotSettings as Settings } from "@/core/validation/production-settings"
import styles from "./ProductionShotSettings.module.css"

export type ShotSettingDraft = { model: string; durationSeconds: number }
export const emptyShotSettings = (): ShotSettingDraft[] => Array.from({ length: 3 }, () => ({ model: "", durationSeconds: 0 }))
const modelName = (model: string) => model === "seedance" ? "Seedance" : model === "kling" ? "Kling" : "Choose model"
const runtime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

export function ProductionShotSettings({ value, onChange, disabled }: { value: ShotSettingDraft[]; onChange: (value: ShotSettingDraft[]) => void; disabled: boolean }) {
  const [selection, setSelection] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const selected = Math.min(selection, Math.max(0, value.length - 1))
  const shot = value[selected]
  const total = value.reduce((sum, item) => sum + item.durationSeconds, 0)
  const incomplete = value.filter(item => !item.model || !item.durationSeconds).length
  const durations = shot?.model === "seedance" ? Array.from({ length: 12 }, (_, i) => i + 4) : [5, 10]
  const durationIndex = durations.indexOf(shot?.durationSeconds)
  function update(patch: Partial<ShotSettingDraft>) {
    if (!disabled) onChange(value.map((item, index) => index === selected ? { ...item, ...patch } : item))
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
      <div><span className={styles.eyebrow}>THE SEQUENCE</span><h4 className={styles.heading}>Shape the pace.</h4></div>
      <div className={styles.runtime} aria-live="polite"><strong>{runtime(total)}</strong><span>{value.length} shots <i /> planned runtime</span></div>
    </div>
    <div className={styles.presets}>
      <span>Start with a length</span>
      <div role="group" aria-label="Film length presets">{[30, 60, 120].map(seconds => <button key={seconds} type="button" aria-pressed={total === seconds && value.length === seconds / 10 && value.every(item => item.durationSeconds === 10)} onClick={() => {
        setSelection(0)
        onChange(Array.from({ length: seconds / 10 }, (_, index) => ({ model: value[index]?.model || value[0]?.model || "", durationSeconds: 10 })))
      }}>{seconds < 60 ? "30 sec" : `${seconds / 60} min`}</button>)}</div>
      <small>Presets arrange 10-second shots.</small>
    </div>
    <div className={styles.timeline} role="tablist" aria-label="Select a shot to edit">{value.map((item, index) => <button type="button" key={index} ref={node => { tabs.current[index] = node }} role="tab" id={`${id}-shot-${index}`} aria-controls={`${id}-editor`} aria-selected={index === selected} tabIndex={index === selected ? 0 : -1} onClick={() => setSelection(index)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % value.length : event.key === "ArrowLeft" ? (index - 1 + value.length) % value.length : event.key === "Home" ? 0 : event.key === "End" ? value.length - 1 : null
      if (next !== null) { event.preventDefault(); select(next) }
    }} className={styles.shot}>
      <span className={styles.shotTop}><span>SHOT {String(index + 1).padStart(2, "0")}</span><span className={styles.dot} data-ready={!!item.model && !!item.durationSeconds} /></span>
      <strong>{item.durationSeconds || "--"}<small>sec</small></strong>
      <span className={styles.shotModel}>{modelName(item.model)}</span>
      <span className={styles.ruler} aria-hidden="true" />
    </button>)}</div>
    <div role="tabpanel" id={`${id}-editor`} aria-labelledby={`${id}-shot-${selected}`} className={styles.editor}>
      <div className={styles.editorTitle}><span className={styles.eyebrow}>IN FOCUS</span><strong>Shot {String(selected + 1).padStart(2, "0")}</strong><span>Set the look and timing.</span></div>
      <div className={styles.modelControl}><span className={styles.label}>Video model</span><div role="group" aria-label={`Shot ${selected + 1} model`} className={styles.models}>{["kling", "seedance"].map(model => <button key={model} type="button" aria-pressed={shot.model === model} onClick={() => update({ model, durationSeconds: model === "kling" && ![5, 10].includes(shot.durationSeconds) ? 0 : shot.durationSeconds })}>{modelName(model)}</button>)}</div></div>
      <div className={styles.durationControl}><label className={styles.label} htmlFor={`${id}-duration`}>Duration</label><div className={styles.stepper}>
        <button type="button" aria-label="Decrease shot duration" disabled={disabled || !shot.model || durationIndex <= 0} onClick={() => update({ durationSeconds: durations[durationIndex - 1] })}>−</button>
        <select id={`${id}-duration`} aria-label={`Shot ${selected + 1} duration`} disabled={disabled || !shot.model} value={shot.durationSeconds || ""} onChange={event => update({ durationSeconds: Number(event.target.value) })}><option value="" disabled>Choose</option>{durations.map(seconds => <option key={seconds} value={seconds}>{seconds} sec</option>)}</select>
        <button type="button" aria-label="Increase shot duration" disabled={disabled || !shot.model || durationIndex === durations.length - 1} onClick={() => update({ durationSeconds: durations[durationIndex + 1] })}>+</button>
      </div><small>{shot.model ? shot.model === "seedance" ? "4–15 seconds" : "5 or 10 seconds" : "Select a model first"}</small></div>
    </div>
    <div className={styles.footnote} aria-live="polite"><span>{incomplete ? `${incomplete} ${incomplete === 1 ? "shot needs" : "shots need"} a model or duration.` : "All shots configured."}</span><span>Longer films use more generation credits.</span></div>
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

"use client"

import { AlertTriangle, ImagePlus, X } from "lucide-react"
import { Input } from "@/interface/components/ui/input"
import { referenceRoles, type MediaReference } from "@/core/validation/media-reference"

export type ContinuityKey = "character" | "wardrobe" | "location" | "lighting" | "colorGrade" | "cameraStyle"

type ContinuityLockDef = {
  key: ContinuityKey
  label: string
  /** The reference role this channel takes over when locked to a reference. */
  role?: string
}

const CONTINUITY_LOCKS: ContinuityLockDef[] = [
  { key: "character", label: "Character", role: "character" },
  { key: "wardrobe", label: "Wardrobe", role: "wardrobe" },
  { key: "location", label: "Location", role: "location" },
  { key: "lighting", label: "Lighting", role: "lighting" },
  { key: "colorGrade", label: "Color Grade" },
  { key: "cameraStyle", label: "Camera Style" },
]

export type ContinuitySources = Record<ContinuityKey, string>

export const EMPTY_CONTINUITY_SOURCES: ContinuitySources = {
  character: "", wardrobe: "", location: "", lighting: "", colorGrade: "", cameraStyle: "",
}

interface ContinuityPanelProps {
  enabled: boolean
  onToggleEnabled: () => void
  locks: Record<ContinuityKey, boolean>
  onToggleLock: (key: ContinuityKey) => void
  values: Record<ContinuityKey, string>
  onChangeValue: (key: ContinuityKey, value: string) => void
  /** Reference id each channel is locked to ("" for none). */
  sources: ContinuitySources
  onChangeSource: (key: ContinuityKey, referenceId: string) => void
  /** The panel's references, already labelled (@image1…), to lock channels to. */
  references: MediaReference[]
}

export { CONTINUITY_LOCKS }

/** A channel is active only when it is locked and holds something: text or a reference that still exists. */
export function continuityChannelState(key: ContinuityKey, locks: Record<ContinuityKey, boolean>, values: Record<ContinuityKey, string>, sources: ContinuitySources, references: MediaReference[]) {
  const sourceId = sources[key]
  const source = sourceId ? references.find((ref) => ref.id === sourceId) : undefined
  const missing = Boolean(sourceId && !source)
  const active = locks[key] && !missing && Boolean(values[key]?.trim() || source)
  return { source, missing, active }
}

export function ContinuityPanel({
  enabled,
  onToggleEnabled,
  locks,
  onToggleLock,
  values,
  onChangeValue,
  sources,
  onChangeSource,
  references,
}: ContinuityPanelProps) {
  const activeCount = CONTINUITY_LOCKS.filter((item) => continuityChannelState(item.key, locks, values, sources, references).active).length
  return (
    <section aria-label="Continuity locks" className="space-y-2 rounded-xl border border-gold-400/[0.12] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-medium text-[#d6d0c0]">Continuity locks</p>
          <p className="text-[11.5px] text-[#B0B8C4]" aria-live="polite">
            {enabled ? `${activeCount} active · kept for every shot until you change them` : "Off · your saved locks are kept, not used"}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleEnabled}
          aria-pressed={enabled}
          className={`h-8 shrink-0 rounded-full border px-3 text-[11px] font-medium transition ${
            enabled
              ? "border-gold-300/40 bg-gold-500/15 text-gold-100"
              : "border-gold-400/[0.12] bg-white/5 text-white/70 hover:bg-gold-400/[0.08]"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </div>
      <div className={`grid gap-2.5 ${enabled ? "" : "opacity-50"}`}>
        {CONTINUITY_LOCKS.map((item) => {
          const { source, missing, active } = continuityChannelState(item.key, locks, values, sources, references)
          const locked = locks[item.key]
          const options = references.filter((ref) => ref.mediaType === "image")
          return (
            <div key={item.key} className="grid gap-1.5 sm:grid-cols-[112px_1fr] sm:items-start">
              <button
                type="button"
                onClick={() => onToggleLock(item.key)}
                aria-pressed={locked}
                disabled={!enabled}
                className={`flex h-9 items-center justify-between gap-1.5 rounded-lg border px-2.5 text-[12px] transition ${
                  active
                    ? "border-gold-300/60 bg-gold-500/15 text-gold-50"
                    : locked
                      ? "border-dashed border-gold-400/35 bg-white/[0.03] text-gold-100/90"
                      : "border-gold-400/[0.12] bg-white/5 text-white/70 hover:bg-gold-400/[0.08]"
                }`}
              >
                {item.label}
                <span className={`size-1.5 rounded-full ${active ? "bg-gold-300 shadow-[0_0_8px_rgba(217,192,138,0.9)]" : "bg-white/20"}`} aria-hidden />
                <span className="sr-only">{active ? "active" : locked ? "locked but empty" : "off"}</span>
              </button>
              <div className="min-w-0 space-y-1.5">
                <div className="flex gap-1.5">
                  <Input
                    value={values[item.key]}
                    onChange={(event) => onChangeValue(item.key, event.target.value)}
                    placeholder={source ? "Optional note" : `Describe the ${item.label.toLowerCase()} to keep`}
                    aria-label={`${item.label} lock description`}
                    disabled={!enabled || !locked}
                    className="h-9 min-w-0 flex-1 rounded-lg border-gold-400/[0.12] bg-white/5 text-[12px] text-white placeholder:text-white/40 disabled:opacity-45"
                  />
                  <label className="relative">
                    <span className="sr-only">{item.label} reference</span>
                    <select
                      value={missing ? "" : sources[item.key]}
                      onChange={(event) => onChangeSource(item.key, event.target.value)}
                      disabled={!enabled || !locked || options.length === 0}
                      title={options.length === 0 ? "Add an image reference to lock this to it" : "Lock to a reference"}
                      className="h-9 w-[104px] appearance-none rounded-lg border border-gold-400/[0.12] bg-white/5 pl-7 pr-2 text-[11.5px] text-white disabled:opacity-45 [color-scheme:dark]"
                    >
                      <option value="">No image</option>
                      {options.map((ref) => (
                        <option key={ref.id} value={ref.id}>{ref.label} {ref.name.slice(0, 24)}</option>
                      ))}
                    </select>
                    <ImagePlus className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-gold-300/80" aria-hidden />
                  </label>
                </div>
                {source && locked ? (
                  <p className="text-[11.5px] text-gold-100/85">
                    Locked to {source.label} · {referenceRoles(source).join(" + ")}
                    {!source.applied ? <span className="text-[#B0B8C4]"> · not applied, its direction is still used here</span> : null}
                  </p>
                ) : null}
                {missing && locked ? (
                  <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-amber-300/25 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-100">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span className="flex-1">The image this lock used was removed, so it&rsquo;s not being applied. Pick another or clear it.</span>
                    <button type="button" onClick={() => onChangeSource(item.key, "")} className="shrink-0 text-amber-50 underline underline-offset-2" aria-label={`Clear ${item.label} reference`}>
                      <X className="size-3.5" />
                    </button>
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Reference roles held by continuity locks: role → id of the reference that owns it. */
export function lockedRoleOwners(
  enabled: boolean,
  locks: Record<ContinuityKey, boolean>,
  sources: ContinuitySources,
  references: MediaReference[]
): Record<string, string> {
  if (!enabled) return {}
  const owners: Record<string, string> = {}
  for (const item of CONTINUITY_LOCKS) {
    const id = sources[item.key]
    if (item.role && locks[item.key] && id && references.some((ref) => ref.id === id)) owners[item.role] = id
  }
  return owners
}

/** What a lock says in text, including the reference it is tied to. */
function lockText(item: ContinuityLockDef, value: string, source?: MediaReference) {
  const note = value.trim()
  if (!source) return note
  const direction = source.analysis?.guidance || source.manualGuidance?.trim() || source.name.replace(/\.[a-z0-9]{2,5}$/i, "")
  return `match ${source.label ?? "the reference"} (${direction.slice(0, 160)})${note ? `; ${note}` : ""}`
}

export function buildContinuityClauseFromState(
  enabled: boolean,
  locks: Record<ContinuityKey, boolean>,
  values: Record<ContinuityKey, string>,
  sources: ContinuitySources = EMPTY_CONTINUITY_SOURCES,
  references: MediaReference[] = []
): string {
  if (!enabled) return ""
  const parts = CONTINUITY_LOCKS.flatMap((item) => {
    const { source, active } = continuityChannelState(item.key, locks, values, sources, references)
    // Empty or missing channels are not active locks and add nothing.
    return active ? [`${item.label.toLowerCase()}: ${lockText(item, values[item.key] ?? "", source)}`] : []
  })
  if (parts.length === 0) return ""
  return `continuity locks -> ${parts.join(", ")}`
}

/** Values to store server-side: a reference-backed lock keeps a readable description of its image. */
export function continuityValuesForStorage(
  locks: Record<ContinuityKey, boolean>,
  values: Record<ContinuityKey, string>,
  sources: ContinuitySources,
  references: MediaReference[]
): Record<ContinuityKey, string> {
  const out = { ...values }
  for (const item of CONTINUITY_LOCKS) {
    const { source } = continuityChannelState(item.key, locks, values, sources, references)
    if (source) out[item.key] = lockText(item, values[item.key] ?? "", source).slice(0, 500)
  }
  return out
}

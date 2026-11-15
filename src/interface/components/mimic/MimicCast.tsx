"use client"

import { useState, type CSSProperties } from "react"
import { Box, ImagePlus, Loader2, User, X } from "@/interface/components/ui/icons"
import { MAX_MIMIC_CHANGE_CHARS, MAX_MIMIC_TARGET_CHARS, MIMIC_CAPABILITY, type MimicAssignment } from "@/core/services/mimic"
import styles from "./mimic.module.css"

/** Each change keeps one colour, on its card and in the call sheet, so several stay easy to tell apart. */
export const CAST_COLOURS = ["#e3cf9f", "#8fd1b9", "#9db7ff", "#f0a6a6", "#c9a7f5", "#f2c48d"]
export const castColour = (index: number) => CAST_COLOURS[index % CAST_COLOURS.length]

/**
 * One change: who or what in the take, what it becomes, and the reference images that show it. Editing
 * a card changes only that card; removing it removes the change, never anything from the footage.
 */
export function MimicCastCard({ assignment: a, index, held, uploading, onChange, onRemove, onAddImages }: {
  assignment: MimicAssignment
  index: number
  /** Saved but not sent in this beta (one change per take). */
  held: boolean
  uploading: boolean
  onChange: (patch: Partial<MimicAssignment>) => void
  onRemove: () => void
  onAddImages: (files: File[]) => void
}) {
  const [over, setOver] = useState(false)
  const colour = castColour(index)
  const room = MIMIC_CAPABILITY.subjectMaxImages - a.referenceUrls.length
  const person = a.targetType === "person"
  const field = "h-9 w-full min-w-0 rounded-xl border border-white/10 bg-black/40 px-3 text-[13px] text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"

  return (
    <li className={`${styles.castCard} ${styles.rise} ${held ? styles.castDim : ""} p-3.5 pl-4`} style={{ "--cast": colour } as CSSProperties} data-testid="mimic-assignment">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-[#1a160e]" style={{ background: colour }}>{index + 1}</span>
        <div role="radiogroup" aria-label="Person or object" className="flex rounded-full border border-white/10 bg-black/30 p-0.5 text-[11px]">
          {([["person", "Person", User], ["object", "Object", Box]] as const).map(([value, text, Icon]) => (
            <button key={value} type="button" role="radio" aria-checked={a.targetType === value} onClick={() => onChange({ targetType: value })}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${a.targetType === value ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}>
              <Icon className="size-3" aria-hidden />{text}
            </button>
          ))}
        </div>
        <button type="button" aria-label={`Remove change ${index + 1}`} title="Removes this change. Nothing is removed from your footage." onClick={onRemove} className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/5 hover:text-white"><X size={15} /></button>
      </div>

      {held && <p className="mt-2 text-[11px] text-white/50" title="This beta sends one change per take.">Saved · not sent in this beta (one change per take)</p>}

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.8fr)] sm:items-end">
        <label className="block min-w-0 text-[10px] uppercase tracking-[0.14em] text-white/45">In your take
          <input className={`${field} mt-1 normal-case tracking-normal`} placeholder={person ? "the man on the left, grey hoodie" : "the bottle on the table"} value={a.target} maxLength={MAX_MIMIC_TARGET_CHARS} onChange={e => onChange({ target: e.target.value })} />
        </label>
        <span className="hidden pb-2 text-lg leading-none sm:block" style={{ color: colour }} aria-hidden>→</span>
        <label className="block min-w-0 text-[10px] uppercase tracking-[0.14em] text-white/45">Becomes
          <input className={`${field} mt-1 normal-case tracking-normal`} placeholder={person ? "Sam" : "My product"} value={a.label} maxLength={60} onChange={e => onChange({ label: e.target.value })} />
        </label>
      </div>

      <div
        className={`${styles.refTray} ${over ? styles.refTrayActive : ""} mt-3 flex flex-wrap items-center gap-2 p-2`}
        onDragOver={e => { if (room > 0 && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setOver(true) } }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/")).slice(0, room); if (files.length) onAddImages(files) }}
      >
        {a.referenceUrls.map((url, i) => (
          <span key={url} className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Reference ${i + 1} for change ${index + 1}`} className="size-16 rounded-lg object-cover ring-1 ring-white/10" />
            <button type="button" aria-label={`Remove reference ${i + 1}`} onClick={() => onChange({ referenceUrls: a.referenceUrls.filter(x => x !== url) })}
              className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-black text-white opacity-90 ring-1 ring-white/30 hover:opacity-100"><X size={11} /></button>
          </span>
        ))}
        {room > 0 && (
          <label className="grid size-16 cursor-pointer place-items-center rounded-lg border border-white/10 bg-black/30 text-gold-100 transition-colors hover:border-gold-300/50 hover:bg-gold-500/[0.06]">
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            <span className="sr-only">Add reference images</span>
            <input type="file" accept="image/*,.heic,.heif" multiple hidden disabled={uploading} onChange={e => { const files = [...(e.target.files ?? [])].slice(0, room); e.target.value = ""; if (files.length) onAddImages(files) }} />
          </label>
        )}
        <p className="min-w-[10rem] flex-1 px-1 text-[11px] leading-snug text-white/45">
          {a.referenceUrls.length
            ? `${a.referenceUrls.length} of ${MIMIC_CAPABILITY.subjectMaxImages}${a.referenceUrls.length === 1 && person ? " · add another angle of the same person for a closer match" : ""}`
            : `Drop 1–${MIMIC_CAPABILITY.subjectMaxImages} images here${person ? ": a clear face, then other angles" : ": the product on a plain background works best"}`}
        </p>
      </div>

      <input aria-label={`Extra direction for change ${index + 1}`} placeholder="Optional direction for this change only" value={a.instructions} maxLength={MAX_MIMIC_CHANGE_CHARS}
        onChange={e => onChange({ instructions: e.target.value })} className={`${field} mt-2`} />
    </li>
  )
}

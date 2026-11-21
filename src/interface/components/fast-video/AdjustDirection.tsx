"use client"

import { useEffect, useId, useRef, useState } from "react"

export type AdjustRequest = { direction: string; shotNumbers?: number[]; keepWork: boolean }

/**
 * "Adjust production direction" (Keep Progress Steps 4 and 5). From a shot it applies to that shot
 * only by default; "Whole film" re-plans every shot. Before a re-plan that could touch work already
 * made, it asks "Keep everything I have made?" with Keep as the default. Takes are never deleted.
 */
export function AdjustDirection({ shots, focusShot, hasWork, disabled, onSubmit, openAt }: {
  /** The film's shot titles in order. */
  shots: string[]
  /** The shot the creator is looking at (1-based); the panel starts on "This shot only" for it. */
  focusShot: number | null
  /** The film already has a shot workspace (Takes may exist), so a re-plan asks before changing approvals. */
  hasWork: boolean
  disabled?: boolean
  onSubmit: (request: AdjustRequest) => Promise<void>
  /** Opened from a shot's own "Re-plan this shot" button. */
  openAt?: { shot: number; nonce: number } | null
}) {
  const panel = useRef<HTMLDetailsElement>(null)
  const id = useId()
  const [scope, setScope] = useState<"shot" | "film">("shot")
  // Follows the shot the creator is looking at until they pick one here (or a shot card opens it).
  const [pickedShot, setPickedShot] = useState<number | null>(null)
  const shot = clampShot(pickedShot ?? focusShot, shots.length)
  const [direction, setDirection] = useState("")
  const [asking, setAsking] = useState(false)
  const [open, setOpen] = useState(false)

  // A shot card's "Re-plan this shot": open on that shot (state adjusted while rendering, once per click).
  const [seenOpen, setSeenOpen] = useState<number | null>(null)
  if (openAt && openAt.nonce !== seenOpen) {
    setSeenOpen(openAt.nonce)
    setScope("shot")
    setPickedShot(openAt.shot)
    setOpen(true)
  }
  useEffect(() => {
    if (!openAt) return
    panel.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    panel.current?.querySelector("textarea")?.focus({ preventScroll: true })
  }, [openAt])

  const ready = direction.trim().length >= 8 && !disabled
  const title = shots[shot - 1] ?? ""
  const wholeFilm = scope === "film" || shots.length < 2
  const send = async (keepWork: boolean) => {
    setAsking(false)
    await onSubmit({ direction: direction.trim(), keepWork, ...(wholeFilm ? {} : { shotNumbers: [shot] }) })
    setDirection("")
  }

  return (
    <details ref={panel} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="mt-4 rounded-xl border border-line p-3" data-testid="adjust-direction">
      <summary className="cursor-pointer text-xs text-white/55">Adjust production direction</summary>
      <div role="radiogroup" aria-label="What to re-plan" className="mt-3 flex flex-wrap gap-2 text-xs">
        {shots.length >= 2 && (
          <button type="button" role="radio" aria-checked={scope === "shot"} onClick={() => setScope("shot")} className={`rounded-full border px-3 py-1.5 ${scope === "shot" ? "border-gold-300/60 bg-gold-400/10 text-gold-50" : "border-line text-white/60 hover:text-white"}`}>
            This shot only
          </button>
        )}
        <button type="button" role="radio" aria-checked={wholeFilm} onClick={() => setScope("film")} className={`rounded-full border px-3 py-1.5 ${wholeFilm ? "border-gold-300/60 bg-gold-400/10 text-gold-50" : "border-line text-white/60 hover:text-white"}`}>
          Whole film
        </button>
      </div>
      {!wholeFilm ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor={`${id}-shot`} className="text-white/60">Shot</label>
          <select id={`${id}-shot`} value={shot} onChange={(e) => setPickedShot(Number(e.target.value))} className="max-w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-white">
            {shots.map((name, index) => <option key={index} value={index + 1}>{index + 1}. {name}</option>)}
          </select>
          <p className="basis-full text-gold-200/90" data-testid="adjust-scope-label">Applies to this shot only: shot {shot}{title ? `, “${title}”` : ""}. Every other shot keeps its plan, prompt, Takes and locked media.</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-amber-100/90" data-testid="adjust-scope-label">Applies to the whole film: the crew re-plans every shot. Your shots, Takes and locked media are kept and updated in place.</p>
      )}
      <textarea
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        maxLength={2000}
        aria-label="What should change"
        placeholder={wholeFilm ? "Describe what should change across the film..." : "Describe only what should change in this shot..."}
        className="mt-3 min-h-20 w-full rounded-lg border border-line bg-black/30 p-3 text-sm text-white placeholder:text-white/30"
      />
      {asking ? (
        <div role="alertdialog" aria-labelledby={`${id}-keep`} className="mt-3 rounded-lg border border-gold-300/30 bg-gold-300/[0.05] p-3 text-xs text-white/75">
          <p id={`${id}-keep`} className="text-sm font-medium text-white">Keep everything I have made?</p>
          <p className="mt-1">Keep: {wholeFilm ? "every shot" : `shot ${shot}`} keeps its Takes and its approved take after the re-plan. Don&apos;t keep: {wholeFilm ? "re-planned shots lose" : "this shot loses"} its approved take so you can choose again. Takes are never deleted either way.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" autoFocus disabled={disabled} onClick={() => void send(true)} className="rounded-full bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 px-4 py-1.5 text-xs font-medium text-black disabled:opacity-40">Keep</button>
            <button type="button" disabled={disabled} onClick={() => void send(false)} className="rounded-full border border-amber-300/40 px-4 py-1.5 text-xs text-amber-100 disabled:opacity-40">Don&apos;t keep approvals</button>
            <button type="button" onClick={() => setAsking(false)} className="rounded-full px-3 py-1.5 text-xs text-white/55 hover:text-white">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!ready} onClick={() => { if (wholeFilm || hasWork) setAsking(true); else void send(true) }} className="mt-3 rounded-full border border-gold-400/20 px-4 py-2 text-xs text-white disabled:opacity-40">
          {wholeFilm ? "Re-plan the whole film" : `Re-plan shot ${shot}`}
        </button>
      )}
    </details>
  )
}

function clampShot(value: number | null, count: number) {
  if (!count) return 1
  return Math.min(Math.max(1, value ?? 1), count)
}

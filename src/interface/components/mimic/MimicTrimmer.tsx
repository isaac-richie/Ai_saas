"use client"

import { useEffect, useRef } from "react"
import styles from "./mimic.module.css"

const FRAMES = 10
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/**
 * The part of the take that is transformed: a filmstrip of the take with an in and an out handle. The
 * handles are native range inputs, so arrow keys and screen readers work; the window turns amber when
 * the selection is outside what the model accepts.
 */
export function MimicTrimmer({ src, durationMs, startMs, endMs, minMs, maxMs, playheadMs, disabled, onChange }: {
  src: string
  durationMs: number
  startMs: number
  endMs: number
  minMs: number
  maxMs: number
  playheadMs?: number | null
  disabled?: boolean
  onChange: (startMs: number, endMs: number) => void
}) {
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])

  // Draw a filmstrip by seeking a hidden copy of the take. Display only; nothing is read back.
  useEffect(() => {
    let cancelled = false
    const video = document.createElement("video")
    video.muted = true
    video.preload = "auto"
    video.playsInline = true
    video.src = src
    const seek = (t: number) => new Promise<void>((resolve) => {
      const done = () => { video.removeEventListener("seeked", done); resolve() }
      video.addEventListener("seeked", done)
      video.currentTime = t
    })
    const draw = async () => {
      for (let i = 0; i < FRAMES && !cancelled; i++) {
        await seek(Math.min(video.duration - 0.05, ((i + 0.5) / FRAMES) * video.duration))
        const canvas = canvases.current[i]
        const ctx = canvas?.getContext("2d")
        if (!canvas || !ctx || cancelled) continue
        const ratio = video.videoWidth / video.videoHeight || 16 / 9
        canvas.height = 112
        canvas.width = Math.round(112 * ratio)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      }
    }
    const start = () => { void draw().catch(() => undefined) }
    video.addEventListener("loadeddata", start, { once: true })
    return () => { cancelled = true; video.removeAttribute("src"); video.load() }
  }, [src])

  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / durationMs) * 100))}%`
  const length = endMs - startMs
  const ok = length >= minMs && length <= maxMs
  const step = 100

  return (
    <div className="space-y-2" data-testid="mimic-trimmer">
      <div className={styles.strip}>
        <div className={styles.stripFrames} aria-hidden>
          {Array.from({ length: FRAMES }, (_, i) => <canvas key={i} ref={el => { canvases.current[i] = el }} />)}
        </div>
        <div className={styles.stripShade} style={{ left: 0, width: pct(startMs) }} aria-hidden />
        <div className={styles.stripShade} style={{ left: pct(endMs), right: 0 }} aria-hidden />
        <div className={`${styles.stripWindow} ${ok ? "" : styles.stripWindowBad}`} style={{ left: pct(startMs), width: `calc(${pct(endMs)} - ${pct(startMs)})` }} aria-hidden />
        {playheadMs != null && playheadMs >= 0 && <div className={styles.stripPlayhead} style={{ left: pct(playheadMs) }} aria-hidden />}
        <input type="range" className={styles.stripRange} aria-label="Start of the selection" min={0} max={durationMs} step={step} value={startMs} disabled={disabled}
          onChange={e => onChange(Math.min(Number(e.target.value), endMs - step), endMs)} />
        <input type="range" className={styles.stripRange} aria-label="End of the selection" min={0} max={durationMs} step={step} value={endMs} disabled={disabled}
          onChange={e => onChange(startMs, Math.max(Number(e.target.value), startMs + step))} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums">
        <span className="text-white/55">In {sec(startMs)} · Out {sec(endMs)}</span>
        <span className={ok ? "text-[#8fd1b9]" : "text-amber-200"}>
          {sec(length)} selected · model takes {sec(minMs)}–{sec(maxMs)}
        </span>
      </div>
    </div>
  )
}

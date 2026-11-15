"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Columns2, Pause, Play, Volume2, VolumeX } from "lucide-react"
import styles from "./mimic.module.css"

type Mode = "wipe" | "side" | "result"

/**
 * Original and result, played together. Wipe drags the result across the original; side by side shows
 * both; result shows the new take alone. Both videos follow one transport so frames stay comparable.
 */
export function MimicCompare({ originalUrl, resultUrl }: { originalUrl: string; resultUrl: string }) {
  const [mode, setMode] = useState<Mode>("wipe")
  const [split, setSplit] = useState(50)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const original = useRef<HTMLVideoElement>(null)
  const result = useRef<HTMLVideoElement>(null)

  // The result leads; the original follows it whenever they drift apart.
  useEffect(() => {
    const lead = result.current
    if (!lead) return
    const sync = () => {
      setTime(lead.currentTime)
      const follow = original.current
      if (follow && Math.abs(follow.currentTime - lead.currentTime) > 0.12) follow.currentTime = lead.currentTime
    }
    const meta = () => setDuration(lead.duration || 0)
    const ended = () => setPlaying(false)
    lead.addEventListener("timeupdate", sync)
    lead.addEventListener("loadedmetadata", meta)
    lead.addEventListener("ended", ended)
    return () => { lead.removeEventListener("timeupdate", sync); lead.removeEventListener("loadedmetadata", meta); lead.removeEventListener("ended", ended) }
  }, [resultUrl, mode])

  function toggle() {
    const lead = result.current
    const follow = original.current
    if (!lead) return
    if (lead.paused) {
      if (lead.ended) { lead.currentTime = 0; if (follow) follow.currentTime = 0 }
      void lead.play().catch(() => undefined)
      void follow?.play().catch(() => undefined)
      setPlaying(true)
    } else {
      lead.pause()
      follow?.pause()
      setPlaying(false)
    }
  }
  function seek(t: number) {
    if (result.current) result.current.currentTime = t
    if (original.current) original.current.currentTime = t
    setTime(t)
  }

  const label = "pointer-events-none absolute top-3 z-[6] rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]"

  return (
    <div className="space-y-3" data-testid="mimic-compare">
      <div className={`grid gap-3 ${mode === "side" ? "sm:grid-cols-2" : ""}`}>
        <div className={`${styles.monitor} aspect-video ${mode === "result" ? "hidden" : ""}`} style={mode === "wipe" ? ({ "--split": `${split}%` } as CSSProperties) : undefined}>
          <video ref={original} src={originalUrl} muted playsInline preload="auto" className="absolute inset-0 size-full object-contain" aria-label="Original take" />
          <span className={`${label} left-4 text-white/85`}>Original · unchanged</span>
          {mode === "wipe" && (
            <>
              <div className={styles.wipeTop}>
                <video ref={result} src={resultUrl} muted={muted} playsInline preload="auto" className="absolute inset-0 size-full object-contain" aria-label="Result" />
              </div>
              <span className={`${label} right-4 text-gold-100`}>Result</span>
              <div className={styles.wipeHandle} aria-hidden />
              <input type="range" min={0} max={100} step={0.5} value={split} onChange={e => setSplit(Number(e.target.value))} aria-label="Wipe between original and result" className={styles.wipeRange} />
            </>
          )}
        </div>
        {mode !== "wipe" && (
          <div className={`${styles.monitor} aspect-video`}>
            <video ref={result} src={resultUrl} muted={muted} playsInline preload="auto" className="absolute inset-0 size-full object-contain" aria-label="Result" />
            <span className={`${label} left-4 text-gold-100`}>Result · a new take</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15">
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-px" aria-hidden />}
        </button>
        <input type="range" min={0} max={duration || 0} step={0.04} value={Math.min(time, duration || 0)} onChange={e => seek(Number(e.target.value))} aria-label="Position" className="h-1 min-w-[8rem] flex-1 accent-[#e3cf9f]" />
        <span className="w-20 text-right text-[11px] tabular-nums text-white/55">{time.toFixed(1)} / {duration.toFixed(1)} s</span>
        <button type="button" onClick={() => setMuted(m => !m)} aria-label={muted ? "Unmute result" : "Mute result"} className="grid size-9 place-items-center rounded-full border border-white/10 text-white/70 hover:text-white">
          {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
        </button>
        <div role="radiogroup" aria-label="Compare view" className="flex rounded-full border border-white/10 bg-black/30 p-0.5 text-[11px]">
          {([["wipe", "Wipe"], ["side", "Side by side"], ["result", "Result"]] as const).map(([id, text]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => { setMode(id); setPlaying(false) }}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition-colors ${mode === id ? "bg-gold-200 font-medium text-[#1a160e]" : "text-white/65 hover:text-white"}`}>
              {id === "side" && <Columns2 className="size-3" aria-hidden />}{text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

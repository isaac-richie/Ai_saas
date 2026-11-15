"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Check, Grid3x3, Mic, RotateCcw, Upload, User } from "lucide-react"
import styles from "./mimic.module.css"

/** Recording stops by itself here: the longest take the model accepts. */
export const MAX_RECORD_MS = 15_000
const MIN_RECORD_MS = 3_000
const COUNTDOWN = 3
const RING = 2 * Math.PI * 35

type Phase = "idle" | "starting" | "preview" | "countdown" | "recording" | "review" | "denied" | "unsupported"

/** The recording format this browser can make, best first. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null
  return ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type)) ?? null
}

const clock = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`
}

/**
 * Records one take with the device's camera and microphone. Nothing leaves the device until the creator
 * chooses "Use this take"; the preview shown is the plain camera, not a transformed picture.
 */
export function MimicRecorder({ onUse, onUploadInstead, disabled }: { onUse: (file: File) => void; onUploadInstead: () => void; disabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState("")
  const [micId, setMicId] = useState("")
  const [count, setCount] = useState(COUNTDOWN)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [level, setLevel] = useState(0)
  const [mirror, setMirror] = useState(true)
  const [guides, setGuides] = useState<{ thirds: boolean; person: boolean }>({ thirds: false, person: true })
  const [take, setTake] = useState<{ url: string; blob: Blob; ms: number } | null>(null)
  const [note, setNote] = useState("")
  const live = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const timers = useRef<number[]>([])
  const audio = useRef<{ ctx: AudioContext; frame: number } | null>(null)

  const clearTimers = () => { timers.current.forEach(id => { window.clearInterval(id); window.clearTimeout(id) }); timers.current = [] }
  const stopMeter = useCallback(() => {
    if (!audio.current) return
    cancelAnimationFrame(audio.current.frame)
    void audio.current.ctx.close().catch(() => undefined)
    audio.current = null
    setLevel(0)
  }, [])
  const stopStream = useCallback(() => {
    stopMeter()
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    if (live.current) live.current.srcObject = null
  }, [stopMeter])

  // The camera and microphone are released when the recorder leaves the page.
  useEffect(() => () => {
    clearTimers()
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop()
    stopStream()
  }, [stopStream])
  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url) }, [take])

  /** A live microphone level, so the creator can see they are being heard before recording. */
  function startMeter(media: MediaStream) {
    stopMeter()
    if (!media.getAudioTracks().length) return
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    try {
      const ctx = new Ctx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(media).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      let last = 0
      const tick = (now: number) => {
        if (!audio.current) return
        if (now - last > 60) {
          last = now
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (const v of data) sum += ((v - 128) / 128) ** 2
          setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
        }
        audio.current.frame = requestAnimationFrame(tick)
      }
      audio.current = { ctx, frame: requestAnimationFrame(tick) }
    } catch { /* No meter; recording still works. */ }
  }

  async function open(camera = cameraId, mic = micId) {
    if (!navigator.mediaDevices?.getUserMedia || !pickMimeType()) { setPhase("unsupported"); return }
    setPhase("starting")
    setNote("")
    stopStream()
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { ...(camera ? { deviceId: { exact: camera } } : { facingMode: "user" }), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: mic ? { deviceId: { exact: mic }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
      })
      stream.current = media
      if (live.current) { live.current.srcObject = media; void live.current.play().catch(() => undefined) }
      startMeter(media)
      // Device names are only readable once permission has been given.
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      setCameras(devices.filter(d => d.kind === "videoinput"))
      setMics(devices.filter(d => d.kind === "audioinput"))
      const videoTrack = media.getVideoTracks()[0]
      setCameraId(videoTrack?.getSettings().deviceId ?? camera)
      setMicId(media.getAudioTracks()[0]?.getSettings().deviceId ?? mic)
      // A rear camera isn't mirrored; a front camera is, like a mirror.
      setMirror(videoTrack?.getSettings().facingMode !== "environment")
      setPhase("preview")
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : ""
      setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported")
    }
  }

  function begin() {
    if (!stream.current) return
    setCount(COUNTDOWN)
    setPhase("countdown")
    let left = COUNTDOWN
    const tick = window.setInterval(() => {
      left -= 1
      setCount(left)
      if (left <= 0) { window.clearInterval(tick); record() }
    }, 1000)
    timers.current.push(tick)
  }

  function record() {
    const media = stream.current
    const mimeType = pickMimeType()
    if (!media || !mimeType) { setPhase("unsupported"); return }
    const chunks: Blob[] = []
    const started = performance.now()
    let made: MediaRecorder
    try { made = new MediaRecorder(media, { mimeType, videoBitsPerSecond: 6_000_000 }) } catch { setPhase("unsupported"); return }
    recorder.current = made
    made.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    made.onstop = () => {
      clearTimers()
      const ms = Math.round(performance.now() - started)
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] })
      if (!blob.size) { setNote("Nothing was recorded. Try again."); setPhase("preview"); return }
      if (ms < MIN_RECORD_MS) { setNote(`That take was ${(ms / 1000).toFixed(1)} seconds. Record at least ${MIN_RECORD_MS / 1000} seconds.`); setPhase("preview"); return }
      setTake({ url: URL.createObjectURL(blob), blob, ms })
      setPhase("review")
    }
    made.start(500)
    setElapsedMs(0)
    setPhase("recording")
    timers.current.push(window.setInterval(() => setElapsedMs(Math.round(performance.now() - started)), 100))
    timers.current.push(window.setTimeout(() => { if (made.state !== "inactive") made.stop() }, MAX_RECORD_MS))
  }

  const stop = () => { if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop() }
  const retake = () => { setTake(null); setNote(""); if (stream.current) setPhase("preview"); else void open() }
  function use() {
    if (!take) return
    const ext = take.blob.type === "video/mp4" ? "mp4" : "webm"
    stopStream()
    onUse(new File([take.blob], `Mimic take ${new Date().toISOString().slice(0, 16).replace("T", " ")}.${ext}`, { type: take.blob.type }))
  }

  if (phase === "denied" || phase === "unsupported") {
    return (
      <div className={`${styles.monitor} grid aspect-video place-items-center p-6 text-center`} data-testid="mimic-recorder-fallback">
        <div className="relative z-10 max-w-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-white/10 bg-white/[0.04]"><Camera className="size-5 text-white/60" aria-hidden /></span>
          <p className="mt-3 text-[15px] text-white">{phase === "denied" ? "Camera or microphone access was not allowed." : "This browser can't record video here."}</p>
          <p className="mt-1 text-sm text-white/55">{phase === "denied" ? "Allow access in your browser's site settings and try again, or upload a video you already have." : "Upload a video you already have instead."}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onUploadInstead} className={`${styles.goldButton} flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium`}><Upload className="size-4" aria-hidden />Upload a video instead</button>
            {phase === "denied" && <button type="button" onClick={() => void open()} className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5">Try again</button>}
          </div>
        </div>
      </div>
    )
  }

  const isLive = phase === "preview" || phase === "countdown" || phase === "recording"
  const remaining = 1 - Math.min(1, elapsedMs / MAX_RECORD_MS)
  const bars = 14

  return (
    <div className="space-y-3" data-testid="mimic-recorder">
      <div className={`${styles.monitor} ${phase === "recording" ? styles.monitorRec : ""} aspect-video`}>
        {phase === "review" && take ? (
          <video key={take.url} src={take.url} controls playsInline autoPlay className="absolute inset-0 size-full object-contain" aria-label="Your take" />
        ) : (
          <video ref={live} muted playsInline aria-label="Camera preview"
            className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${mirror ? "-scale-x-100" : ""} ${isLive ? "opacity-100" : "opacity-0"}`} />
        )}
        <div className={styles.scanline} aria-hidden />
        {isLive && guides.thirds && <div className={styles.thirds} aria-hidden />}
        {isLive && guides.person && phase !== "recording" && <div className={styles.silhouette} aria-hidden />}

        {phase === "idle" && (
          <div className="absolute inset-0 z-10 grid place-items-center p-6 text-center">
            <div>
              <p className={`${styles.serif} text-2xl text-gold-100 sm:text-3xl`}>Your stage is ready.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-white/60">Stand back so your head, shoulders and hands are in frame. Good light on your face helps most.</p>
              <button type="button" disabled={disabled} onClick={() => void open()} className={`${styles.goldButton} mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium`}>
                <Camera className="size-4" aria-hidden />Turn on camera
              </button>
            </div>
          </div>
        )}
        {phase === "starting" && <p className="absolute inset-0 z-10 grid place-items-center text-sm text-white/60">Asking for camera and microphone…</p>}
        {phase === "countdown" && <div className="absolute inset-0 z-10 grid place-items-center bg-black/25"><span key={count} className={styles.countdown} aria-live="assertive">{count}</span></div>}

        {/* Top bar: status, timecode and level, like a camera monitor. */}
        {isLive && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-5 pb-6 pt-4 text-[11px] font-medium tracking-wide text-white/85">
            <span className="flex items-center gap-2">
              {phase === "recording" ? <><span className={styles.recDot} aria-hidden /><span className="text-red-300">REC</span></> : <span className="text-white/60">STANDBY</span>}
              <span className="tabular-nums" role={phase === "recording" ? "timer" : undefined}>{clock(elapsedMs)} / {clock(MAX_RECORD_MS)}</span>
            </span>
            <span className="flex items-center gap-2" aria-label={`Microphone level ${Math.round(level * 100)} percent`}>
              <Mic className="size-3.5 text-white/60" aria-hidden />
              <span className={styles.meter} aria-hidden>
                {Array.from({ length: bars }, (_, i) => <span key={i} style={{ height: `${30 + (i / bars) * 70}%` }} data-on={level * bars > i} data-hot={i >= bars - 3} />)}
              </span>
            </span>
          </div>
        )}
        {phase === "review" && take && (
          <span className="absolute left-5 top-4 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white/80">Playback · {(take.ms / 1000).toFixed(1)} s</span>
        )}
      </div>

      {/* Transport: guides on the left, the record button in the middle, devices on the right. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {isLive && (
            <>
              <button type="button" aria-pressed={guides.person} onClick={() => setGuides(g => ({ ...g, person: !g.person }))} title="Framing guide" className={`grid size-9 place-items-center rounded-full border transition-colors ${guides.person ? "border-gold-300/50 bg-gold-300/10 text-gold-100" : "border-white/10 text-white/55 hover:text-white"}`}><User className="size-4" aria-hidden /><span className="sr-only">Framing guide</span></button>
              <button type="button" aria-pressed={guides.thirds} onClick={() => setGuides(g => ({ ...g, thirds: !g.thirds }))} title="Rule-of-thirds grid" className={`grid size-9 place-items-center rounded-full border transition-colors ${guides.thirds ? "border-gold-300/50 bg-gold-300/10 text-gold-100" : "border-white/10 text-white/55 hover:text-white"}`}><Grid3x3 className="size-4" aria-hidden /><span className="sr-only">Grid</span></button>
              <button type="button" aria-pressed={mirror} onClick={() => setMirror(m => !m)} title="Mirror the preview (the recording is never mirrored)" className={`h-9 rounded-full border px-3 text-[11px] transition-colors ${mirror ? "border-gold-300/50 bg-gold-300/10 text-gold-100" : "border-white/10 text-white/55 hover:text-white"}`}>Mirror</button>
            </>
          )}
        </div>

        <div className="flex items-center justify-center">
          {(phase === "preview" || phase === "countdown" || phase === "recording") && (
            <button type="button" disabled={disabled || phase === "countdown"} onClick={phase === "recording" ? stop : begin}
              className={styles.recordButton} aria-label={phase === "recording" ? "Stop recording" : "Start recording"}>
              <svg className={styles.ring} viewBox="0 0 76 76" width="76" height="76" aria-hidden>
                <circle cx="38" cy="38" r="35" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
                <circle cx="38" cy="38" r="35" fill="none" stroke={phase === "recording" ? "#f87171" : "#e3cf9f"} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={RING} strokeDashoffset={phase === "recording" ? RING * (1 - remaining) : 0} style={{ transition: "stroke-dashoffset 0.1s linear" }} />
              </svg>
              <span className={`${styles.recordCore} ${phase === "recording" ? styles.recordCoreStop : ""}`} />
            </button>
          )}
          {phase === "review" && take && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={retake} className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/85 hover:bg-white/5"><RotateCcw className="size-4" aria-hidden />Retake</button>
              <button type="button" disabled={disabled} onClick={use} className={`${styles.goldButton} flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium`}><Check className="size-4" aria-hidden />Use this take</button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {phase === "preview" && cameras.length > 1 && (
            <select aria-label="Camera" value={cameraId} onChange={e => { setCameraId(e.target.value); void open(e.target.value, micId) }} className="h-9 max-w-[9.5rem] truncate rounded-full border border-white/10 bg-black/40 px-3 text-[11px] text-white">
              {cameras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          )}
          {phase === "preview" && mics.length > 1 && (
            <select aria-label="Microphone" value={micId} onChange={e => { setMicId(e.target.value); void open(cameraId, e.target.value) }} className="h-9 max-w-[9.5rem] truncate rounded-full border border-white/10 bg-black/40 px-3 text-[11px] text-white">
              {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
            </select>
          )}
        </div>
      </div>

      {phase === "preview" && <p className="text-center text-xs text-white/45">A {COUNTDOWN}-second countdown, then up to {MAX_RECORD_MS / 1000} seconds. The preview is your camera as it is; the transformed result comes after generation.</p>}
      {note && <p role="alert" className="text-center text-xs text-amber-200">{note}</p>}
    </div>
  )
}

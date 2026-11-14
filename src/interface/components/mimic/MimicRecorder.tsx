"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Circle, RotateCcw, Square, Video } from "lucide-react"

/** Recording stops by itself here: the longest take the model accepts. */
const MAX_RECORD_MS = 15_000
const MIN_RECORD_MS = 3_000
const COUNTDOWN = 3

type Phase = "idle" | "starting" | "preview" | "countdown" | "recording" | "review" | "denied" | "unsupported"

/** The recording format this browser can make, best first. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null
  return ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type)) ?? null
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
  const [take, setTake] = useState<{ url: string; blob: Blob; ms: number } | null>(null)
  const [note, setNote] = useState("")
  const live = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const timers = useRef<number[]>([])

  const clearTimers = () => { timers.current.forEach(id => { window.clearInterval(id); window.clearTimeout(id) }); timers.current = [] }
  const stopStream = useCallback(() => {
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    if (live.current) live.current.srcObject = null
  }, [])

  // The camera is released when the recorder leaves the page.
  useEffect(() => () => {
    clearTimers()
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop()
    stopStream()
  }, [stopStream])
  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url) }, [take])

  async function open(camera = cameraId, mic = micId) {
    if (!navigator.mediaDevices?.getUserMedia || !pickMimeType()) { setPhase("unsupported"); return }
    setPhase("starting")
    setNote("")
    stopStream()
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { ...(camera ? { deviceId: { exact: camera } } : { facingMode: "user" }), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: mic ? { deviceId: { exact: mic } } : true,
      })
      stream.current = media
      if (live.current) { live.current.srcObject = media; void live.current.play().catch(() => undefined) }
      // Device names are only readable once permission has been given.
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      setCameras(devices.filter(d => d.kind === "videoinput"))
      setMics(devices.filter(d => d.kind === "audioinput"))
      setCameraId(media.getVideoTracks()[0]?.getSettings().deviceId ?? camera)
      setMicId(media.getAudioTracks()[0]?.getSettings().deviceId ?? mic)
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
    timers.current.push(window.setInterval(() => setElapsedMs(Math.round(performance.now() - started)), 200))
    timers.current.push(window.setTimeout(() => { if (made.state !== "inactive") made.stop() }, MAX_RECORD_MS))
  }

  const stop = () => { if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop() }
  const retake = () => { setTake(null); setNote(""); setPhase(stream.current ? "preview" : "idle"); if (!stream.current) void open() }
  function use() {
    if (!take) return
    const ext = take.blob.type === "video/mp4" ? "mp4" : "webm"
    stopStream()
    onUse(new File([take.blob], `Mimic take ${new Date().toISOString().slice(0, 16).replace("T", " ")}.${ext}`, { type: take.blob.type }))
  }

  if (phase === "denied" || phase === "unsupported") {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm" data-testid="mimic-recorder-fallback">
        <p className="text-white">{phase === "denied" ? "Camera or microphone access was not allowed." : "This browser can't record video here."}</p>
        <p className="mt-1 text-white/60">{phase === "denied" ? "Allow access in your browser's site settings and try again, or upload a video you already have." : "Upload a video you already have instead."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onUploadInstead} className="rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 px-4 py-2 text-sm font-medium text-black">Upload a video instead</button>
          {phase === "denied" && <button type="button" onClick={() => void open()} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5">Try again</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="mimic-recorder">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
        {phase === "review" && take ? (
          <video key={take.url} src={take.url} controls playsInline className="size-full object-contain" aria-label="Your take" />
        ) : (
          <video ref={live} muted playsInline className={`size-full -scale-x-100 object-cover ${phase === "idle" || phase === "starting" ? "opacity-0" : ""}`} aria-label="Camera preview" />
        )}
        {phase === "idle" && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div>
              <Video className="mx-auto size-7 text-white/40" aria-hidden />
              <p className="mt-2 text-sm text-white/70">Record your performance with this device&apos;s camera.</p>
              <button type="button" disabled={disabled} onClick={() => void open()} className="mt-3 rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Turn on camera</button>
            </div>
          </div>
        )}
        {phase === "starting" && <p className="absolute inset-0 grid place-items-center text-sm text-white/60">Asking for camera and microphone…</p>}
        {phase === "countdown" && <p className="absolute inset-0 grid place-items-center text-7xl font-light text-white drop-shadow" aria-live="assertive">{count}</p>}
        {phase === "recording" && (
          <p className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white" role="status">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />Recording · {(elapsedMs / 1000).toFixed(1)} / {MAX_RECORD_MS / 1000} s
          </p>
        )}
      </div>

      {(phase === "preview" || phase === "countdown") && (cameras.length > 1 || mics.length > 1) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {cameras.length > 1 && (
            <select aria-label="Camera" value={cameraId} disabled={phase !== "preview"} onChange={e => { setCameraId(e.target.value); void open(e.target.value, micId) }} className="h-9 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white">
              {cameras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          )}
          {mics.length > 1 && (
            <select aria-label="Microphone" value={micId} disabled={phase !== "preview"} onChange={e => { setMicId(e.target.value); void open(cameraId, e.target.value) }} className="h-9 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white">
              {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {phase === "preview" && <button type="button" disabled={disabled} onClick={begin} className="flex items-center gap-2 rounded-xl bg-red-500/90 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40"><Circle className="size-3.5 fill-current" aria-hidden />Record</button>}
        {phase === "recording" && <button type="button" onClick={stop} className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5"><Square className="size-3.5 fill-current" aria-hidden />Stop</button>}
        {phase === "review" && take && (
          <>
            <button type="button" disabled={disabled} onClick={use} className="rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Use this take</button>
            <button type="button" onClick={retake} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"><RotateCcw className="size-3.5" aria-hidden />Retake</button>
            <span className="text-xs text-white/50">{(take.ms / 1000).toFixed(1)} s</span>
          </>
        )}
        {phase === "preview" && <span className="text-xs text-white/50">A {COUNTDOWN}-second countdown, then up to {MAX_RECORD_MS / 1000} seconds. The preview is your camera as it is; the transformed result comes after generation.</span>}
      </div>
      {note && <p role="alert" className="text-xs text-amber-200">{note}</p>}
    </div>
  )
}

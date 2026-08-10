"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/interface/components/ui/button"
import { Camera, SkipForward, SkipBack, Play, Pause } from "lucide-react"
import { toast } from "sonner"

interface ShotPreviewTimelineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  videoUrl: string | null
  isPlaying: boolean
  onCaptureFrame?: (dataUrl: string, timeSeconds: number) => void
  storyboardUrls?: string[]
}

export function ShotPreviewTimeline({
  videoRef,
  videoUrl,
  isPlaying,
  onCaptureFrame,
  storyboardUrls,
}: ShotPreviewTimelineProps) {
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [sequenceMode, setSequenceMode] = useState(false)
  const [sequenceIndex, setSequenceIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const wasPlayingRef = useRef(false)

  useEffect(() => {
    const node = videoRef.current
    if (!node) return

    const onTime = () => {
      if (!scrubbingRef.current) setCurrentTime(node.currentTime)
    }
    const onMeta = () => setDuration(node.duration || 0)
    const onDurationChange = () => {
      if (node.duration && isFinite(node.duration)) setDuration(node.duration)
    }

    node.addEventListener("timeupdate", onTime)
    node.addEventListener("loadedmetadata", onMeta)
    node.addEventListener("durationchange", onDurationChange)
    if (node.duration && isFinite(node.duration)) setDuration(node.duration)

    return () => {
      node.removeEventListener("timeupdate", onTime)
      node.removeEventListener("loadedmetadata", onMeta)
      node.removeEventListener("durationchange", onDurationChange)
    }
  }, [videoRef])

  const seekTo = useCallback((fraction: number) => {
    const node = videoRef.current
    if (!node || !duration || !isFinite(duration)) return
    const t = Math.max(0, Math.min(duration, fraction * duration))
    node.currentTime = t
    setCurrentTime(t)
  }, [videoRef, duration])

  const handleTrackInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seekTo(fraction)
  }, [seekTo])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = videoRef.current
    if (!node) return

    wasPlayingRef.current = !node.paused
    node.pause()
    scrubbingRef.current = true
    handleTrackInteraction(e)

    const onMove = (ev: MouseEvent) => handleTrackInteraction(ev)
    const onUp = () => {
      scrubbingRef.current = false
      if (wasPlayingRef.current && node) {
        void node.play().catch(() => null)
      }
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [handleTrackInteraction, videoRef])

  const captureFrame = useCallback(() => {
    const node = videoRef.current
    if (!node) return

    const canvas = document.createElement("canvas")
    canvas.width = node.videoWidth
    canvas.height = node.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    try {
      ctx.drawImage(node, 0, 0)
      const dataUrl = canvas.toDataURL("image/png")

      if (onCaptureFrame) {
        onCaptureFrame(dataUrl, node.currentTime)
      } else {
        const a = document.createElement("a")
        a.href = dataUrl
        a.download = `frame-${node.currentTime.toFixed(2)}s.png`
        a.click()
        toast.success(`Frame captured at ${node.currentTime.toFixed(2)}s`)
      }
    } catch {
      toast.error("Cannot capture frame — video may be cross-origin protected")
    }
  }, [videoRef, onCaptureFrame])

  const stepFrame = useCallback((direction: 1 | -1) => {
    const node = videoRef.current
    if (!node) return
    node.pause()
    const frameTime = 1 / 30
    node.currentTime = Math.max(0, Math.min(duration, node.currentTime + direction * frameTime))
    setCurrentTime(node.currentTime)
  }, [videoRef, duration])

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60)
    const secs = Math.floor(t % 60)
    const ms = Math.floor((t % 1) * 100)
    return `${mins}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}`
  }

  const hasSequence = storyboardUrls && storyboardUrls.length > 1

  const playSequenceShot = useCallback((index: number) => {
    if (!storyboardUrls || !storyboardUrls[index]) return
    const node = videoRef.current
    if (!node) return
    node.loop = false
    node.src = `/api/media/proxy?url=${encodeURIComponent(storyboardUrls[index])}`
    node.load()
    void node.play().catch(() => null)
    setSequenceIndex(index)
  }, [videoRef, storyboardUrls])

  useEffect(() => {
    if (!sequenceMode || !storyboardUrls) return
    const node = videoRef.current
    if (!node) return

    const onEnded = () => {
      const next = sequenceIndex + 1
      if (next < storyboardUrls.length) {
        playSequenceShot(next)
      } else {
        setSequenceMode(false)
        node.loop = true
        if (videoUrl) {
          node.src = `/api/media/proxy?url=${encodeURIComponent(videoUrl)}`
          node.load()
        }
        toast.success("Sequence preview complete")
      }
    }

    node.addEventListener("ended", onEnded)
    return () => node.removeEventListener("ended", onEnded)
  }, [sequenceMode, sequenceIndex, storyboardUrls, videoRef, videoUrl, playSequenceShot])

  if (!videoUrl) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 font-medium">Timeline</p>
        <div className="flex items-center gap-1 text-[11px] text-white/50">
          <span className="font-mono">{formatTime(currentTime)}</span>
          <span className="text-white/25">/</span>
          <span className="font-mono text-white/35">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Scrub track */}
      <div
        ref={trackRef}
        className="group relative h-8 cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.03]"
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-l-lg bg-gradient-to-r from-cyan-500/20 to-cyan-400/10"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.4)]"
          style={{ left: `calc(${progress}% - 2px)` }}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="liquidMetal"
          size="sm"
          onClick={() => stepFrame(-1)}
          className="h-7 w-7 p-0"
          title="Previous frame"
        >
          <SkipBack className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="liquidMetal"
          size="sm"
          onClick={() => {
            const node = videoRef.current
            if (!node) return
            if (node.paused) void node.play().catch(() => null)
            else node.pause()
          }}
          className="h-7 w-7 p-0"
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </Button>
        <Button
          type="button"
          variant="liquidMetal"
          size="sm"
          onClick={() => stepFrame(1)}
          className="h-7 w-7 p-0"
          title="Next frame"
        >
          <SkipForward className="h-3 w-3" />
        </Button>

        <div className="mx-1 h-4 w-px bg-white/10" />

        <Button
          type="button"
          variant="liquidMetal"
          size="sm"
          onClick={captureFrame}
          className="h-7 px-2 text-[10px]"
          title="Capture current frame"
        >
          <Camera className="mr-1 h-3 w-3" />
          Capture Frame
        </Button>

        {hasSequence && (
          <>
            <div className="mx-1 h-4 w-px bg-white/10" />
            <Button
              type="button"
              variant={sequenceMode ? "liquidMetalCyan" : "liquidMetal"}
              size="sm"
              onClick={() => {
                if (sequenceMode) {
                  setSequenceMode(false)
                  const node = videoRef.current
                  if (node) {
                    node.loop = true
                    if (videoUrl) {
                      node.src = `/api/media/proxy?url=${encodeURIComponent(videoUrl)}`
                      node.load()
                    }
                  }
                } else {
                  setSequenceMode(true)
                  playSequenceShot(0)
                }
              }}
              className="h-7 px-2 text-[10px]"
            >
              <Play className="mr-1 h-3 w-3" />
              {sequenceMode ? `Playing ${sequenceIndex + 1}/${storyboardUrls!.length}` : "Play Sequence"}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

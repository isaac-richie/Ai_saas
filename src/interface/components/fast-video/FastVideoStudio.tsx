"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Button } from "@/interface/components/ui/button"
import { Input } from "@/interface/components/ui/input"
import { Textarea } from "@/interface/components/ui/textarea"
import { StudioAdPanel } from "@/interface/components/shots/StudioAdPanel"
import {
  FAST_VIDEO_ASPECT_RATIOS,
  FAST_VIDEO_VARIATIONS,
  MOTION_PRESETS,
  STYLE_PRESETS,
  type FastVideoAspectRatio,
  type FastVideoVariation,
} from "@/core/config/fast-video-presets"
import { generateFastVideo, pollFastVideoStatus, promoteFastVideoToScene } from "@/core/actions/fast-video"
import { Loader2, Sparkles, Film, Clapperboard, Trash2 } from "lucide-react"
import { buildMediaFilename } from "@/lib/download-filename"

type SceneOption = {
  id: string
  name: string
}

type ProjectOption = {
  id: string
  name: string
  scenes: SceneOption[]
}

interface FastVideoStudioProps {
  projects: ProjectOption[]
}

type FastVideoDebugEvent = {
  at: string
  step: string
  details?: Record<string, unknown>
}

type SavedFastClip = {
  id: string
  taskId: string | null
  url: string
  subject: string
  prompt: string
  aspectRatio: FastVideoAspectRatio
  variation: FastVideoVariation
  durationSeconds: number
  createdAt: string
}

const FAST_VIDEO_STORAGE_KEY = "aisas.fast-video.v1"

export function FastVideoStudio({ projects }: FastVideoStudioProps) {
  const router = useRouter()

  const [subject, setSubject] = useState("")
  const [stylePresetId, setStylePresetId] = useState<string>(STYLE_PRESETS[0]?.id || "")
  const [motionPresetId, setMotionPresetId] = useState<string>(MOTION_PRESETS[1]?.id || "")
  const [aspectRatio, setAspectRatio] = useState<FastVideoAspectRatio>("16:9")
  const [variation, setVariation] = useState<FastVideoVariation>("balanced")
  const [durationSeconds, setDurationSeconds] = useState(5)

  const [referenceImageUrl, setReferenceImageUrl] = useState<string>("")
  const [isUploading, setIsUploading] = useState(false)

  const [status, setStatus] = useState<"idle" | "processing" | "completed" | "failed">("idle")
  const [statusMessage, setStatusMessage] = useState("Ready")
  const [taskId, setTaskId] = useState<string | null>(null)
  const [traceId, setTraceId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [useDirectVideoUrl, setUseDirectVideoUrl] = useState(false)
  const [debugEvents, setDebugEvents] = useState<FastVideoDebugEvent[]>([])
  const [finalPrompt, setFinalPrompt] = useState<string>("")
  const [savedClips, setSavedClips] = useState<SavedFastClip[]>([])
  const [downloadName, setDownloadName] = useState<string>("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "")
  const [selectedSceneId, setSelectedSceneId] = useState<string>(projects[0]?.scenes[0]?.id || "")

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  )

  const pipelineStage = useMemo(() => {
    if (status === "completed") return 3
    const normalized = statusMessage.toLowerCase()
    if (normalized.includes("final")) return 3
    if (normalized.includes("sample")) return 2
    if (status === "processing") return 1
    return 0
  }, [status, statusMessage])

  useEffect(() => {
    if (!videoUrl) return
    setDownloadName((current) => {
      if (current.trim()) return current
      return buildMediaFilename({
        base: subject || "fast-video",
        kind: "video",
        url: videoUrl,
      })
    })
  }, [subject, videoUrl])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAST_VIDEO_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        subject?: string
        stylePresetId?: string
        motionPresetId?: string
        aspectRatio?: FastVideoAspectRatio
        variation?: FastVideoVariation
        durationSeconds?: number
        referenceImageUrl?: string
        status?: "idle" | "processing" | "completed" | "failed"
        statusMessage?: string
        taskId?: string | null
        traceId?: string | null
        videoUrl?: string | null
        finalPrompt?: string
        savedClips?: SavedFastClip[]
      }

      if (typeof parsed.subject === "string") setSubject(parsed.subject)
      if (typeof parsed.stylePresetId === "string") setStylePresetId(parsed.stylePresetId)
      if (typeof parsed.motionPresetId === "string") setMotionPresetId(parsed.motionPresetId)
      if (parsed.aspectRatio) setAspectRatio(parsed.aspectRatio)
      if (parsed.variation) setVariation(parsed.variation)
      if (typeof parsed.durationSeconds === "number") setDurationSeconds(parsed.durationSeconds)
      if (typeof parsed.referenceImageUrl === "string") setReferenceImageUrl(parsed.referenceImageUrl)
      if (parsed.status) setStatus(parsed.status)
      if (typeof parsed.statusMessage === "string") setStatusMessage(parsed.statusMessage)
      if (typeof parsed.taskId === "string" || parsed.taskId === null) setTaskId(parsed.taskId ?? null)
      if (typeof parsed.traceId === "string" || parsed.traceId === null) setTraceId(parsed.traceId ?? null)
      if (typeof parsed.videoUrl === "string" || parsed.videoUrl === null) setVideoUrl(parsed.videoUrl ?? null)
      if (typeof parsed.finalPrompt === "string") setFinalPrompt(parsed.finalPrompt)
      if (Array.isArray(parsed.savedClips)) setSavedClips(parsed.savedClips.slice(0, 24))
    } catch {
      // Ignore bad local cache
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        FAST_VIDEO_STORAGE_KEY,
        JSON.stringify({
          subject,
          stylePresetId,
          motionPresetId,
          aspectRatio,
          variation,
          durationSeconds,
          referenceImageUrl,
          status,
          statusMessage,
          taskId,
          traceId,
          videoUrl,
          finalPrompt,
          savedClips: savedClips.slice(0, 24),
        })
      )
    } catch {
      // Ignore write failure
    }
  }, [
    subject,
    stylePresetId,
    motionPresetId,
    aspectRatio,
    variation,
    durationSeconds,
    referenceImageUrl,
    status,
    statusMessage,
    taskId,
    traceId,
    videoUrl,
    finalPrompt,
    savedClips,
  ])

  const saveClip = (clip: SavedFastClip) => {
    setSavedClips((prev) => {
      const dedup = prev.filter((item) => item.id !== clip.id && !(item.taskId && clip.taskId && item.taskId === clip.taskId) && item.url !== clip.url)
      return [clip, ...dedup].slice(0, 24)
    })
  }

  useEffect(() => {
    if (!selectedProject) {
      setSelectedSceneId("")
      return
    }
    if (!selectedProject.scenes.find((scene) => scene.id === selectedSceneId)) {
      setSelectedSceneId(selectedProject.scenes[0]?.id || "")
    }
  }, [selectedProject, selectedSceneId])

  useEffect(() => {
    if (!taskId || (status !== "processing" && status !== "idle")) return

    let attempts = 0
    let inFlight = false
    const maxAttempts = 120 // ~10 minutes @ 5s polling for longer Kie queues/renders
    const interval = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      attempts += 1
      try {
        const res = await pollFastVideoStatus(taskId, traceId || undefined)
        if (res.error) {
          setStatus("failed")
          setStatusMessage(res.error)
          clearInterval(interval)
          return
        }

        const nextStatus = res.data?.status
        const nextUrl = res.data?.url || null
        const waitingForUrl = Boolean((res.data as { waitingForUrl?: boolean } | undefined)?.waitingForUrl)
        const providerMessage = (res.data as { message?: string } | undefined)?.message
        const pollDebug = (res.data as { debug?: { events?: FastVideoDebugEvent[] } } | undefined)?.debug?.events || []
        if (pollDebug.length > 0) {
          setDebugEvents((prev) => [...prev, ...pollDebug])
        }

        if (nextStatus === "completed" && nextUrl) {
          setStatus("completed")
          setStatusMessage("Complete")
          setVideoUrl(nextUrl)
          setUseDirectVideoUrl(false)
          saveClip({
            id: crypto.randomUUID(),
            taskId,
            url: nextUrl,
            subject: subject.trim(),
            prompt: finalPrompt || subject.trim(),
            aspectRatio,
            variation,
            durationSeconds,
            createdAt: new Date().toISOString(),
          })
          clearInterval(interval)
          toast.success("Fast video ready")
        } else if (nextStatus === "failed") {
          setStatus("failed")
          setStatusMessage(res.data?.error || "Generation failed")
          clearInterval(interval)
        } else if (attempts >= maxAttempts) {
          setStatus("failed")
          setStatusMessage("Generation timed out after extended polling. Kie may still be processing; try again in a moment.")
          clearInterval(interval)
        } else {
          setStatus("processing")
          setStatusMessage(waitingForUrl ? (providerMessage || "Finalizing video file...") : `Sampling frames... (${attempts}/${maxAttempts})`)
        }
      } finally {
        inFlight = false
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [taskId, status, traceId, aspectRatio, durationSeconds, finalPrompt, subject, variation])

  const handleUploadReference = async (file?: File | null) => {
    if (!file) return

    setIsUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      })

      const data = await res.json()
      if (!res.ok || !data?.url) throw new Error(data?.error || "Upload failed")

      setReferenceImageUrl(data.url)
      toast.success("Reference image uploaded")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Upload failed"
      toast.error(message)
    } finally {
      setIsUploading(false)
    }
  }

  const handleGenerate = async () => {
    if (!subject.trim()) {
      toast.error("Please add a subject prompt")
      return
    }

    setIsGenerating(true)
    setStatus("processing")
    setStatusMessage("Initializing...")
    setVideoUrl(null)
    setUseDirectVideoUrl(false)
    setTaskId(null)
    setTraceId(null)
    setDebugEvents([])

    const res = await generateFastVideo({
      request_type: "fast_video",
      project_id: selectedProjectId || null,
      prompt_inputs: {
        text_subject: subject.trim(),
        style_preset_id: stylePresetId || null,
        motion_preset_id: motionPresetId || null,
        aspect_ratio: aspectRatio,
        reference_image: referenceImageUrl || null,
        variation_setting: variation,
      },
      settings: {
        duration_seconds: durationSeconds,
      },
    })

    setIsGenerating(false)

    if (res.error || !res.data) {
      setStatus("failed")
      setStatusMessage(res.error || "Generation failed")
      toast.error(res.error || "Generation failed")
      return
    }

    setFinalPrompt(res.data.prompt || "")
    const initialDebug = (res.data as { debug?: { traceId?: string; events?: FastVideoDebugEvent[] } }).debug
    if (initialDebug?.traceId) {
      setTraceId(initialDebug.traceId)
    }
    if (initialDebug?.events?.length) {
      setDebugEvents(initialDebug.events)
    }

    if (res.data.url && res.data.status === "completed") {
      setVideoUrl(res.data.url)
      setUseDirectVideoUrl(false)
      setStatus("completed")
      setStatusMessage("Complete")
      saveClip({
        id: crypto.randomUUID(),
        taskId: res.data.taskId || null,
        url: res.data.url,
        subject: subject.trim(),
        prompt: res.data.prompt || subject.trim(),
        aspectRatio,
        variation,
        durationSeconds,
        createdAt: new Date().toISOString(),
      })
      toast.success("Fast video ready")
      return
    }

    if (!res.data.taskId) {
      setStatus("failed")
      setStatusMessage("Provider did not return a task id. Please try another model or prompt.")
      toast.error("Generation did not start. No task id from provider.")
      return
    }

    setTaskId(res.data.taskId)
    setStatus("processing")
    setStatusMessage("Sampling frames...")
    toast.success("Fast video generation started")
  }

  const handlePromote = async () => {
    if (!videoUrl) {
      toast.error("Generate a video first")
      return
    }
    if (!selectedSceneId) {
      toast.error("Select a destination scene")
      return
    }

    setIsPromoting(true)
    const res = await promoteFastVideoToScene({
      sceneId: selectedSceneId,
      subject,
      finalPrompt: finalPrompt || subject,
      outputUrl: videoUrl,
      aspectRatio: aspectRatio,
      durationSeconds: durationSeconds,
      stylePresetId: stylePresetId || null,
      motionPresetId: motionPresetId || null,
      variationSetting: variation,
      name: `Fast Track - ${subject.slice(0, 30)}`,
    })
    setIsPromoting(false)

    if (res.error || !res.data) {
      toast.error(res.error || "Failed to promote")
      return
    }

    toast.success("Added to main scene builder")
    router.push(`/dashboard/projects/${res.data.projectId}/scenes/${selectedSceneId}`)
  }

  const handleClearSession = () => {
    setStatus("idle")
    setStatusMessage("Ready")
    setTaskId(null)
    setTraceId(null)
    setVideoUrl(null)
    setUseDirectVideoUrl(false)
    setDebugEvents([])
    setFinalPrompt("")
  }

  const handleClearAllClips = () => {
    setSavedClips([])
    toast.success("Saved clips cleared")
  }

  const handleDeleteClip = (id: string) => {
    setSavedClips((prev) => prev.filter((clip) => clip.id !== id))
  }

  const handleApplyAdToFastTrack = ({
    packet,
    outputType,
  }: {
    packet: { masterPrompt: string }
    providerTarget: "openai" | "runway" | "kie"
    outputType: "image" | "video"
    promptOverride?: string
  }) => {
    if (outputType === "image") {
      toast.message("Tip: Fast Track is optimized for video prompts.")
    }
    setSubject(packet.masterPrompt)
    toast.success("Assistant Director prompt applied to Fast Track subject")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="rounded-2xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fast Track Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-white/50">Subject</label>
            <Textarea
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="A cyborg panther runs through a rainy neon city"
              className="min-h-24 resize-none rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSubject("A detective crossing a rain-soaked street at dusk, cinematic atmosphere")}
              className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white/70 hover:bg-white/10"
            >
              Try Template Prompt
            </Button>
          </div>

          <StudioAdPanel
            promptPreview={subject}
            onApplyPacket={handleApplyAdToFastTrack}
            embedded
          />

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-white/50">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-2">
              {FAST_VIDEO_ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`rounded-xl border px-2 py-2 text-xs transition ${
                    aspectRatio === ratio
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-white/50">Variation</label>
            <div className="grid grid-cols-3 gap-2">
              {FAST_VIDEO_VARIATIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setVariation(item)}
                  className={`rounded-xl border px-2 py-2 text-xs capitalize transition ${
                    variation === item
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-white/50">Duration</label>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-white/65">
                <span>Quick clip length</span>
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-white/80">
                  {durationSeconds}s
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={15}
                step={1}
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-300"
              />
              <div className="mt-2 flex justify-between text-[11px] text-white/45">
                <span>5s</span>
                <span>10s</span>
                <span>15s</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-white/50">Reference Image (optional)</label>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={isUploading}
                  onChange={(event) => void handleUploadReference(event.target.files?.[0] || null)}
                  className="rounded-lg border-white/10 bg-transparent text-white/80"
                />
                {isUploading && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
              </div>
              {referenceImageUrl && (
                <p className="mt-2 line-clamp-1 text-xs text-white/50">Attached: {referenceImageUrl}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-white/50">Motion Presets</label>
            <div className="grid gap-2 max-h-44 overflow-y-auto pr-1">
              {MOTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setMotionPresetId(preset.id)}
                  className={`rounded-xl border p-2 text-left transition ${
                    motionPresetId === preset.id
                      ? "border-cyan-400/50 bg-cyan-500/15"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="text-xs font-medium text-white">{preset.name}</div>
                  <div className="mt-0.5 text-[11px] text-white/50">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-white/50">Style Presets</label>
            <div className="grid gap-2 max-h-44 overflow-y-auto pr-1">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setStylePresetId(preset.id)}
                  className={`rounded-xl border p-2 text-left transition ${
                    stylePresetId === preset.id
                      ? "border-cyan-400/50 bg-cyan-500/15"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="text-xs font-medium text-white">{preset.name}</div>
                  <div className="mt-0.5 text-[11px] text-white/50">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full rounded-xl border border-white/10 bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] text-black hover:opacity-90"
          >
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate {durationSeconds}s Quick Video
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="rounded-2xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Generation Canvas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/70">
              {videoUrl ? (
                <video
                  src={useDirectVideoUrl ? videoUrl : `/api/media/proxy?url=${encodeURIComponent(videoUrl)}`}
                  className="h-full w-full object-contain"
                  controls
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  onError={() => {
                    if (!useDirectVideoUrl) {
                      setUseDirectVideoUrl(true)
                    }
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/45">
                  {status === "processing" ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {statusMessage}</span>
                  ) : (
                    <span>Generate a fast video to preview here</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Status: {status}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Aspect: {aspectRatio}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Variation: {variation}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Duration: {durationSeconds}s</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/65">
              <p className="mb-1 uppercase tracking-[0.16em] text-white/45">Pipeline</p>
              <p>{status === "processing" ? "Initializing -> Sampling -> Finalizing" : "Ready"}</p>
              <div className="mt-2 space-y-2">
                <div className={status === "processing" ? "generation-track" : "generation-track opacity-30"} />
                <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.14em]">
                  <span className={pipelineStage >= 1 ? "text-cyan-200" : "text-white/35"}>Init</span>
                  <span className={pipelineStage >= 2 ? "text-cyan-200" : "text-white/35"}>Sampling</span>
                  <span className={pipelineStage >= 3 ? "text-cyan-200" : "text-white/35"}>Finalizing</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex min-w-[230px] flex-1 items-center gap-2">
                <Input
                  value={downloadName}
                  onChange={(event) => setDownloadName(event.target.value)}
                  placeholder="File name"
                  className="h-8 rounded-lg border-white/10 bg-white/5 text-xs text-white placeholder:text-white/35"
                />
                <a
                  href={
                    videoUrl
                      ? `/api/media/proxy?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(downloadName || buildMediaFilename({
                        base: subject || "fast-video",
                        kind: "video",
                        url: videoUrl,
                      }))}`
                      : "#"
                  }
                  download={
                    videoUrl
                      ? (downloadName || buildMediaFilename({
                        base: subject || "fast-video",
                        kind: "video",
                        url: videoUrl,
                      }))
                      : undefined
                  }
                  className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs ${
                    videoUrl
                      ? "border-white/10 bg-white/10 text-white/85 hover:bg-white/20"
                      : "pointer-events-none border-white/10 bg-white/5 text-white/35"
                  }`}
                >
                  Download
                </a>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleClearSession}
                className="h-8 rounded-lg border-white/10 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10"
              >
                Clear Current
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClearAllClips}
                className="h-8 rounded-lg border-white/10 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10"
              >
                Clear Saved
              </Button>
            </div>

            <details className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/70">
              <summary className="cursor-pointer select-none text-white/80">
                Fast Video Debug
                {traceId ? ` · ${traceId.slice(0, 8)}` : ""}
              </summary>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed text-white/65">
                {debugEvents.length === 0 ? (
                  <p>No debug events yet.</p>
                ) : (
                  debugEvents.map((event, index) => (
                    <div key={`${event.at}-${event.step}-${index}`} className="rounded border border-white/10 bg-white/5 p-2">
                      <div className="text-cyan-300">{event.step}</div>
                      <div className="text-white/40">{event.at}</div>
                      {event.details ? <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(event.details, null, 2)}</pre> : null}
                    </div>
                  ))
                )}
              </div>
            </details>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Saved Outputs</p>
                <p className="text-xs text-white/45">{savedClips.length}</p>
              </div>
              {savedClips.length === 0 ? (
                <p className="text-xs text-white/50">Generated clips stay here until you clear them.</p>
              ) : (
                <div className="grid gap-2">
                  {savedClips.map((clip) => (
                    <div key={clip.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setVideoUrl(clip.url)
                          setFinalPrompt(clip.prompt)
                          setSubject(clip.subject)
                          setAspectRatio(clip.aspectRatio)
                          setVariation(clip.variation)
                          setDurationSeconds(clip.durationSeconds)
                          setStatus("completed")
                          setStatusMessage("Loaded from saved clips")
                          setTaskId(clip.taskId)
                          setUseDirectVideoUrl(false)
                        }}
                      >
                        <p className="truncate text-xs font-medium text-white">{clip.subject || "Saved clip"}</p>
                        <p className="text-[11px] text-white/45">{new Date(clip.createdAt).toLocaleString()}</p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md text-white/60 hover:bg-white/10 hover:text-white"
                        onClick={() => handleDeleteClip(clip.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Film className="h-4 w-4" />
              Add to Main Scene Builder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-white/50">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id} className="bg-[#0f1012]">
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-white/50">Scene</label>
                <select
                  value={selectedSceneId}
                  onChange={(event) => setSelectedSceneId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
                >
                  {(selectedProject?.scenes || []).map((scene) => (
                    <option key={scene.id} value={scene.id} className="bg-[#0f1012]">
                      {scene.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              type="button"
              onClick={handlePromote}
              disabled={isPromoting || !videoUrl || !selectedSceneId}
              className="w-full rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15"
            >
              {isPromoting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
              Add to Scene Workflow
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

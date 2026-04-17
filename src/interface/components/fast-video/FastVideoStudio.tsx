"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Button } from "@/interface/components/ui/button"
import { Input } from "@/interface/components/ui/input"
import { Textarea } from "@/interface/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/interface/components/ui/select"
import { StudioAdPanel } from "@/interface/components/shots/StudioAdPanel"
import {
  FAST_VIDEO_ASPECT_RATIOS,
  FAST_VIDEO_VARIATIONS,
  MOTION_PRESETS,
  STYLE_PRESETS,
  type FastVideoAspectRatio,
  type FastVideoVariation,
} from "@/core/config/fast-video-presets"
import {
  DEFAULT_KIE_VIDEO_MODEL_FAMILY,
  KIE_VIDEO_MODEL_FAMILIES,
  type KieVideoModelFamilyId,
  getKieVideoModelFamily,
  resolveKieVideoModelByFamily,
} from "@/core/config/kie-video-models"
import { generateFastVideo, pollFastVideoStatus, promoteFastVideoToScene } from "@/core/actions/fast-video"
import {
  Loader2,
  Sparkles,
  Film,
  Clapperboard,
  Trash2,
  Download,
  RotateCcw,
  Save,
  WandSparkles,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
} from "lucide-react"
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
  modelFamilyId?: KieVideoModelFamilyId
  createdAt: string
}

type PromptTemplate = {
  id: string
  label: string
  prompt: string
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "neo-noir",
    label: "Neo-noir alley",
    prompt:
      "A lone detective walks through a rain-soaked neon alley at night, cinematic realism, subtle fog, reflective asphalt, slow dolly tracking shot",
  },
  {
    id: "fashion-commercial",
    label: "Fashion commercial",
    prompt:
      "A high-end fashion model exits a black car in golden-hour city light, elegant camera glide, premium ad look, clean depth and polished textures",
  },
  {
    id: "documentary-intro",
    label: "Documentary intro",
    prompt:
      "A confident founder steps onto a rooftop at sunrise, medium close-up, natural wind movement, grounded documentary tone, smooth cinematic motion",
  },
]

const FAST_VIDEO_STORAGE_KEY = "aisas.fast-video.v1"

export function FastVideoStudio({ projects }: FastVideoStudioProps) {
  const router = useRouter()

  const [subject, setSubject] = useState("")
  const [templateId, setTemplateId] = useState<string>(PROMPT_TEMPLATES[0]?.id || "")
  const [stylePresetId, setStylePresetId] = useState<string>(STYLE_PRESETS[0]?.id || "")
  const [motionPresetId, setMotionPresetId] = useState<string>(MOTION_PRESETS[1]?.id || "")
  const [modelFamilyId, setModelFamilyId] = useState<KieVideoModelFamilyId>(DEFAULT_KIE_VIDEO_MODEL_FAMILY)
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
  const [isSavingOutput, setIsSavingOutput] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)

  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "")
  const [selectedSceneId, setSelectedSceneId] = useState<string>(projects[0]?.scenes[0]?.id || "")

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  )

  const activeModelFamily = useMemo(() => getKieVideoModelFamily(modelFamilyId), [modelFamilyId])

  const pipelineStage = useMemo(() => {
    if (status === "completed") return 3
    const normalized = statusMessage.toLowerCase()
    if (normalized.includes("final")) return 3
    if (normalized.includes("sample")) return 2
    if (status === "processing") return 1
    return 0
  }, [status, statusMessage])

  const activeStyle = useMemo(
    () => STYLE_PRESETS.find((preset) => preset.id === stylePresetId) || null,
    [stylePresetId]
  )

  const activeMotion = useMemo(
    () => MOTION_PRESETS.find((preset) => preset.id === motionPresetId) || null,
    [motionPresetId]
  )

  const handleLoadClip = (clip: SavedFastClip) => {
    setVideoUrl(clip.url)
    setFinalPrompt(clip.prompt)
    setSubject(clip.subject)
    setAspectRatio(clip.aspectRatio)
    setVariation(clip.variation)
    setDurationSeconds(clip.durationSeconds)
    setStatus("completed")
    setStatusMessage("Loaded from saved clips")
    setTaskId(clip.taskId)
    setModelFamilyId(clip.modelFamilyId || DEFAULT_KIE_VIDEO_MODEL_FAMILY)
    setUseDirectVideoUrl(false)
  }

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
        templateId?: string
        stylePresetId?: string
        motionPresetId?: string
        modelFamilyId?: KieVideoModelFamilyId
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
      if (typeof parsed.templateId === "string") setTemplateId(parsed.templateId)
      if (typeof parsed.stylePresetId === "string") setStylePresetId(parsed.stylePresetId)
      if (typeof parsed.motionPresetId === "string") setMotionPresetId(parsed.motionPresetId)
      if (parsed.modelFamilyId) setModelFamilyId(parsed.modelFamilyId)
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
          templateId,
          stylePresetId,
          motionPresetId,
          modelFamilyId,
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
    templateId,
    stylePresetId,
    motionPresetId,
    modelFamilyId,
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
    const maxAttempts = 120
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
            modelFamilyId,
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
  }, [taskId, status, traceId, aspectRatio, durationSeconds, finalPrompt, modelFamilyId, subject, variation])

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

    const selectedModel = resolveKieVideoModelByFamily({
      familyId: modelFamilyId,
      useImageToVideo: Boolean(referenceImageUrl),
    })

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
        model: selectedModel,
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
        modelFamilyId,
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

  const handleSaveOutput = async () => {
    if (!videoUrl) {
      toast.error("Generate a video first")
      return
    }

    saveClip({
      id: crypto.randomUUID(),
      taskId,
      url: videoUrl,
      subject: subject.trim(),
      prompt: finalPrompt || subject.trim(),
      aspectRatio,
      variation,
      durationSeconds,
      modelFamilyId,
      createdAt: new Date().toISOString(),
    })

    if (!selectedSceneId) {
      toast.success("Saved output locally")
      return
    }

    setIsSavingOutput(true)
    const res = await promoteFastVideoToScene({
      sceneId: selectedSceneId,
      subject,
      finalPrompt: finalPrompt || subject,
      outputUrl: videoUrl,
      aspectRatio,
      durationSeconds,
      stylePresetId: stylePresetId || null,
      motionPresetId: motionPresetId || null,
      variationSetting: variation,
      name: `Fast Track - ${subject.slice(0, 30)}`,
    })
    setIsSavingOutput(false)

    if (res.error) {
      toast.error(res.error)
      return
    }

    toast.success("Saved to scene and gallery")
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
    promptOverride,
  }: {
    packet: { masterPrompt: string }
    providerTarget: "openai" | "runway" | "kie"
    outputType: "image" | "video"
    promptOverride?: string
  }) => {
    if (outputType === "image") {
      toast.message("Tip: Fast Track is optimized for video prompts.")
    }
    setSubject(promptOverride || packet.masterPrompt)
    toast.success("Assistant Director prompt applied to Fast Track subject")
  }

  const renderStatusText = () => {
    if (status === "processing") return statusMessage
    if (status === "failed") return "Generation failed"
    if (status === "completed") return "Clip ready"
    return "Ready"
  }

  const togglePlayback = () => {
    const node = videoRef.current
    if (!node) return
    if (node.paused) {
      void node.play().catch(() => null)
    } else {
      node.pause()
    }
  }

  const toggleMute = () => {
    const node = videoRef.current
    if (!node) return
    node.muted = !node.muted
    setIsMuted(node.muted)
  }

  const handleVolumeChange = (nextVolume: number) => {
    const node = videoRef.current
    setVolume(nextVolume)
    if (!node) return
    node.volume = nextVolume
    if (nextVolume > 0 && node.muted) {
      node.muted = false
      setIsMuted(false)
    }
  }

  const toggleFullscreen = () => {
    const node = videoRef.current
    if (!node) return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => null)
      return
    }
    void node.requestFullscreen?.().catch(() => null)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_370px]">
      <Card className="studio-card rounded-2xl text-white xl:sticky xl:top-20 xl:max-h-[calc(100vh-6.25rem)] xl:overflow-y-auto h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Shot Setup</CardTitle>
          <p className="text-xs text-white/55">Build your shot, choose model behavior, then generate in one pass.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="studio-subcard rounded-xl p-3 space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.16em] text-white/45">1. Prompt</label>
              <Textarea
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Describe your shot..."
                className="studio-field min-h-28 resize-none rounded-xl text-white placeholder:text-white/35"
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.16em] text-white/45">Template</label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="studio-field rounded-xl text-white">
                    <SelectValue placeholder="Use Template" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0b0f14] text-white">
                    {PROMPT_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id} className="text-white/85 focus:bg-cyan-300/15 focus:text-cyan-100">
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="studioGhost"
                size="sm"
                className="h-10 rounded-xl px-3"
                onClick={() => {
                  const selected = PROMPT_TEMPLATES.find((item) => item.id === templateId)
                  if (selected) setSubject(selected.prompt)
                }}
              >
                Use
              </Button>
            </div>
          </div>

          <div className="studio-subcard rounded-xl p-3 space-y-3">
            <label className="text-[10px] uppercase tracking-[0.16em] text-white/45">2. Style & Controls</label>
            <div className="space-y-2">
              <Select value={stylePresetId} onValueChange={setStylePresetId}>
                <SelectTrigger className="studio-field rounded-xl text-white">
                  <SelectValue placeholder="Cinematic style" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0b0f14] text-white">
                  {STYLE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id} className="text-white/85 focus:bg-cyan-300/15 focus:text-cyan-100">
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={motionPresetId} onValueChange={setMotionPresetId}>
                <SelectTrigger className="studio-field rounded-xl text-white">
                  <SelectValue placeholder="Motion preset" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0b0f14] text-white">
                  {MOTION_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id} className="text-white/85 focus:bg-cyan-300/15 focus:text-cyan-100">
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {KIE_VIDEO_MODEL_FAMILIES.map((family) => (
                <button
                  key={family.id}
                  type="button"
                  onClick={() => setModelFamilyId(family.id)}
                  className={`rounded-xl border p-2 text-left transition ${
                    modelFamilyId === family.id
                      ? "border-cyan-300/45 bg-cyan-400/14"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="text-xs font-medium text-white">{family.label}</div>
                  <div className="mt-0.5 text-[11px] text-white/55">{family.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="studio-subcard rounded-xl p-3 space-y-3">
            <label className="text-[10px] uppercase tracking-[0.16em] text-white/45">3. Settings</label>
            <div className="grid gap-2 grid-cols-3">
              {FAST_VIDEO_ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                    aspectRatio === ratio
                      ? "border-cyan-400/55 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
            <div className="grid gap-2 grid-cols-3">
              {FAST_VIDEO_VARIATIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setVariation(item)}
                  className={`rounded-lg border px-2 py-1.5 text-xs capitalize transition ${
                    variation === item
                      ? "border-cyan-400/55 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between text-xs text-white/65">
                <span>Duration</span>
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-white/80">{durationSeconds}s</span>
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
            </div>
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={isUploading}
                  onChange={(event) => void handleUploadReference(event.target.files?.[0] || null)}
                  className="h-9 rounded-lg border-white/10 bg-transparent text-xs text-white/80"
                />
                {isUploading && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
              </div>
              {referenceImageUrl ? (
                <div className="text-[11px] text-cyan-200/80">Image-to-video enabled</div>
              ) : (
                <div className="text-[11px] text-white/45">Optional reference image</div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 z-10 rounded-xl border border-white/10 bg-[#0e1014]/90 p-2 backdrop-blur">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full rounded-xl border border-white/10 bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] text-black hover:opacity-90"
            >
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate Shot
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card className="studio-card rounded-2xl text-white overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Output</CardTitle>
                <p className="mt-1 text-xs text-white/50">Generate, review, tweak, and regenerate without leaving this canvas.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">{activeModelFamily.label}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">{renderStatusText()}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/75 shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_28px_70px_-42px_rgba(0,0,0,0.95)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_55%)]" />
              <div className="aspect-video">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    src={useDirectVideoUrl ? videoUrl : `/api/media/proxy?url=${encodeURIComponent(videoUrl)}`}
                    className="h-full w-full object-contain"
                    controls
                    autoPlay
                    loop
                    playsInline
                    preload="metadata"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onVolumeChange={() => {
                      const node = videoRef.current
                      if (!node) return
                      setIsMuted(node.muted)
                      setVolume(node.volume)
                    }}
                    onLoadedMetadata={() => {
                      const node = videoRef.current
                      if (!node) return
                      setIsPlaying(!node.paused)
                      setIsMuted(node.muted)
                      setVolume(node.volume)
                    }}
                    onError={() => {
                      if (!useDirectVideoUrl) {
                        setUseDirectVideoUrl(true)
                      }
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white/45">
                    {status === "processing" ? (
                      <div className="w-full max-w-md space-y-4">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {statusMessage}
                        </div>
                        <div className="relative h-28 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent [animation:skeletonSweep_1.4s_ease-in-out_infinite]" />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-base text-white/70">Your cinematic preview appears here</p>
                        <p className="mt-1 text-xs text-white/45">Tune the setup panel and generate your first clip.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {videoUrl ? (
              <div className="studio-subcard rounded-xl p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="studioGhost"
                    size="sm"
                    onClick={togglePlayback}
                    className="h-8 rounded-lg px-3 text-xs"
                  >
                    {isPlaying ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                  <Button
                    type="button"
                    variant="studioGhost"
                    size="sm"
                    onClick={toggleMute}
                    className="h-8 rounded-lg px-3 text-xs"
                  >
                    {isMuted ? <VolumeX className="mr-1.5 h-3.5 w-3.5" /> : <Volume2 className="mr-1.5 h-3.5 w-3.5" />}
                    {isMuted ? "Muted" : "Sound"}
                  </Button>
                  <div className="flex min-w-[130px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                    <span className="text-[11px] text-white/55">Volume</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(event) => handleVolumeChange(Number(event.target.value))}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-cyan-300"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="studioGhost"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="h-8 rounded-lg px-3 text-xs"
                  >
                    <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                    Fullscreen
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Aspect: {aspectRatio}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Duration: {durationSeconds}s</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Variation: {variation}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Status: {status}</span>
            </div>

            <div className="studio-subcard rounded-xl p-3 text-xs text-white/65">
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

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-[240px] flex-1 items-center gap-2">
                <Input
                  value={downloadName}
                  onChange={(event) => setDownloadName(event.target.value)}
                  placeholder="File name"
                  className="h-9 rounded-lg border-white/10 bg-white/5 text-xs text-white placeholder:text-white/35"
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
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs transition ${
                    videoUrl
                      ? "border-white/10 bg-white/10 text-white/85 hover:bg-white/20"
                      : "pointer-events-none border-white/10 bg-white/5 text-white/35"
                  }`}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </a>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="h-9 rounded-lg border-white/10 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Regenerate
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSaveOutput()}
                disabled={!videoUrl || isSavingOutput}
                className="h-9 rounded-lg border-white/10 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10"
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {isSavingOutput ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClearSession}
                className="h-9 rounded-lg border-white/10 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10"
              >
                Clear
              </Button>
            </div>

            <div className="studio-subcard rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Saved Outputs</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-white/45">{savedClips.length}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAllClips}
                    className="h-7 rounded-full px-3 text-[11px] text-white/65 hover:text-white"
                  >
                    Clear Saved
                  </Button>
                </div>
              </div>
              {savedClips.length === 0 ? (
                <p className="text-xs text-white/50">Saved clips appear here for fast compare and reuse.</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {savedClips.map((clip) => (
                    <div key={clip.id} className="min-w-[260px] rounded-lg border border-white/10 bg-black/25 p-2.5">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => handleLoadClip(clip)}
                      >
                        <p className="truncate text-xs font-medium text-white">{clip.subject || "Saved clip"}</p>
                        <p className="mt-1 text-[11px] text-white/45">{new Date(clip.createdAt).toLocaleString()}</p>
                      </button>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] text-cyan-200/80">{getKieVideoModelFamily(clip.modelFamilyId).label}</span>
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Card className="studio-subcard rounded-xl border-white/10 bg-transparent text-white shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
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

            {process.env.NODE_ENV !== "production" ? (
              <details className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/70">
                <summary className="cursor-pointer select-none text-white/80">
                  Developer Debug
                  {traceId ? ` · ${traceId.slice(0, 8)}` : ""}
                </summary>
                <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed text-white/65">
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
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6.25rem)] xl:overflow-y-auto h-fit">
        <StudioAdPanel
          promptPreview={subject}
          onApplyPacket={handleApplyAdToFastTrack}
          embedded={false}
          showHistory={false}
        />

        <Card className="studio-card rounded-2xl text-white">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <WandSparkles className="h-4 w-4 text-cyan-300" />
              Active Direction Stack
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-white/70">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-white/45">Style:</span> {activeStyle?.name || "Custom"}
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-white/45">Motion:</span> {activeMotion?.name || "Custom"}
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-white/45">Model:</span> {activeModelFamily.label}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

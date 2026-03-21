"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Button } from "@/interface/components/ui/button"
import { Input } from "@/interface/components/ui/input"
import { Textarea } from "@/interface/components/ui/textarea"
import {
  FAST_VIDEO_ASPECT_RATIOS,
  FAST_VIDEO_VARIATIONS,
  MOTION_PRESETS,
  STYLE_PRESETS,
  type FastVideoAspectRatio,
  type FastVideoVariation,
} from "@/core/config/fast-video-presets"
import { generateFastVideo, pollFastVideoStatus, promoteFastVideoToScene } from "@/core/actions/fast-video"
import { Loader2, Sparkles, Film, Clapperboard } from "lucide-react"

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

export function FastVideoStudio({ projects }: FastVideoStudioProps) {
  const router = useRouter()

  const [subject, setSubject] = useState("")
  const [stylePresetId, setStylePresetId] = useState<string>(STYLE_PRESETS[0]?.id || "")
  const [motionPresetId, setMotionPresetId] = useState<string>(MOTION_PRESETS[1]?.id || "")
  const [aspectRatio, setAspectRatio] = useState<FastVideoAspectRatio>("16:9")
  const [variation, setVariation] = useState<FastVideoVariation>("balanced")

  const [referenceImageUrl, setReferenceImageUrl] = useState<string>("")
  const [isUploading, setIsUploading] = useState(false)

  const [status, setStatus] = useState<"idle" | "processing" | "completed" | "failed">("idle")
  const [statusMessage, setStatusMessage] = useState("Ready")
  const [taskId, setTaskId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [finalPrompt, setFinalPrompt] = useState<string>("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "")
  const [selectedSceneId, setSelectedSceneId] = useState<string>(projects[0]?.scenes[0]?.id || "")

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  )

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

    const interval = setInterval(async () => {
      const res = await pollFastVideoStatus(taskId)
      if (res.error) {
        setStatus("failed")
        setStatusMessage(res.error)
        clearInterval(interval)
        return
      }

      const nextStatus = res.data?.status
      const nextUrl = res.data?.url || null

      if (nextStatus === "completed" && nextUrl) {
        setStatus("completed")
        setStatusMessage("Complete")
        setVideoUrl(nextUrl)
        clearInterval(interval)
        toast.success("Fast video ready")
      } else if (nextStatus === "failed") {
        setStatus("failed")
        setStatusMessage(res.data?.error || "Generation failed")
        clearInterval(interval)
      } else {
        setStatus("processing")
        setStatusMessage("Sampling frames...")
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [taskId, status])

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
    setTaskId(null)

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
        duration_seconds: 5,
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

    if (res.data.url && res.data.status === "completed") {
      setVideoUrl(res.data.url)
      setStatus("completed")
      setStatusMessage("Complete")
      toast.success("Fast video ready")
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
      durationSeconds: 5,
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
            Generate 5s Quick Video
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
                <video src={`/api/media/proxy?url=${encodeURIComponent(videoUrl)}`} className="h-full w-full object-contain" controls autoPlay loop playsInline preload="metadata" />
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
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">Duration: 5s</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/65">
              <p className="mb-1 uppercase tracking-[0.16em] text-white/45">Pipeline</p>
              <p>{status === "processing" ? "Initializing -> Sampling -> Finalizing" : "Ready"}</p>
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

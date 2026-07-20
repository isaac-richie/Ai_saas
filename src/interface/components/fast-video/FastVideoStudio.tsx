"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { generateFastVideo, pollFastVideoStatus, routeFastVideoToScene, persistFastVideoMedia } from "@/core/actions/fast-video"
import {
  getFastVideoStoryboard,
  replaceFastVideoStoryboard,
  type FastVideoStoryboardRow,
} from "@/core/actions/fast-video-storyboard"
import {
  createStudioAdCampaign,
  deleteStudioAdCampaign,
  listStudioAdCampaigns,
  updateStudioAdCampaignItem,
  type StudioAdCampaignWithItems,
} from "@/core/actions/studio-ad-campaigns"
import { getShots } from "@/core/actions/shots"
import type { StudioAdCampaignDeliverable, StudioAdCampaignPlan } from "@/core/validation/studio-ad"
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
  ArrowRightLeft,
  ListChecks,
  Send,
  Copy,
} from "lucide-react"
import { buildMediaFilename } from "@/lib/download-filename"

type SceneOption = {
  id: string
  name: string
}

type SceneShotOption = {
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

type GenerationSnapshot = {
  subject: string
  prompt: string
  aspectRatio: FastVideoAspectRatio
  variation: FastVideoVariation
  durationSeconds: number
  modelFamilyId: KieVideoModelFamilyId
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

type StoryboardItem = {
  id: string
  sourceClipId: string | null
  url: string
  subject: string
  prompt: string
  durationSeconds: number
  modelFamilyId?: KieVideoModelFamilyId
  sceneGroup: "Scene A" | "Scene B" | "Scene C"
  note: string
  status: "draft" | "ready"
  createdAt: string
}

type CampaignBatchItem = StudioAdCampaignDeliverable & {
  dbId?: string
  status: "planned" | "queued" | "processing" | "completed" | "failed"
  taskId: string | null
  traceId: string | null
  url: string | null
  error: string | null
}

type ContinuityKey = "character" | "wardrobe" | "location" | "lighting" | "colorGrade" | "cameraStyle"

type ContinuityLock = {
  key: ContinuityKey
  label: string
}

const CONTINUITY_LOCKS: ContinuityLock[] = [
  { key: "character", label: "Character" },
  { key: "wardrobe", label: "Wardrobe" },
  { key: "location", label: "Location" },
  { key: "lighting", label: "Lighting" },
  { key: "colorGrade", label: "Color Grade" },
  { key: "cameraStyle", label: "Camera Style" },
]

type PromptTemplate = {
  id: string
  label: string
  prompt: string
}

type QuickLook = {
  id: string
  label: string
  stylePresetId: string
  motionPresetId: string
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

const QUICK_LOOKS: QuickLook[] = [
  {
    id: "look_cinematic_close",
    label: "Cinematic Close-Up",
    stylePresetId: "style_golden_hour_film",
    motionPresetId: "motion_dolly_in",
  },
  {
    id: "look_documentary",
    label: "Documentary Natural",
    stylePresetId: "style_hyperreal_studio",
    motionPresetId: "motion_handheld_gentle",
  },
  {
    id: "look_neon_drive",
    label: "Neon Night Drive",
    stylePresetId: "style_cyberpunk_neon",
    motionPresetId: "motion_fast_action_tracking",
  },
]

const FAST_VIDEO_STORAGE_KEY = "aisas.fast-video.v1"

function normalizeStoryboardItems(items: StoryboardItem[]): StoryboardItem[] {
  return items.slice(0, 60).map((item) => ({
    ...item,
    subject: item.subject?.trim() || "Storyboard shot",
    prompt: item.prompt?.trim() || "",
    durationSeconds: Math.max(1, Math.min(30, Math.round(item.durationSeconds || 5))),
    sceneGroup: item.sceneGroup || "Scene A",
    note: item.note || "",
    status: item.status || "ready",
  }))
}

function mapRemoteStoryboardItem(row: FastVideoStoryboardRow): StoryboardItem {
  return {
    id: row.id,
    sourceClipId: row.source_clip_id,
    url: row.url,
    subject: row.subject || "Storyboard shot",
    prompt: row.prompt || "",
    durationSeconds: row.duration_seconds || 5,
    modelFamilyId: (row.model_family_id as KieVideoModelFamilyId | null) || undefined,
    sceneGroup: (row.scene_group as StoryboardItem["sceneGroup"]) || "Scene A",
    note: row.note || "",
    status: (row.status as StoryboardItem["status"]) || "ready",
    createdAt: row.created_at,
  }
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function mapCampaignRowToPlan(row: StudioAdCampaignWithItems): StudioAdCampaignPlan {
  const score = row.score && typeof row.score === "object" && !Array.isArray(row.score)
    ? row.score as Record<string, unknown>
    : {}

  return {
    campaignSummary: row.campaign_summary,
    audience: row.audience,
    creativeStrategy: row.creative_strategy,
    deliverables: row.items.map((item) => ({
      id: item.id,
      title: item.title,
      conceptType: item.concept_type,
      hook: item.hook,
      creatorDirection: item.creator_direction,
      masterPrompt: item.master_prompt,
      negativePrompt: item.negative_prompt,
      durationSeconds: item.duration_seconds,
      aspectRatio: item.aspect_ratio,
      modelFamilyId: getKieVideoModelFamily(item.model_family_id).id,
      stylePresetId: item.style_preset_id,
      motionPresetId: item.motion_preset_id,
      continuityAnchors: jsonStringArray(item.continuity_anchors),
      productionNotes: jsonStringArray(item.production_notes),
    })),
    score: {
      campaignReadiness: typeof score.campaignReadiness === "number" ? score.campaignReadiness : 0,
      varietyStrength: typeof score.varietyStrength === "number" ? score.varietyStrength : 0,
      promptClarity: typeof score.promptClarity === "number" ? score.promptClarity : 0,
    },
    suggestions: jsonStringArray(row.suggestions),
  }
}

function mapCampaignRowToItems(row: StudioAdCampaignWithItems): CampaignBatchItem[] {
  return row.items.map((item) => ({
    id: item.id,
    dbId: item.id,
    title: item.title,
    conceptType: item.concept_type,
    hook: item.hook,
    creatorDirection: item.creator_direction,
    masterPrompt: item.master_prompt,
    negativePrompt: item.negative_prompt,
    durationSeconds: item.duration_seconds,
    aspectRatio: item.aspect_ratio,
    modelFamilyId: getKieVideoModelFamily(item.model_family_id).id,
    stylePresetId: item.style_preset_id,
    motionPresetId: item.motion_preset_id,
    continuityAnchors: jsonStringArray(item.continuity_anchors),
    productionNotes: jsonStringArray(item.production_notes),
    status: item.status as CampaignBatchItem["status"],
    taskId: item.task_id,
    traceId: item.trace_id,
    url: item.output_url,
    error: item.error,
  }))
}

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
  const [storyboardItems, setStoryboardItems] = useState<StoryboardItem[]>([])
  const [activeTab, setActiveTab] = useState<"builder" | "storyboard">("builder")
  const [continuityEnabled, setContinuityEnabled] = useState(false)
  const [continuityLocks, setContinuityLocks] = useState<Record<ContinuityKey, boolean>>({
    character: false,
    wardrobe: false,
    location: false,
    lighting: false,
    colorGrade: false,
    cameraStyle: false,
  })
  const [continuityValues, setContinuityValues] = useState<Record<ContinuityKey, string>>({
    character: "",
    wardrobe: "",
    location: "",
    lighting: "",
    colorGrade: "",
    cameraStyle: "",
  })
  const [activeSavedClipId, setActiveSavedClipId] = useState<string | null>(null)
  const [downloadName, setDownloadName] = useState<string>("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)
  const [isSavingOutput, setIsSavingOutput] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const generationSnapshotRef = useRef<GenerationSnapshot | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [draggingStoryboardId, setDraggingStoryboardId] = useState<string | null>(null)
  const [storyboardGroupFilter, setStoryboardGroupFilter] = useState<"All" | "Scene A" | "Scene B" | "Scene C">("All")
  const [styleSearch, setStyleSearch] = useState("")
  const [motionSearch, setMotionSearch] = useState("")
  const [favoriteStyleIds, setFavoriteStyleIds] = useState<string[]>([])
  const [favoriteMotionIds, setFavoriteMotionIds] = useState<string[]>([])
  const [recentStyleIds, setRecentStyleIds] = useState<string[]>([])
  const [recentMotionIds, setRecentMotionIds] = useState<string[]>([])
  const [showAllStyleChips, setShowAllStyleChips] = useState(false)
  const [showAllMotionChips, setShowAllMotionChips] = useState(false)
  const [isStoryboardLoading, setIsStoryboardLoading] = useState(false)
  const [isStoryboardSyncing, setIsStoryboardSyncing] = useState(false)
  const [storyboardSource, setStoryboardSource] = useState<"local" | "scene">("local")
  const [destinationMode, setDestinationMode] = useState<"append" | "create_scene" | "replace_shot">("append")
  const [newSceneName, setNewSceneName] = useState("")
  const [replaceShotId, setReplaceShotId] = useState("")
  const [sceneShotOptions, setSceneShotOptions] = useState<SceneShotOption[]>([])
  const [isSceneShotsLoading, setIsSceneShotsLoading] = useState(false)
  const [isRoutingOutput, setIsRoutingOutput] = useState(false)
  const [campaignBrief, setCampaignBrief] = useState("")
  const [campaignAssetCount, setCampaignAssetCount] = useState(3)
  const [campaignPlan, setCampaignPlan] = useState<StudioAdCampaignPlan | null>(null)
  const [campaignItems, setCampaignItems] = useState<CampaignBatchItem[]>([])
  const [isPlanningCampaign, setIsPlanningCampaign] = useState(false)
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false)
  const [campaignEngineModel, setCampaignEngineModel] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [campaignHistory, setCampaignHistory] = useState<StudioAdCampaignWithItems[]>([])
  const [isCampaignHistoryLoading, setIsCampaignHistoryLoading] = useState(false)
  const [isAddingCampaignToStoryboard, setIsAddingCampaignToStoryboard] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "")
  const [selectedSceneId, setSelectedSceneId] = useState<string>(projects[0]?.scenes[0]?.id || "")

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  )
  const selectedScene = useMemo(
    () => selectedProject?.scenes.find((scene) => scene.id === selectedSceneId) || null,
    [selectedProject, selectedSceneId]
  )
  const hasStoryboardDestination = Boolean(selectedProjectId && selectedSceneId)

  const activeModelFamily = useMemo(() => getKieVideoModelFamily(modelFamilyId), [modelFamilyId])
  const continuityClause = useMemo(() => {
    if (!continuityEnabled) return ""
    const locked = CONTINUITY_LOCKS.filter((item) => continuityLocks[item.key])
    if (locked.length === 0) return ""

    const parts = locked.map((item) => {
      const value = continuityValues[item.key]?.trim()
      if (!value) return `${item.label.toLowerCase()} consistency`
      return `${item.label.toLowerCase()}: ${value}`
    })
    return `continuity locks -> ${parts.join(", ")}`
  }, [continuityEnabled, continuityLocks, continuityValues])

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

  const filteredStyles = useMemo(() => {
    const q = styleSearch.trim().toLowerCase()
    if (!q) return STYLE_PRESETS
    return STYLE_PRESETS.filter((preset) => preset.name.toLowerCase().includes(q))
  }, [styleSearch])

  const filteredMotions = useMemo(() => {
    const q = motionSearch.trim().toLowerCase()
    if (!q) return MOTION_PRESETS
    return MOTION_PRESETS.filter((preset) => preset.name.toLowerCase().includes(q))
  }, [motionSearch])

  const styleChipList = useMemo(() => {
    const recent = filteredStyles.filter((preset) => recentStyleIds.includes(preset.id))
    const favorites = filteredStyles.filter((preset) => favoriteStyleIds.includes(preset.id) && !recentStyleIds.includes(preset.id))
    const rest = filteredStyles.filter((preset) => !recentStyleIds.includes(preset.id) && !favoriteStyleIds.includes(preset.id))
    const merged = [...recent, ...favorites, ...rest]
    return showAllStyleChips ? merged : merged.slice(0, 5)
  }, [favoriteStyleIds, filteredStyles, recentStyleIds, showAllStyleChips])

  const motionChipList = useMemo(() => {
    const recent = filteredMotions.filter((preset) => recentMotionIds.includes(preset.id))
    const favorites = filteredMotions.filter((preset) => favoriteMotionIds.includes(preset.id) && !recentMotionIds.includes(preset.id))
    const rest = filteredMotions.filter((preset) => !recentMotionIds.includes(preset.id) && !favoriteMotionIds.includes(preset.id))
    const merged = [...recent, ...favorites, ...rest]
    return showAllMotionChips ? merged : merged.slice(0, 5)
  }, [favoriteMotionIds, filteredMotions, recentMotionIds, showAllMotionChips])

  const filteredStoryboardItems = useMemo(() => {
    if (storyboardGroupFilter === "All") return storyboardItems
    return storyboardItems.filter((item) => item.sceneGroup === storyboardGroupFilter)
  }, [storyboardGroupFilter, storyboardItems])

  const storyboardRuntime = useMemo(() => {
    return storyboardItems.reduce((sum, item) => sum + (item.durationSeconds || 0), 0)
  }, [storyboardItems])

  const storyboardGroupRuntime = useMemo(() => {
    return {
      "Scene A": storyboardItems
        .filter((item) => item.sceneGroup === "Scene A")
        .reduce((sum, item) => sum + (item.durationSeconds || 0), 0),
      "Scene B": storyboardItems
        .filter((item) => item.sceneGroup === "Scene B")
        .reduce((sum, item) => sum + (item.durationSeconds || 0), 0),
      "Scene C": storyboardItems
        .filter((item) => item.sceneGroup === "Scene C")
        .reduce((sum, item) => sum + (item.durationSeconds || 0), 0),
    }
  }, [storyboardItems])

  const handleLoadClip = (clip: SavedFastClip) => {
    setActiveSavedClipId(clip.id)
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

  const applyStylePreset = (id: string) => {
    setStylePresetId(id)
    setRecentStyleIds((prev) => [id, ...prev.filter((entry) => entry !== id)].slice(0, 20))
  }

  const applyMotionPreset = (id: string) => {
    setMotionPresetId(id)
    setRecentMotionIds((prev) => [id, ...prev.filter((entry) => entry !== id)].slice(0, 20))
  }

  const toggleFavoriteStyle = (id: string) => {
    setFavoriteStyleIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [id, ...prev].slice(0, 20)))
  }

  const toggleFavoriteMotion = (id: string) => {
    setFavoriteMotionIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [id, ...prev].slice(0, 20)))
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
        storyboardItems?: StoryboardItem[]
        continuityEnabled?: boolean
        continuityLocks?: Record<ContinuityKey, boolean>
        continuityValues?: Record<ContinuityKey, string>
        favoriteStyleIds?: string[]
        favoriteMotionIds?: string[]
        recentStyleIds?: string[]
        recentMotionIds?: string[]
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
      if (Array.isArray(parsed.storyboardItems)) {
        setStoryboardItems(normalizeStoryboardItems(parsed.storyboardItems))
        setStoryboardSource("local")
      }
      if (typeof parsed.continuityEnabled === "boolean") setContinuityEnabled(parsed.continuityEnabled)
      if (parsed.continuityLocks) setContinuityLocks((prev) => ({ ...prev, ...parsed.continuityLocks }))
      if (parsed.continuityValues) setContinuityValues((prev) => ({ ...prev, ...parsed.continuityValues }))
      if (Array.isArray(parsed.favoriteStyleIds)) setFavoriteStyleIds(parsed.favoriteStyleIds.slice(0, 20))
      if (Array.isArray(parsed.favoriteMotionIds)) setFavoriteMotionIds(parsed.favoriteMotionIds.slice(0, 20))
      if (Array.isArray(parsed.recentStyleIds)) setRecentStyleIds(parsed.recentStyleIds.slice(0, 20))
      if (Array.isArray(parsed.recentMotionIds)) setRecentMotionIds(parsed.recentMotionIds.slice(0, 20))
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
          storyboardItems: storyboardItems.slice(0, 60),
          continuityEnabled,
          continuityLocks,
          continuityValues,
          favoriteStyleIds: favoriteStyleIds.slice(0, 20),
          favoriteMotionIds: favoriteMotionIds.slice(0, 20),
          recentStyleIds: recentStyleIds.slice(0, 20),
          recentMotionIds: recentMotionIds.slice(0, 20),
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
    storyboardItems,
    continuityEnabled,
    continuityLocks,
    continuityValues,
    favoriteStyleIds,
    favoriteMotionIds,
    recentStyleIds,
    recentMotionIds,
  ])

  useEffect(() => {
    if (!hasStoryboardDestination) {
      setStoryboardSource("local")
      return
    }

    let cancelled = false

    const loadStoryboard = async () => {
      setIsStoryboardLoading(true)
      try {
        const res = await getFastVideoStoryboard(selectedSceneId)
        if (cancelled) return

        if (res.error) {
          setStoryboardSource("local")
          toast.error(res.error)
          return
        }

        setStoryboardItems((res.data || []).map(mapRemoteStoryboardItem))
        setStoryboardSource("scene")
      } catch (error: unknown) {
        if (!cancelled) {
          setStoryboardSource("local")
          toast.error(error instanceof Error ? error.message : "Failed to load storyboard")
        }
      } finally {
        if (!cancelled) {
          setIsStoryboardLoading(false)
        }
      }
    }

    void loadStoryboard()

    return () => {
      cancelled = true
    }
  }, [hasStoryboardDestination, selectedSceneId])

  const persistStoryboardItems = async (nextItems: StoryboardItem[], opts?: { successMessage?: string; suppressSuccess?: boolean }) => {
    if (!hasStoryboardDestination) {
      setStoryboardSource("local")
      return true
    }

    setIsStoryboardSyncing(true)
    try {
      const payload = normalizeStoryboardItems(nextItems)
      const res = await replaceFastVideoStoryboard({
        projectId: selectedProjectId,
        sceneId: selectedSceneId,
        items: payload.map((item) => ({
          id: item.id,
          sourceClipId: item.sourceClipId,
          url: item.url,
          subject: item.subject,
          prompt: item.prompt,
          durationSeconds: item.durationSeconds,
          modelFamilyId: item.modelFamilyId,
          sceneGroup: item.sceneGroup,
          note: item.note,
          status: item.status,
          createdAt: item.createdAt,
        })),
      })

      if (res.error) {
        toast.error(res.error)
        return false
      }

      setStoryboardSource("scene")
      if (opts?.successMessage && !opts.suppressSuccess) {
        toast.success(opts.successMessage)
      }
      return true
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to sync storyboard")
      return false
    } finally {
      setIsStoryboardSyncing(false)
    }
  }

  const saveClip = (clip: SavedFastClip) => {
    setSavedClips((prev) => {
      const dedup = prev.filter((item) => item.id !== clip.id && !(item.taskId && clip.taskId && item.taskId === clip.taskId) && item.url !== clip.url)
      return [clip, ...dedup].slice(0, 24)
    })
  }

  // Provider URLs expire; upgrade a saved clip to a durable storage URL in the
  // background so the scratch list keeps playing after expiry. Best-effort.
  const persistClipMedia = useCallback(async (clipId: string, url: string) => {
    if (!url || url.includes("/storage/v1/object/public/renders/")) return
    try {
      const res = await persistFastVideoMedia(url)
      const durable = res.data?.url
      if (!durable || durable === url) return
      setSavedClips((prev) => prev.map((item) => (item.id === clipId ? { ...item, url: durable } : item)))
      setVideoUrl((prev) => (prev === url ? durable : prev))
    } catch {
      // keep the temp URL; preview players already fall back gracefully
    }
  }, [])

  const addToStoryboard = (input: {
    sourceClipId?: string | null
    url: string
    subject: string
    prompt: string
    durationSeconds: number
    modelFamilyId?: KieVideoModelFamilyId
  }) => {
    if (!input.url) {
      toast.error("No media available to add")
      return
    }
    const item: StoryboardItem = {
      id: crypto.randomUUID(),
      sourceClipId: input.sourceClipId ?? null,
      url: input.url,
      subject: input.subject || "Storyboard shot",
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      modelFamilyId: input.modelFamilyId,
      sceneGroup: "Scene A",
      note: "",
      status: "ready",
      createdAt: new Date().toISOString(),
    }
    const nextItems = normalizeStoryboardItems([item, ...storyboardItems])
    setStoryboardItems(nextItems)
    setActiveTab("storyboard")
    void persistStoryboardItems(nextItems, {
      successMessage: hasStoryboardDestination ? "Added to storyboard and synced" : "Added to storyboard",
    })
    if (!hasStoryboardDestination) {
      toast.success("Added to storyboard")
    }
  }

  const updateStoryboardNote = (id: string, note: string) => {
    setStoryboardItems((prev) => prev.map((item) => (item.id === id ? { ...item, note } : item)))
  }

  const saveStoryboardNote = async (id: string) => {
    const nextItems = normalizeStoryboardItems(
      storyboardItems.map((item) => (item.id === id ? { ...item, note: item.note.trim() } : item))
    )
    setStoryboardItems(nextItems)
    const synced = await persistStoryboardItems(nextItems, { suppressSuccess: true })
    if (synced) {
      toast.success("Director note saved")
    }
  }

  const removeStoryboardItem = (id: string) => {
    const nextItems = storyboardItems.filter((item) => item.id !== id)
    setStoryboardItems(nextItems)
    void persistStoryboardItems(nextItems, {
      successMessage: hasStoryboardDestination ? "Shot removed and storyboard synced" : "Shot removed",
    })
    if (!hasStoryboardDestination) {
      toast.success("Shot removed")
    }
  }

  const duplicateStoryboardItem = (id: string) => {
    const target = storyboardItems.find((item) => item.id === id)
    if (!target) return
    const duplicate: StoryboardItem = {
      ...target,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    const nextItems = normalizeStoryboardItems([duplicate, ...storyboardItems])
    setStoryboardItems(nextItems)
    void persistStoryboardItems(nextItems, {
      successMessage: hasStoryboardDestination ? "Shot duplicated and synced" : "Shot duplicated",
    })
    if (!hasStoryboardDestination) {
      toast.success("Shot duplicated")
    }
  }

  const updateStoryboardGroup = (id: string, sceneGroup: "Scene A" | "Scene B" | "Scene C") => {
    const nextItems = storyboardItems.map((item) => (item.id === id ? { ...item, sceneGroup } : item))
    setStoryboardItems(nextItems)
    void persistStoryboardItems(nextItems, { suppressSuccess: true })
  }

  const reorderStoryboardItems = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const from = storyboardItems.findIndex((entry) => entry.id === draggedId)
    const to = storyboardItems.findIndex((entry) => entry.id === targetId)
    if (from < 0 || to < 0) return

    const nextItems = [...storyboardItems]
    const [moved] = nextItems.splice(from, 1)
    nextItems.splice(to, 0, moved)
    const normalized = normalizeStoryboardItems(nextItems)
    setStoryboardItems(normalized)
    void persistStoryboardItems(normalized, { suppressSuccess: true })
  }

  const clearStoryboardGroup = (group: "Scene A" | "Scene B" | "Scene C") => {
    const count = storyboardItems.filter((item) => item.sceneGroup === group).length
    if (count === 0) {
      toast.message(`No shots in ${group}`)
      return
    }
    const nextItems = storyboardItems.filter((item) => item.sceneGroup !== group)
    setStoryboardItems(nextItems)
    void persistStoryboardItems(nextItems, {
      successMessage: hasStoryboardDestination
        ? `Cleared ${count} shot(s) from ${group} and synced`
        : `Cleared ${count} shot(s) from ${group}`,
    })
    if (!hasStoryboardDestination) {
      toast.success(`Cleared ${count} shot(s) from ${group}`)
    }
  }

  const duplicateStoryboardGroupToNext = (group: "Scene A" | "Scene B" | "Scene C") => {
    const cycle: Array<"Scene A" | "Scene B" | "Scene C"> = ["Scene A", "Scene B", "Scene C"]
    const currentIndex = cycle.indexOf(group)
    const targetGroup = cycle[(currentIndex + 1) % cycle.length]
    const source = storyboardItems.filter((item) => item.sceneGroup === group)
    if (source.length === 0) {
      toast.message(`No shots in ${group} to duplicate`)
      return
    }

    const duplicates = source.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      sceneGroup: targetGroup,
      createdAt: new Date().toISOString(),
    }))
    const nextItems = normalizeStoryboardItems([...duplicates, ...storyboardItems])
    setStoryboardItems(nextItems)
    void persistStoryboardItems(nextItems, {
      successMessage: hasStoryboardDestination
        ? `Duplicated ${source.length} shot(s) from ${group} to ${targetGroup} and synced`
        : `Duplicated ${source.length} shot(s) from ${group} to ${targetGroup}`,
    })
    if (!hasStoryboardDestination) {
      toast.success(`Duplicated ${source.length} shot(s) from ${group} to ${targetGroup}`)
    }
  }

  const copyStoryboardGroupShotList = async (group: "Scene A" | "Scene B" | "Scene C") => {
    const source = storyboardItems.filter((item) => item.sceneGroup === group)
    if (source.length === 0) {
      toast.message(`No shots in ${group}`)
      return
    }
    const lines = source.map((item, index) => {
      const note = item.note.trim() ? ` | Note: ${item.note.trim()}` : ""
      return `${index + 1}. ${item.subject || "Storyboard shot"} (${item.durationSeconds}s)${note}`
    })
    const payload = `${group} Shot List\n${lines.join("\n")}`
    try {
      await navigator.clipboard.writeText(payload)
      toast.success(`${group} shot list copied`)
    } catch {
      toast.error("Failed to copy shot list")
    }
  }

  const updateCampaignItem = (id: string, updates: Partial<CampaignBatchItem>) => {
    setCampaignItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
  }

  const persistCampaignItem = async (item: CampaignBatchItem, updates: Partial<CampaignBatchItem>) => {
    const itemId = item.dbId || item.id
    const res = await updateStudioAdCampaignItem({
      itemId,
      status: updates.status,
      taskId: "taskId" in updates ? updates.taskId ?? null : undefined,
      traceId: "traceId" in updates ? updates.traceId ?? null : undefined,
      outputUrl: "url" in updates ? updates.url ?? null : undefined,
      error: "error" in updates ? updates.error ?? null : undefined,
      masterPrompt: updates.masterPrompt,
      durationSeconds: updates.durationSeconds,
    })
    if (res.error) {
      toast.error(res.error)
    }
  }

  const loadCampaignHistory = useCallback(async () => {
    setIsCampaignHistoryLoading(true)
    try {
      const res = await listStudioAdCampaigns(selectedProjectId || null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setCampaignHistory(res.data || [])
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to load campaigns")
    } finally {
      setIsCampaignHistoryLoading(false)
    }
  }, [selectedProjectId])

  useEffect(() => {
    void loadCampaignHistory()
  }, [loadCampaignHistory])

  const openCampaign = (campaign: StudioAdCampaignWithItems) => {
    setCampaignId(campaign.id)
    setCampaignBrief(campaign.brief)
    setCampaignAssetCount(campaign.asset_count)
    setCampaignPlan(mapCampaignRowToPlan(campaign))
    setCampaignItems(mapCampaignRowToItems(campaign))
    setCampaignEngineModel(campaign.engine_model)
    setAspectRatio(
      FAST_VIDEO_ASPECT_RATIOS.includes(campaign.aspect_ratio as FastVideoAspectRatio)
        ? (campaign.aspect_ratio as FastVideoAspectRatio)
        : aspectRatio
    )
    setDurationSeconds(campaign.duration_seconds)
    toast.success("Campaign loaded")
  }

  const handlePlanCampaign = async () => {
    const brief = campaignBrief.trim() || subject.trim()
    if (brief.length < 8) {
      toast.error("Add a short campaign brief first")
      return
    }

    setIsPlanningCampaign(true)
    try {
      const response = await fetch("/api/ad/direct-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIntent: brief,
          assetCount: campaignAssetCount,
          outputType: "video",
          providerTarget: "kie",
          campaignType: "ugc",
          aspectRatio,
          durationSeconds,
          context: {
            projectId: selectedProjectId || undefined,
            sceneId: selectedSceneId || undefined,
            generationModelHint: activeModelFamily.label,
          },
          currentPromptContext: subject.trim() || undefined,
          continuityAnchors: continuityClause ? [continuityClause] : [],
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: StudioAdCampaignPlan; engine?: { model?: string } }
        | { ok: false; error?: string }
        | null

      if (!response.ok || !payload || !("ok" in payload) || !payload.ok) {
        const message = payload && "error" in payload ? payload.error : "Campaign planning failed"
        toast.error(message || "Campaign planning failed")
        return
      }

      setCampaignPlan(payload.data)
      setCampaignEngineModel(payload.engine?.model || null)
      const localItems: CampaignBatchItem[] = payload.data.deliverables.map((item) => ({
          ...item,
          status: "planned",
          taskId: null,
          traceId: null,
          url: null,
          error: null,
        }))
      setCampaignItems(localItems)

      const saved = await createStudioAdCampaign({
        projectId: selectedProjectId || null,
        sceneId: selectedSceneId || null,
        brief,
        plan: payload.data,
        assetCount: campaignAssetCount,
        aspectRatio,
        durationSeconds,
        engineModel: payload.engine?.model || null,
      })

      if (saved.error || !saved.data) {
        setCampaignId(null)
        toast.error(saved.error || "Campaign planned but not saved")
        return
      }

      setCampaignId(saved.data.id)
      setCampaignItems(mapCampaignRowToItems(saved.data))
      await loadCampaignHistory()
      toast.success("Campaign plan saved")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Campaign planning failed")
    } finally {
      setIsPlanningCampaign(false)
    }
  }

  const handleUseCampaignItem = (item: CampaignBatchItem) => {
    const safeAspectRatio = FAST_VIDEO_ASPECT_RATIOS.includes(item.aspectRatio as FastVideoAspectRatio)
      ? (item.aspectRatio as FastVideoAspectRatio)
      : aspectRatio
    setSubject(item.masterPrompt)
    setDurationSeconds(item.durationSeconds)
    setAspectRatio(safeAspectRatio)
    setModelFamilyId(item.modelFamilyId)
    toast.success("Campaign prompt loaded into Shot Builder")
  }

  const startCampaignItemGeneration = async (item: CampaignBatchItem) => {
    updateCampaignItem(item.id, { status: "queued", error: null })
    void persistCampaignItem(item, { status: "queued", error: null })
    const selectedModel = resolveKieVideoModelByFamily({
      familyId: item.modelFamilyId,
      useImageToVideo: Boolean(referenceImageUrl),
    })
    const safeAspectRatio = FAST_VIDEO_ASPECT_RATIOS.includes(item.aspectRatio as FastVideoAspectRatio)
      ? (item.aspectRatio as FastVideoAspectRatio)
      : aspectRatio

    const res = await generateFastVideo({
      request_type: "fast_video",
      project_id: selectedProjectId || null,
      prompt_inputs: {
        text_subject: item.masterPrompt,
        style_preset_id: item.stylePresetId || stylePresetId || null,
        motion_preset_id: item.motionPresetId || motionPresetId || null,
        aspect_ratio: safeAspectRatio,
        reference_image: referenceImageUrl || null,
        variation_setting: variation,
      },
      settings: {
        duration_seconds: item.durationSeconds,
        model: selectedModel,
      },
    })

    if (res.error || !res.data) {
      updateCampaignItem(item.id, { status: "failed", error: res.error || "Generation failed" })
      void persistCampaignItem(item, { status: "failed", error: res.error || "Generation failed" })
      return
    }

    const initialDebug = (res.data as { debug?: { traceId?: string } }).debug
    const appliedDuration = typeof res.data.durationSeconds === "number" ? res.data.durationSeconds : item.durationSeconds
    const resolvedPrompt = res.data.prompt || item.masterPrompt

    if (res.data.url && res.data.status === "completed") {
      const clip: SavedFastClip = {
        id: crypto.randomUUID(),
        taskId: res.data.taskId || null,
        url: res.data.url,
        subject: item.title,
        prompt: resolvedPrompt,
        aspectRatio: safeAspectRatio,
        variation,
        durationSeconds: appliedDuration,
        modelFamilyId: item.modelFamilyId,
        createdAt: new Date().toISOString(),
      }
      saveClip(clip)
      updateCampaignItem(item.id, { status: "completed", url: res.data.url, taskId: res.data.taskId || null, error: null })
      void persistCampaignItem(item, {
        status: "completed",
        url: res.data.url,
        taskId: res.data.taskId || null,
        error: null,
        masterPrompt: resolvedPrompt,
        durationSeconds: appliedDuration,
      })
      return
    }

    if (!res.data.taskId) {
      updateCampaignItem(item.id, { status: "failed", error: "Provider did not return a task id" })
      void persistCampaignItem(item, { status: "failed", error: "Provider did not return a task id" })
      return
    }

    const processingUpdate: Partial<CampaignBatchItem> = {
      status: "processing",
      taskId: res.data.taskId,
      traceId: initialDebug?.traceId || null,
      error: null,
      durationSeconds: appliedDuration,
      masterPrompt: resolvedPrompt,
    }
    updateCampaignItem(item.id, processingUpdate)
    void persistCampaignItem(item, processingUpdate)
  }

  const handleGenerateCampaign = async () => {
    const planned = campaignItems.filter((item) => item.status === "planned" || item.status === "failed")
    if (planned.length === 0) {
      toast.message("No planned campaign videos to generate")
      return
    }

    setIsGeneratingCampaign(true)
    try {
      for (const item of planned) {
        await startCampaignItemGeneration(item)
      }
      toast.success("Campaign generation started")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Campaign generation failed")
    } finally {
      setIsGeneratingCampaign(false)
    }
  }

  const handleRetryCampaignItem = async (item: CampaignBatchItem) => {
    setIsGeneratingCampaign(true)
    try {
      await startCampaignItemGeneration(item)
    } finally {
      setIsGeneratingCampaign(false)
    }
  }

  const handleCopyCampaignPrompt = async (item: CampaignBatchItem) => {
    try {
      await navigator.clipboard.writeText(item.masterPrompt)
      toast.success("Campaign prompt copied")
    } catch {
      toast.error("Failed to copy prompt")
    }
  }

  const handleAddCampaignItemToStoryboard = (item: CampaignBatchItem) => {
    if (!item.url) {
      toast.error("Generate this campaign video first")
      return
    }
    addToStoryboard({
      sourceClipId: item.taskId || item.id,
      url: item.url,
      subject: item.title,
      prompt: item.masterPrompt,
      durationSeconds: item.durationSeconds,
      modelFamilyId: item.modelFamilyId,
    })
  }

  const handleAddCampaignToStoryboard = async () => {
    const completed = campaignItems.filter((item) => item.status === "completed" && item.url)
    if (completed.length === 0) {
      toast.error("No completed campaign videos to add")
      return
    }

    setIsAddingCampaignToStoryboard(true)
    try {
      const additions: StoryboardItem[] = completed.map((item, index) => ({
        id: crypto.randomUUID(),
        sourceClipId: item.taskId || item.id,
        url: item.url || "",
        subject: item.title,
        prompt: item.masterPrompt,
        durationSeconds: item.durationSeconds,
        modelFamilyId: item.modelFamilyId,
        sceneGroup: (["Scene A", "Scene B", "Scene C"] as const)[index % 3],
        note: item.hook,
        status: "ready",
        createdAt: new Date().toISOString(),
      }))
      const nextItems = normalizeStoryboardItems([...additions, ...storyboardItems])
      setStoryboardItems(nextItems)
      setActiveTab("storyboard")
      await persistStoryboardItems(nextItems, {
        successMessage: hasStoryboardDestination ? "Campaign added to storyboard and synced" : "Campaign added to storyboard",
      })
      if (!hasStoryboardDestination) {
        toast.success("Campaign added to storyboard")
      }
    } finally {
      setIsAddingCampaignToStoryboard(false)
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    const res = await deleteStudioAdCampaign(id)
    if (res.error) {
      toast.error(res.error)
      return
    }
    if (campaignId === id) {
      setCampaignId(null)
      setCampaignPlan(null)
      setCampaignItems([])
    }
    await loadCampaignHistory()
    toast.success("Campaign deleted")
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
    if (destinationMode !== "replace_shot" || !selectedSceneId) {
      setSceneShotOptions([])
      setReplaceShotId("")
      return
    }

    let cancelled = false

    const loadSceneShots = async () => {
      setIsSceneShotsLoading(true)
      try {
        const res = await getShots(selectedSceneId)
        if (cancelled) return
        if (res.error) {
          toast.error(res.error)
          setSceneShotOptions([])
          return
        }

        const options = (res.data || []).map((shot) => ({
          id: shot.id,
          name: shot.name,
        }))
        setSceneShotOptions(options)
        setReplaceShotId((current) => (options.some((shot) => shot.id === current) ? current : options[0]?.id || ""))
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load scene shots")
          setSceneShotOptions([])
        }
      } finally {
        if (!cancelled) {
          setIsSceneShotsLoading(false)
        }
      }
    }

    void loadSceneShots()

    return () => {
      cancelled = true
    }
  }, [destinationMode, selectedSceneId])

  useEffect(() => {
    const activeItems = campaignItems.filter((item) => item.status === "processing" && item.taskId)
    if (activeItems.length === 0) return

    let cancelled = false
    let inFlight = false

    const interval = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      try {
        await Promise.all(
          activeItems.map(async (item) => {
            if (!item.taskId) return
            const res = await pollFastVideoStatus(item.taskId, item.traceId || undefined)
            if (cancelled) return

            if (res.error) {
              updateCampaignItem(item.id, { status: "failed", error: res.error })
              void persistCampaignItem(item, { status: "failed", error: res.error })
              return
            }

            const nextStatus = res.data?.status
            const nextUrl = res.data?.url || null

            if (nextStatus === "completed" && nextUrl) {
              const safeAspectRatio = FAST_VIDEO_ASPECT_RATIOS.includes(item.aspectRatio as FastVideoAspectRatio)
                ? (item.aspectRatio as FastVideoAspectRatio)
                : aspectRatio
              const clip: SavedFastClip = {
                id: crypto.randomUUID(),
                taskId: item.taskId,
                url: nextUrl,
                subject: item.title,
                prompt: item.masterPrompt,
                aspectRatio: safeAspectRatio,
                variation,
                durationSeconds: item.durationSeconds,
                modelFamilyId: item.modelFamilyId,
                createdAt: new Date().toISOString(),
              }
              saveClip(clip)
              updateCampaignItem(item.id, { status: "completed", url: nextUrl, error: null })
              void persistCampaignItem(item, { status: "completed", url: nextUrl, error: null })
            } else if (nextStatus === "failed") {
              updateCampaignItem(item.id, { status: "failed", error: res.data?.error || "Generation failed" })
              void persistCampaignItem(item, { status: "failed", error: res.data?.error || "Generation failed" })
            }
          })
        )
      } finally {
        inFlight = false
      }
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [aspectRatio, campaignItems, variation])

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
          const snapshot = generationSnapshotRef.current
          if (!snapshot) {
            setStatus("failed")
            setStatusMessage("Generation state was lost before completion. Please run it again.")
            clearInterval(interval)
            return
          }
          setStatus("completed")
          setStatusMessage("Complete")
          setVideoUrl(nextUrl)
          setUseDirectVideoUrl(false)
          const completedClipId = crypto.randomUUID()
          saveClip({
            id: completedClipId,
            taskId,
            url: nextUrl,
            subject: snapshot.subject,
            prompt: snapshot.prompt,
            aspectRatio: snapshot.aspectRatio,
            variation: snapshot.variation,
            durationSeconds: snapshot.durationSeconds,
            modelFamilyId: snapshot.modelFamilyId,
            createdAt: new Date().toISOString(),
          })
          void persistClipMedia(completedClipId, nextUrl)
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
  }, [taskId, status, traceId, persistClipMedia])

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
    setActiveSavedClipId(null)

    const selectedModel = resolveKieVideoModelByFamily({
      familyId: modelFamilyId,
      useImageToVideo: Boolean(referenceImageUrl),
    })

    const subjectWithContinuity = continuityClause
      ? `${subject.trim()}, ${continuityClause}`
      : subject.trim()

    generationSnapshotRef.current = {
      subject: subject.trim(),
      prompt: subjectWithContinuity,
      aspectRatio,
      variation,
      durationSeconds,
      modelFamilyId,
    }

    try {
      const res = await generateFastVideo({
        request_type: "fast_video",
        project_id: selectedProjectId || null,
        prompt_inputs: {
          text_subject: subjectWithContinuity,
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

      if (res.error || !res.data) {
        setStatus("failed")
        setStatusMessage(res.error || "Generation failed")
        toast.error(res.error || "Generation failed")
        return
      }

      const appliedDuration =
        typeof res.data.durationSeconds === "number" ? res.data.durationSeconds : durationSeconds
      const resolvedPrompt = res.data.prompt || subjectWithContinuity

      generationSnapshotRef.current = {
        subject: subject.trim(),
        prompt: resolvedPrompt,
        aspectRatio,
        variation,
        durationSeconds: appliedDuration,
        modelFamilyId,
      }

      setFinalPrompt(resolvedPrompt)
      if (appliedDuration !== durationSeconds) {
        setDurationSeconds(appliedDuration)
        toast.message(`Model adjusted duration to ${appliedDuration}s for compatibility.`)
      }
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
        const completedClipId = crypto.randomUUID()
        saveClip({
          id: completedClipId,
          taskId: res.data.taskId || null,
          url: res.data.url,
          subject: subject.trim(),
          prompt: resolvedPrompt,
          aspectRatio,
          variation,
          durationSeconds: appliedDuration,
          modelFamilyId,
          createdAt: new Date().toISOString(),
        })
        void persistClipMedia(completedClipId, res.data.url)
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Generation failed"
      setStatus("failed")
      setStatusMessage(message)
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const deliverOutputToDestination = async ({
    payload,
    shouldRedirect,
    successMessage,
  }: {
    payload: {
      subject: string
      finalPrompt: string
      outputUrl: string
      aspectRatio: string
      durationSeconds: number
      variationSetting: FastVideoVariation
    }
    shouldRedirect?: boolean
    successMessage: string
  }) => {
    if (!payload.outputUrl) {
      toast.error("Generate a video first")
      return false
    }
    if (!selectedProjectId) {
      toast.error("Select a project")
      return false
    }
    if (destinationMode !== "create_scene" && !selectedSceneId) {
      toast.error("Select a destination scene")
      return false
    }
    if (destinationMode === "create_scene" && !newSceneName.trim()) {
      toast.error("Add a name for the new scene")
      return false
    }
    if (destinationMode === "replace_shot" && !replaceShotId) {
      toast.error("Select a shot to replace")
      return false
    }

    setIsRoutingOutput(true)
    try {
      const res = await routeFastVideoToScene({
        mode: destinationMode,
        projectId: selectedProjectId,
        sceneId: destinationMode === "create_scene" ? null : selectedSceneId,
        targetShotId: destinationMode === "replace_shot" ? replaceShotId : null,
        newSceneName: destinationMode === "create_scene" ? newSceneName.trim() : null,
        subject: payload.subject,
        finalPrompt: payload.finalPrompt,
        outputUrl: payload.outputUrl,
        aspectRatio: payload.aspectRatio,
        durationSeconds: payload.durationSeconds,
        stylePresetId: stylePresetId || null,
        motionPresetId: motionPresetId || null,
        variationSetting: payload.variationSetting,
        name: `Fast Track - ${payload.subject.slice(0, 30)}`,
      })

      if (res.error || !res.data) {
        toast.error(res.error || "Failed to promote")
        return false
      }

      toast.success(successMessage)
      if (shouldRedirect) {
        router.push(`/dashboard/projects/${res.data.projectId}/scenes/${res.data.sceneId}`)
      }
      return true
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to route output")
      return false
    } finally {
      setIsRoutingOutput(false)
    }
  }

  const handlePromote = async () => {
    setIsPromoting(true)
    try {
      await deliverOutputToDestination({
        payload: {
          subject,
          finalPrompt: finalPrompt || subject,
          outputUrl: videoUrl || "",
          aspectRatio,
          durationSeconds,
          variationSetting: variation,
        },
        shouldRedirect: true,
        successMessage:
          destinationMode === "append"
            ? "Added to storyboard scene"
            : destinationMode === "create_scene"
              ? "Created a new scene and added the shot"
              : "Replaced the selected shot",
      })
    } finally {
      setIsPromoting(false)
    }
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

    if (!selectedProjectId || (destinationMode !== "create_scene" && !selectedSceneId)) {
      toast.success("Saved output locally")
      return
    }

    setIsSavingOutput(true)
    try {
      await deliverOutputToDestination({
        payload: {
          subject,
          finalPrompt: finalPrompt || subject,
          outputUrl: videoUrl,
          aspectRatio,
          durationSeconds,
          variationSetting: variation,
        },
        successMessage:
          destinationMode === "append"
            ? "Saved to selected scene and gallery"
            : destinationMode === "create_scene"
              ? "Saved to a new scene and gallery"
              : "Saved by replacing the selected shot",
      })
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save output")
    } finally {
      setIsSavingOutput(false)
    }
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
    generationSnapshotRef.current = null
  }

  const handleClearAllClips = () => {
    setSavedClips([])
    setActiveSavedClipId(null)
    toast.success("Saved clips cleared")
  }

  const handleDeleteClip = (id: string) => {
    setSavedClips((prev) => prev.filter((clip) => clip.id !== id))
    setActiveSavedClipId((prev) => (prev === id ? null : prev))
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

  const setupCardClass =
    "rounded-2xl border border-white/[0.06] bg-[#0c0c0e]/90 text-white shadow-[0_32px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-sm lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto h-fit"
  const sectionClass = "rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 space-y-4"
  const optionBaseClass =
    "h-11 rounded-xl px-4 text-xs font-medium tracking-wide transition-all duration-200 cursor-pointer"
  const optionClass = (active: boolean) =>
    `${optionBaseClass} ${
      active
        ? "border border-cyan-300/40 bg-cyan-400/12 text-cyan-100 shadow-[inset_0_1px_0_rgba(34,211,238,0.15),0_8px_24px_-10px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/20"
        : "border border-white/[0.08] bg-white/[0.04] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-white/15 hover:bg-white/[0.07] hover:text-white/80"
    }`
  const subtlePanelClass = "rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"

  return (
    <div className="space-y-6">
      <div className="flex animate-in fade-in-0 slide-in-from-top-1 duration-300 flex-wrap items-center gap-2 rounded-2xl border border-white/[0.06] bg-[#0c0c0e]/80 p-2 backdrop-blur-sm">
        <Button
          type="button"
          variant={activeTab === "builder" ? "liquidMetalCyan" : "liquidMetal"}
          onClick={() => setActiveTab("builder")}
          className="h-9 px-5 text-xs font-medium transition-all duration-200"
        >
          Shot Builder
        </Button>
        <Button
          type="button"
          variant={activeTab === "storyboard" ? "liquidMetalCyan" : "liquidMetal"}
          onClick={() => setActiveTab("storyboard")}
          className="h-9 px-5 text-xs font-medium transition-all duration-200"
        >
          Storyboard ({storyboardItems.length})
        </Button>
      </div>

      {activeTab === "builder" ? (
    <div className="grid animate-in fade-in-0 slide-in-from-bottom-1 duration-500 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card className={setupCardClass}>
        <CardHeader className="px-5 pt-5 pb-2">
          <CardTitle className="text-lg font-semibold tracking-tight">Shot Setup</CardTitle>
          <p className="mt-1 text-sm text-white/40">Build your shot in seconds — open advanced for full control.</p>
        </CardHeader>
        <CardContent className="space-y-5 px-5 pb-5">
          <div className={sectionClass}>
            <div className="space-y-2.5">
              <label className="text-[11px] uppercase tracking-[0.14em] text-white/50 font-medium">Prompt</label>
              <Textarea
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Describe your shot — be cinematic..."
                className="studio-field min-h-32 resize-none rounded-xl text-sm text-white placeholder:text-white/30 leading-relaxed"
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-[0.12em] text-white/45 font-medium">Template</label>
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
                variant="liquidMetal"
                size="sm"
                className="h-11 px-4"
                onClick={() => {
                  const selected = PROMPT_TEMPLATES.find((item) => item.id === templateId)
                  if (selected) setSubject(selected.prompt)
                }}
              >
                Use
              </Button>
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] uppercase tracking-[0.12em] text-white/45 font-medium">Campaign Director</label>
              <div className="flex items-center gap-1.5">
                {isCampaignHistoryLoading ? <Loader2 className="h-3 w-3 animate-spin text-white/45" /> : null}
                {campaignEngineModel ? (
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100">
                    {campaignEngineModel}
                  </span>
                ) : null}
              </div>
            </div>
            {campaignHistory.length > 0 ? (
              <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-white/45 font-medium">Recent Campaigns</p>
                  <span className="text-[10px] text-white/40">{campaignHistory.length}</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {campaignHistory.map((campaign) => (
                    <div
                      key={campaign.id}
                      className={`min-w-[190px] rounded-lg border p-2 ${
                        campaignId === campaign.id
                          ? "border-cyan-300/35 bg-cyan-500/10"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <button type="button" onClick={() => openCampaign(campaign)} className="block w-full text-left">
                        <p className="truncate text-[11px] font-medium text-white/80">{campaign.name}</p>
                        <p className="mt-1 text-[10px] text-white/45">{campaign.status} · {campaign.items.length} assets</p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteCampaign(campaign.id)}
                        className="mt-2 h-7 rounded-md border border-rose-300/20 bg-rose-500/10 px-2 text-[10px] text-rose-100 hover:bg-rose-500/20"
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <Textarea
              value={campaignBrief}
              onChange={(event) => setCampaignBrief(event.target.value)}
              placeholder="Create 3 UGC videos for..."
              className="studio-field min-h-20 resize-none rounded-xl text-white placeholder:text-white/35"
            />
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/45 font-medium">Assets</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[2, 3, 4, 5].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setCampaignAssetCount(count)}
                      className={`h-9 rounded-lg border text-xs transition ${
                        campaignAssetCount === count
                          ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                          : "border-white/12 bg-white/5 text-white/75 hover:bg-white/10"
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant="liquidMetalCyan"
                onClick={handlePlanCampaign}
                disabled={isPlanningCampaign}
                className="h-9 px-3 text-xs"
              >
                {isPlanningCampaign ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ListChecks className="mr-1.5 h-3.5 w-3.5" />}
                Plan
              </Button>
            </div>
            {campaignPlan ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-white/85">{campaignPlan.campaignSummary}</p>
                    <p className="mt-1 text-[11px] text-white/45">{campaignPlan.creativeStrategy}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/65">
                    {campaignPlan.score.campaignReadiness}%
                  </span>
                </div>
                <div className="space-y-2">
                  {campaignItems.map((item, index) => (
                    <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-white/85">
                            {index + 1}. {item.title}
                          </p>
                          <p className="mt-1 text-[11px] text-cyan-100/75">{item.conceptType}</p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            item.status === "completed"
                              ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
                              : item.status === "failed"
                                ? "border-rose-300/25 bg-rose-500/10 text-rose-100"
                                : item.status === "processing" || item.status === "queued"
                                  ? "border-cyan-300/25 bg-cyan-500/10 text-cyan-100"
                                  : "border-white/10 bg-white/5 text-white/60"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] text-white/55">{item.hook}</p>
                      {item.error ? <p className="mt-1 text-[11px] text-rose-200">{item.error}</p> : null}
                      {item.url ? (
                        <div className="mt-2 overflow-hidden rounded-md border border-white/10 bg-black/35">
                          <video src={`/api/media/proxy?url=${encodeURIComponent(item.url)}`} className="aspect-video w-full object-cover" muted playsInline />
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/55">
                          {getKieVideoModelFamily(item.modelFamilyId).label}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/55">
                          {item.durationSeconds}s
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUseCampaignItem(item)}
                          className="ml-auto h-7 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] text-white/75 hover:bg-white/12"
                        >
                          Use
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleCopyCampaignPrompt(item)}
                          className="h-7 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] text-white/75 hover:bg-white/12"
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          Copy
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleRetryCampaignItem(item)}
                          disabled={isGeneratingCampaign || item.status === "processing" || item.status === "queued"}
                          className="h-7 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] text-white/75 hover:bg-white/12"
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddCampaignItemToStoryboard(item)}
                          disabled={!item.url}
                          className="h-7 rounded-md border border-cyan-300/20 bg-cyan-500/10 px-2 text-[10px] text-cyan-100 hover:bg-cyan-500/20"
                        >
                          <Clapperboard className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={handleGenerateCampaign}
                    disabled={isGeneratingCampaign || campaignItems.every((item) => item.status !== "planned" && item.status !== "failed")}
                    className="h-10 rounded-xl border border-cyan-300/35 bg-cyan-500/12 text-xs text-cyan-100 hover:bg-cyan-500/20"
                  >
                    {isGeneratingCampaign ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Generate Campaign
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleAddCampaignToStoryboard()}
                    disabled={isAddingCampaignToStoryboard || campaignItems.every((item) => !item.url)}
                    className="h-10 rounded-xl border border-white/12 bg-white/5 text-xs text-white/80 hover:bg-white/12"
                  >
                    {isAddingCampaignToStoryboard ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
                    Add All
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className={sectionClass}>
            <label className="text-[11px] uppercase tracking-[0.12em] text-white/50 font-medium">Shot Look</label>
            <div className="flex flex-wrap gap-2">
              {QUICK_LOOKS.map((look) => {
                const active = stylePresetId === look.stylePresetId && motionPresetId === look.motionPresetId
                return (
                  <button
                    key={look.id}
                    type="button"
                    onClick={() => {
                      applyStylePreset(look.stylePresetId)
                      applyMotionPreset(look.motionPresetId)
                    }}
                    className={`h-8 rounded-full border px-3 text-[11px] font-medium transition ${
                      active
                        ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                        : "border-white/12 bg-white/5 text-white/75 hover:border-white/25 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {look.label}
                  </button>
                )
              })}
            </div>
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-white/65">Style presets</p>
                <button
                  type="button"
                  onClick={() => setShowAllStyleChips((prev) => !prev)}
                  className="text-[10px] text-cyan-200/80 hover:text-cyan-100"
                >
                  {showAllStyleChips ? "Show less" : "See more"}
                </button>
              </div>
              <Input
                value={styleSearch}
                onChange={(event) => setStyleSearch(event.target.value)}
                placeholder="Search styles..."
                className="h-8 rounded-lg border-white/10 bg-white/5 text-[11px] text-white placeholder:text-white/35"
              />
              <div className="flex flex-wrap gap-1.5">
                {styleChipList.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-1 py-1">
                    <button
                      type="button"
                      onClick={() => applyStylePreset(preset.id)}
                      className={`h-7 rounded-full border px-2.5 text-[10px] transition ${
                        stylePresetId === preset.id
                          ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                          : "border-white/12 bg-white/5 text-white/75 hover:bg-white/10"
                      }`}
                    >
                      {preset.name}
                    </button>
                    {recentStyleIds.includes(preset.id) ? (
                      <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-cyan-100">
                        Recent
                      </span>
                    ) : null}
                    {favoriteStyleIds.includes(preset.id) ? (
                      <span className="rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-white/80">
                        Pinned
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleFavoriteStyle(preset.id)}
                      className={`h-7 rounded-full border px-2 text-[10px] transition ${
                        favoriteStyleIds.includes(preset.id)
                          ? "border-cyan-300/40 bg-cyan-500/12 text-cyan-100"
                          : "border-white/12 bg-white/5 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      {favoriteStyleIds.includes(preset.id) ? "Pinned" : "Pin"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-white/65">Motion presets</p>
                <button
                  type="button"
                  onClick={() => setShowAllMotionChips((prev) => !prev)}
                  className="text-[10px] text-cyan-200/80 hover:text-cyan-100"
                >
                  {showAllMotionChips ? "Show less" : "See more"}
                </button>
              </div>
              <Input
                value={motionSearch}
                onChange={(event) => setMotionSearch(event.target.value)}
                placeholder="Search motion..."
                className="h-8 rounded-lg border-white/10 bg-white/5 text-[11px] text-white placeholder:text-white/35"
              />
              <div className="flex flex-wrap gap-1.5">
                {motionChipList.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-1 py-1">
                    <button
                      type="button"
                      onClick={() => applyMotionPreset(preset.id)}
                      className={`h-7 rounded-full border px-2.5 text-[10px] transition ${
                        motionPresetId === preset.id
                          ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                          : "border-white/12 bg-white/5 text-white/75 hover:bg-white/10"
                      }`}
                    >
                      {preset.name}
                    </button>
                    {recentMotionIds.includes(preset.id) ? (
                      <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-cyan-100">
                        Recent
                      </span>
                    ) : null}
                    {favoriteMotionIds.includes(preset.id) ? (
                      <span className="rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-white/80">
                        Pinned
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleFavoriteMotion(preset.id)}
                      className={`h-7 rounded-full border px-2 text-[10px] transition ${
                        favoriteMotionIds.includes(preset.id)
                          ? "border-cyan-300/40 bg-cyan-500/12 text-cyan-100"
                          : "border-white/12 bg-white/5 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      {favoriteMotionIds.includes(preset.id) ? "Pinned" : "Pin"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Select value={stylePresetId} onValueChange={applyStylePreset}>
                <SelectTrigger className="studio-field rounded-xl text-white">
                  <SelectValue placeholder="Visual style" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0b0f14] text-white">
                  {STYLE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id} className="text-white/85 focus:bg-cyan-300/15 focus:text-cyan-100">
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={motionPresetId} onValueChange={applyMotionPreset}>
                <SelectTrigger className="studio-field rounded-xl text-white">
                  <SelectValue placeholder="Camera movement" />
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
                  className={optionClass(modelFamilyId === family.id)}
                >
                  <div className="text-xs font-medium text-white">{family.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={sectionClass}>
            <label className="text-[11px] uppercase tracking-[0.12em] text-white/50 font-medium">Model & Duration</label>
            <div className={`${subtlePanelClass} space-y-2`}>
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
            <Button
              type="button"
              variant="liquidMetal"
              size="sm"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="h-10 w-full text-xs"
            >
              {showAdvanced ? "Hide Advanced Controls" : "Show Advanced Controls"}
            </Button>
            {showAdvanced ? (
              <div className={`${subtlePanelClass} space-y-3`}>
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/45 font-medium">Advanced</p>
                <div className="grid gap-2 grid-cols-3">
                  {FAST_VIDEO_ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setAspectRatio(ratio)}
                      className={optionClass(aspectRatio === ratio)}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] text-white/55">Creative style intensity</p>
                  <div className="grid gap-2 grid-cols-3">
                    {FAST_VIDEO_VARIATIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setVariation(item)}
                        className={`${optionClass(variation === item)} capitalize`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={isUploading}
                      onChange={(event) => void handleUploadReference(event.target.files?.[0] || null)}
                      className="h-9 rounded-lg border-white/10 bg-transparent text-xs text-white/80"
                    />
                    {isUploading && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
                    {referenceImageUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReferenceImageUrl("")
                          toast.success("Reference image removed")
                        }}
                        className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] text-white/75 hover:bg-white/12"
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  {referenceImageUrl ? (
                    <div className="text-[11px] text-cyan-200/80">Reference image applied (image-to-video)</div>
                  ) : (
                    <div className="text-[11px] text-white/45">Optional reference image</div>
                  )}
                </div>
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-white/45 font-medium">Continuity Locks</p>
                    <button
                      type="button"
                      onClick={() => setContinuityEnabled((prev) => !prev)}
                      className={`h-7 rounded-full border px-2.5 text-[10px] font-medium transition ${
                        continuityEnabled
                          ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                          : "border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {continuityEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                  {continuityEnabled ? (
                    <div className="grid gap-2">
                      {CONTINUITY_LOCKS.map((item) => (
                        <div key={item.key} className="grid gap-1.5 sm:grid-cols-[auto_1fr] sm:items-center">
                          <button
                            type="button"
                            onClick={() =>
                              setContinuityLocks((prev) => ({
                                ...prev,
                                [item.key]: !prev[item.key],
                              }))
                            }
                            className={`h-8 rounded-lg border px-2.5 text-[11px] transition ${
                              continuityLocks[item.key]
                                ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                                : "border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
                            }`}
                          >
                            {item.label}
                          </button>
                          <Input
                            value={continuityValues[item.key]}
                            onChange={(event) =>
                              setContinuityValues((prev) => ({
                                ...prev,
                                [item.key]: event.target.value,
                              }))
                            }
                            placeholder={`${item.label} reference (optional)`}
                            disabled={!continuityLocks[item.key]}
                            className="h-8 rounded-lg border-white/12 bg-white/5 text-[11px] text-white placeholder:text-white/35 disabled:opacity-45"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 z-10 rounded-2xl bg-[#0c0c0e]/95 p-4 shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            <Button
              type="button"
              variant="liquidMetalPrimary"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-14 w-full text-sm"
            >
              {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
              Generate Shot
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="rounded-2xl border border-white/[0.06] bg-[#0c0c0e]/90 text-white overflow-hidden shadow-[0_32px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-sm">
          <CardHeader className="px-6 pt-6 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl font-semibold tracking-tight">Output</CardTitle>
                <p className="mt-1.5 text-sm text-white/40">Generate, preview, and send your best takes into storyboard.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-1 text-[11px] text-cyan-200/80">{activeModelFamily.label}</span>
                <span className={`rounded-full border px-3 py-1 text-[11px] ${
                  status === "completed" ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200/80" :
                  status === "processing" ? "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-200/80" :
                  status === "failed" ? "border-rose-400/20 bg-rose-400/[0.08] text-rose-200/80" :
                  "border-white/[0.08] bg-white/[0.04] text-white/60"
                }`}>{renderStatusText()}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-6 pb-6">
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-[0_0_0_0.5px_rgba(103,232,249,0.06),0_32px_80px_-30px_rgba(0,0,0,0.95)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.06),transparent_50%)]" />
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
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    type="button"
                    variant="liquidMetal"
                    size="sm"
                    onClick={togglePlayback}
                    className="h-9 px-3 text-xs"
                  >
                    {isPlaying ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                  <Button
                    type="button"
                    variant="liquidMetal"
                    size="sm"
                    onClick={toggleMute}
                    className="h-9 px-3 text-xs"
                  >
                    {isMuted ? <VolumeX className="mr-1.5 h-3.5 w-3.5" /> : <Volume2 className="mr-1.5 h-3.5 w-3.5" />}
                    {isMuted ? "Muted" : "Sound"}
                  </Button>
                  <div className="flex min-w-[130px] flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
                    <span className="text-[11px] text-white/45">Vol</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(event) => handleVolumeChange(Number(event.target.value))}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-300"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="liquidMetal"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="h-9 px-3 text-xs"
                  >
                    <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                    Fullscreen
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-white/50">{durationSeconds}s</span>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-white/50">{activeModelFamily.label}</span>
              <span className={`rounded-md border px-2.5 py-1 ${
                status === "completed" ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300/70" :
                status === "processing" ? "border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-300/70" :
                status === "failed" ? "border-rose-400/15 bg-rose-400/[0.06] text-rose-300/70" :
                "border-white/[0.08] bg-white/[0.04] text-white/50"
              }`}>{status}</span>
            </div>

            {showAdvanced ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-white/55">
                <p className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/35">Pipeline</p>
                <p className="text-white/50">{status === "processing" ? "Initializing → Sampling → Finalizing" : "Ready"}</p>
                <div className="mt-3 space-y-2">
                  <div className={status === "processing" ? "generation-track" : "generation-track opacity-20"} />
                  <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.14em]">
                    <span className={pipelineStage >= 1 ? "text-cyan-300" : "text-white/25"}>Init</span>
                    <span className={pipelineStage >= 2 ? "text-cyan-300" : "text-white/25"}>Sampling</span>
                    <span className={pipelineStage >= 3 ? "text-cyan-300" : "text-white/25"}>Finalizing</span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-white/35">Output Actions</p>
              <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex min-w-[240px] flex-1 items-center gap-2.5">
                <Input
                  value={downloadName}
                  onChange={(event) => setDownloadName(event.target.value)}
                  placeholder="File name"
                  className="h-10 rounded-lg border-white/[0.08] bg-white/[0.04] text-xs text-white placeholder:text-white/30"
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
                  className={`inline-flex h-10 items-center rounded-lg px-3.5 text-xs font-medium transition ${
                    videoUrl
                      ? "liquid-metal text-white/85"
                      : "pointer-events-none border border-white/[0.06] bg-white/[0.03] text-white/30"
                  }`}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </a>
              </div>
              <Button
                type="button"
                variant="liquidMetal"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(finalPrompt || subject.trim())
                    toast.success("Prompt copied")
                  } catch {
                    toast.error("Failed to copy prompt")
                  }
                }}
                disabled={!finalPrompt && !subject.trim()}
                className="h-10 px-3.5 text-xs"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Copy Prompt
              </Button>
              <Button
                type="button"
                variant="liquidMetal"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="h-10 px-3.5 text-xs"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Regenerate
              </Button>
              <Button
                type="button"
                variant="liquidMetalCyan"
                onClick={() => void handleSaveOutput()}
                disabled={!videoUrl || isSavingOutput}
                className="h-10 px-3.5 text-xs font-medium"
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {isSavingOutput ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="liquidMetalCyan"
                onClick={() => {
                  if (!videoUrl) {
                    toast.error("Generate a clip first")
                    return
                  }
                  addToStoryboard({
                    sourceClipId: taskId,
                    url: videoUrl,
                    subject: subject.trim(),
                    prompt: finalPrompt || subject.trim(),
                    durationSeconds,
                    modelFamilyId,
                  })
                }}
                disabled={!videoUrl}
                className="h-10 px-3.5 text-xs"
              >
                <Clapperboard className="mr-1.5 h-3.5 w-3.5" />
                Storyboard
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClearSession}
                className="h-10 rounded-lg border border-rose-400/15 bg-rose-500/[0.06] px-3.5 text-xs text-rose-200/70 transition hover:bg-rose-500/[0.12]"
              >
                Clear
              </Button>
            </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/35 font-medium">Saved Outputs</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/30">{savedClips.length}</span>
                  <Button
                    type="button"
                    variant="liquidMetal"
                    size="sm"
                    onClick={handleClearAllClips}
                    className="h-7 px-2.5 text-[10px]"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {savedClips.length === 0 ? (
                <p className="text-xs text-white/40">Saved clips appear here for fast compare and reuse.</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                  {savedClips.map((clip) => (
                    <div
                      key={clip.id}
                      className={`min-w-[260px] snap-start rounded-lg border p-2.5 transition-all duration-200 ${
                        activeSavedClipId === clip.id
                          ? "border-cyan-400/30 bg-cyan-500/[0.08] shadow-[0_12px_28px_-18px_rgba(34,211,238,0.5)]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => handleLoadClip(clip)}
                      >
                        <p className="truncate text-xs font-medium text-white/85">{clip.subject || "Saved clip"}</p>
                        <p className="mt-1 text-[10px] text-white/35">{new Date(clip.createdAt).toLocaleString()}</p>
                      </button>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-cyan-300/60">{getKieVideoModelFamily(clip.modelFamilyId).label}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="liquidMetal"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() =>
                              addToStoryboard({
                                sourceClipId: clip.id,
                                url: clip.url,
                                subject: clip.subject,
                                prompt: clip.prompt,
                                durationSeconds: clip.durationSeconds,
                                modelFamilyId: clip.modelFamilyId,
                              })
                            }
                          >
                            Add
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                            onClick={() => handleDeleteClip(clip.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <details className="group rounded-2xl border border-white/[0.06] bg-[#0c0c0e]/60 text-white shadow-none backdrop-blur-sm">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-4 text-sm font-medium text-white/80 hover:text-white transition [&::-webkit-details-marker]:hidden">
                <Film className="h-4 w-4 text-cyan-300/60" />
                <span className="flex-1">Storyboard Destination</span>
                <span className="text-[11px] text-white/40">
                  {hasStoryboardDestination && selectedScene
                    ? `${selectedProject?.name} / ${selectedScene.name}`
                    : "Not configured"}
                </span>
                <svg className="h-4 w-4 text-white/30 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <div className="space-y-4 px-5 pb-5">
                <div className="grid gap-2">
                  <label className="text-xs uppercase tracking-[0.16em] text-white/50">Delivery Mode</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setDestinationMode("append")}
                      className={optionClass(destinationMode === "append")}
                    >
                      Add New Shot
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestinationMode("create_scene")}
                      className={optionClass(destinationMode === "create_scene")}
                    >
                      Create Scene
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestinationMode("replace_shot")}
                      className={optionClass(destinationMode === "replace_shot")}
                    >
                      Replace Shot
                    </button>
                  </div>
                  <p className="text-[11px] text-white/45">
                    Fast Track keeps your source clip here and sends a production-ready copy into your project.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-white/50">Project</label>
                    <select
                      value={selectedProjectId}
                      onChange={(event) => setSelectedProjectId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white"
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id} className="bg-[#0f1012]">
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={destinationMode === "create_scene" ? "opacity-60" : ""}>
                    <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-white/50">Scene</label>
                    <select
                      value={selectedSceneId}
                      onChange={(event) => setSelectedSceneId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white"
                      disabled={destinationMode === "create_scene"}
                    >
                      {(selectedProject?.scenes || []).map((scene) => (
                        <option key={scene.id} value={scene.id} className="bg-[#0f1012]">
                          {scene.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {destinationMode === "create_scene" ? (
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-white/50">New Scene Name</label>
                    <Input
                      value={newSceneName}
                      onChange={(event) => setNewSceneName(event.target.value)}
                      placeholder="INT. SHOWROOM - GOLDEN HOUR"
                      className="h-11 rounded-xl border-white/12 bg-white/5 text-white placeholder:text-white/35"
                    />
                  </div>
                ) : null}

                {destinationMode === "replace_shot" ? (
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="block text-xs uppercase tracking-[0.16em] text-white/50">Shot To Replace</label>
                      {isSceneShotsLoading ? <span className="text-[10px] text-cyan-100">Loading shots...</span> : null}
                    </div>
                    <select
                      value={replaceShotId}
                      onChange={(event) => setReplaceShotId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white"
                      disabled={isSceneShotsLoading || sceneShotOptions.length === 0}
                    >
                      {sceneShotOptions.length === 0 ? (
                        <option value="" className="bg-[#0f1012]">
                          No shots available in this scene
                        </option>
                      ) : (
                        sceneShotOptions.map((shot) => (
                          <option key={shot.id} value={shot.id} className="bg-[#0f1012]">
                            {shot.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                ) : null}

                <Button
                  type="button"
                  onClick={handlePromote}
                  disabled={
                    isPromoting ||
                    isRoutingOutput ||
                    !videoUrl ||
                    !selectedProjectId ||
                    (destinationMode !== "create_scene" && !selectedSceneId) ||
                    (destinationMode === "create_scene" && !newSceneName.trim()) ||
                    (destinationMode === "replace_shot" && (!replaceShotId || sceneShotOptions.length === 0))
                  }
                  className="h-11 w-full rounded-xl border border-cyan-300/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                >
                  {isPromoting || isRoutingOutput ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
                  {destinationMode === "append"
                    ? "Send As New Shot"
                    : destinationMode === "create_scene"
                      ? "Create Scene And Send"
                      : "Replace Selected Shot"}
                </Button>
              </div>
            </details>

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

        {/* Direction Stack — inline summary bar */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#0c0c0e]/60 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <WandSparkles className="h-4 w-4 text-cyan-300/70" />
            <span className="text-xs font-medium text-white/60 uppercase tracking-[0.12em]">Active Direction</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/65">
              <span className="text-white/40">Style</span> {activeStyle?.name || "Custom"}
            </span>
            <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/65">
              <span className="text-white/40">Motion</span> {activeMotion?.name || "Custom"}
            </span>
            <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/65">
              <span className="text-white/40">Model</span> {activeModelFamily.label}
            </span>
            <span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/65">
              <span className="text-white/40">Continuity</span>{" "}
              {continuityEnabled
                ? `${CONTINUITY_LOCKS.filter((item) => continuityLocks[item.key]).length} lock(s)`
                : "Off"}
            </span>
          </div>
        </div>

        <StudioAdPanel
          promptPreview={subject}
          onApplyPacket={handleApplyAdToFastTrack}
          embedded={false}
          showHistory={false}
          context={{ generationModelHint: activeModelFamily.label }}
        />
      </div>
    </div>
      ) : (
        <Card className="hover-lift animate-in fade-in-0 slide-in-from-bottom-2 duration-500 rounded-3xl border border-white/12 bg-[#0b0f14] text-white shadow-[0_24px_55px_-40px_rgba(0,0,0,0.95)]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Storyboard</CardTitle>
                <p className="mt-1 text-xs text-white/50">Arrange your shots, add notes, and refine sequence flow.</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-white/65">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                    {storyboardSource === "scene" && selectedScene
                      ? `Synced to ${selectedProject?.name} / ${selectedScene.name}`
                      : "Stored locally"}
                  </span>
                  {isStoryboardLoading ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-cyan-100">Loading scene board...</span>
                  ) : null}
                  {isStoryboardSyncing ? (
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2 py-0.5 text-cyan-100">Syncing changes...</span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-white/65">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">Total Runtime: {storyboardRuntime}s</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">Scene A: {storyboardGroupRuntime["Scene A"]}s</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">Scene B: {storyboardGroupRuntime["Scene B"]}s</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">Scene C: {storyboardGroupRuntime["Scene C"]}s</span>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => {
                  if (!videoUrl) {
                    toast.error("Generate a clip first")
                    return
                  }
                  addToStoryboard({
                    sourceClipId: taskId,
                    url: videoUrl,
                    subject: subject.trim(),
                    prompt: finalPrompt || subject.trim(),
                    durationSeconds,
                    modelFamilyId,
                  })
                }}
                className="h-10 rounded-xl border border-cyan-300/35 bg-cyan-500/12 text-xs text-cyan-100 hover:bg-cyan-500/20"
                disabled={isStoryboardLoading || isStoryboardSyncing}
              >
                <Clapperboard className="mr-1.5 h-3.5 w-3.5" />
                Add Current Output
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
              {(["All", "Scene A", "Scene B", "Scene C"] as const).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setStoryboardGroupFilter(group)}
                  className={`h-8 rounded-full border px-3 text-[11px] transition ${
                    storyboardGroupFilter === group
                      ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                      : "border-white/12 bg-white/5 text-white/75 hover:bg-white/10"
                  }`}
                  disabled={isStoryboardLoading}
                >
                  {group}
                  {group !== "All" ? ` (${storyboardGroupRuntime[group]}s)` : ""}
                </button>
              ))}
              {storyboardGroupFilter !== "All" ? (
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="liquidMetal"
                    onClick={() => void copyStoryboardGroupShotList(storyboardGroupFilter)}
                    className="h-8 px-2.5 text-[11px]"
                    disabled={isStoryboardLoading || isStoryboardSyncing}
                  >
                    Copy List
                  </Button>
                  <Button
                    type="button"
                    variant="liquidMetalCyan"
                    onClick={() => duplicateStoryboardGroupToNext(storyboardGroupFilter)}
                    className="h-8 px-2.5 text-[11px]"
                    disabled={isStoryboardLoading || isStoryboardSyncing}
                  >
                    Duplicate Group
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => clearStoryboardGroup(storyboardGroupFilter)}
                    className="h-8 rounded-lg border border-rose-300/20 bg-rose-500/10 px-2.5 text-[11px] text-rose-100 hover:bg-rose-500/20"
                    disabled={isStoryboardLoading || isStoryboardSyncing}
                  >
                    Clear Group
                  </Button>
                </div>
              ) : null}
            </div>

            {isStoryboardLoading ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-xs text-white/60">
                Loading storyboard for the selected scene...
              </div>
            ) : storyboardItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_60%)] p-8 text-center">
                <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/10 text-cyan-100">
                  <Clapperboard className="h-4 w-4" />
                </div>
                <p className="text-sm text-white/80">No storyboard shots yet</p>
                <p className="mt-1 text-xs text-white/55">Generate in Shot Builder and add your best outputs to start sequence planning.</p>
                <Button
                  type="button"
                  onClick={() => setActiveTab("builder")}
                  className="mt-4 h-9 rounded-xl border border-white/12 bg-white/5 px-3.5 text-xs text-white/85 hover:bg-white/12"
                >
                  Go to Shot Builder
                </Button>
              </div>
            ) : filteredStoryboardItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-xs text-white/60">
                No shots in {storyboardGroupFilter}. Switch group or add more outputs.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredStoryboardItems.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggingStoryboardId(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggingStoryboardId || draggingStoryboardId === item.id) return
                      reorderStoryboardItems(draggingStoryboardId, item.id)
                      setDraggingStoryboardId(null)
                    }}
                    className="hover-lift animate-in fade-in-0 slide-in-from-bottom-1 duration-300 rounded-2xl border border-white/12 bg-[#111822] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white/85">Shot {index + 1}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/65">{item.durationSeconds}s</span>
                        <select
                          value={item.sceneGroup}
                          onChange={(event) => updateStoryboardGroup(item.id, event.target.value as "Scene A" | "Scene B" | "Scene C")}
                          className="h-6 rounded-md border border-white/12 bg-white/5 px-1.5 text-[10px] text-white"
                          disabled={isStoryboardSyncing}
                        >
                          <option value="Scene A" className="bg-[#0f1012]">Scene A</option>
                          <option value="Scene B" className="bg-[#0f1012]">Scene B</option>
                          <option value="Scene C" className="bg-[#0f1012]">Scene C</option>
                        </select>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      <video src={`/api/media/proxy?url=${encodeURIComponent(item.url)}`} className="aspect-video w-full object-cover" muted playsInline />
                    </div>
                    <p className="mt-2 line-clamp-1 text-xs text-white/85">{item.subject || "Storyboard shot"}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-white/45">{item.prompt}</p>
                    <Textarea
                      value={item.note}
                      onChange={(event) => updateStoryboardNote(item.id, event.target.value)}
                      onBlur={() => void saveStoryboardNote(item.id)}
                      placeholder="Add director note..."
                      className="mt-2 min-h-20 rounded-xl border-white/10 bg-white/5 text-xs text-white placeholder:text-white/35"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="liquidMetal"
                        onClick={() => duplicateStoryboardItem(item.id)}
                        className="h-8 px-2.5 text-[11px]"
                        disabled={isStoryboardSyncing}
                      >
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeStoryboardItem(item.id)}
                        className="h-8 rounded-lg border border-rose-300/20 bg-rose-500/10 px-2.5 text-[11px] text-rose-100 hover:bg-rose-500/20"
                        disabled={isStoryboardSyncing}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

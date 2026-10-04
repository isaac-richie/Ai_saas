/** Types, static data and pure mappers for Fast Track. No React state lives here. */
import { shotFrameSchema } from "@/core/validation/shot-frames"
import { EMPTY_CAMPAIGN_REFERENCES, campaignProvenanceSchema, campaignReferencesSchema, qualityFlagsSchema, type CampaignReferences, type QualityFlags } from "@/core/validation/campaign-references"
import { type FastVideoAspectRatio, type FastVideoVariation } from "@/core/config/fast-video-presets"
import { type KieVideoModelFamilyId, getKieVideoModelFamily } from "@/core/config/kie-video-models"
import { type FastVideoStoryboardRow } from "@/core/actions/fast-video-storyboard"
import { type StudioAdCampaignWithItems } from "@/core/actions/studio-ad-campaigns"
import { type StudioAdCampaignDeliverable, type StudioAdCampaignPlan } from "@/core/validation/studio-ad"
import type { ContinuityKey as ContinuityKeyExtracted } from "./ContinuityPanel"
import type { StoryboardItem as StoryboardItemImported } from "./StoryboardPanel"
import { mediaReferencesSchema, type MediaReference } from "@/core/validation/media-reference"
import { type ShotFrames } from "@/core/validation/shot-frames"

export type SceneOption = {
  id: string
  name: string
}

export type SceneShotOption = {
  id: string
  name: string
}

export type ProjectOption = {
  id: string
  name: string
  scenes: SceneOption[]
}

export interface FastVideoStudioProps {
  projects: ProjectOption[]
}

export type FastVideoDebugEvent = {
  at: string
  step: string
  details?: Record<string, unknown>
}

export type GenerationSnapshot = {
  mediaReferences?: MediaReference[]
  shotFrames?: ShotFrames | null
  projectId?: string | null
  subject: string
  prompt: string
  aspectRatio: FastVideoAspectRatio
  variation: FastVideoVariation
  durationSeconds: number
  modelFamilyId: KieVideoModelFamilyId
  /** Storyboard card this generation fills in when it finishes. */
  storyboardTargetId?: string | null
}

export type SavedFastClip = {
  mediaReferences?: MediaReference[]
  shotFrames?: ShotFrames | null
  projectId?: string | null
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

export type StoryboardItem = StoryboardItemImported

export type CampaignBatchItem = StudioAdCampaignDeliverable & {
  dbId?: string
  status: "planned" | "queued" | "processing" | "completed" | "failed"
  taskId: string | null
  traceId: string | null
  url: string | null
  error: string | null
  /** Campaign reference IDs and review results (migration 0035). */
  characterReferenceId?: string | null
  productReferenceId?: string | null
  generationModel?: string | null
  qualityFlags?: QualityFlags
}

export type ContinuityKey = ContinuityKeyExtracted

export type QuickLook = {
  id: string
  label: string
  stylePresetId: string
  motionPresetId: string
}


export const QUICK_LOOKS: QuickLook[] = [
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

export const FAST_VIDEO_STORAGE_KEY = "aisas.fast-video.v1"

export function normalizeStoryboardItems(items: StoryboardItem[]): StoryboardItem[] {
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

export function mapRemoteStoryboardItem(row: FastVideoStoryboardRow): StoryboardItem {
  return {
    mediaReferences: mediaReferencesSchema.safeParse(row.media_references).data || [],
    campaignProvenance: campaignProvenanceSchema.safeParse((row as { campaign_provenance?: unknown }).campaign_provenance).data ?? null,
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
    ...mapContinuityColumns(row as unknown as Record<string, unknown>),
  }
}

const REVIEW_STATES = new Set(["draft", "generating", "review", "approved", "failed"])

function mapContinuityColumns(row: Record<string, unknown>): Partial<StoryboardItem> {
  const review = typeof row.review_status === "string" && REVIEW_STATES.has(row.review_status) ? row.review_status as StoryboardItem["review"] : undefined
  return {
    direction: typeof row.direction === "string" ? row.direction : undefined,
    // A shot that was mid-generation when the page closed is shown as ready to retry.
    review: review === "generating" ? (row.url ? "review" : "draft") : review,
    startFrame: shotFrameSchema.safeParse(row.start_frame).data ?? null,
    endFrame: shotFrameSchema.safeParse(row.end_frame).data ?? null,
    previousItemId: typeof row.previous_item_id === "string" ? row.previous_item_id : null,
    enhancedPrompt: typeof row.enhanced_prompt === "string" ? row.enhanced_prompt : null,
    enhancedFrom: typeof row.enhanced_from === "string" ? row.enhanced_from : null,
    autoEnhance: row.auto_enhance !== false,
    driftReview: row.drift_review === "ok" || row.drift_review === "flagged" ? row.drift_review : null,
  }
}

export function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export function mapCampaignRowToPlan(row: StudioAdCampaignWithItems): StudioAdCampaignPlan {
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

/** Restores a saved campaign's character / product references, if any. */
export function campaignRowReferences(row: StudioAdCampaignWithItems): CampaignReferences {
  const parsed = campaignReferencesSchema.safeParse((row as { campaign_references?: unknown }).campaign_references)
  return parsed.success ? parsed.data : EMPTY_CAMPAIGN_REFERENCES
}

export function mapCampaignRowToItems(row: StudioAdCampaignWithItems): CampaignBatchItem[] {
  return row.items.map((raw) => {
    // Columns from migration 0035 are optional on older databases.
    const item = raw as typeof raw & { character_reference_id?: string | null; product_reference_id?: string | null; generation_model?: string | null; quality_flags?: unknown; product_interaction?: string | null; shot_sequence?: string | null; call_to_action?: string | null }
    const flags = qualityFlagsSchema.safeParse(item.quality_flags ?? {})
    return {
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
    characterReferenceId: item.character_reference_id ?? null,
    productReferenceId: item.product_reference_id ?? null,
    generationModel: item.generation_model ?? null,
    qualityFlags: flags.success ? flags.data : {},
    ...(item.product_interaction ? { productInteraction: item.product_interaction } : {}),
    ...(item.shot_sequence ? { shotSequence: item.shot_sequence } : {}),
    ...(item.call_to_action ? { callToAction: item.call_to_action } : {}),
  }
  })
}

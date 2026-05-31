"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { Database, Json } from "@/core/types/db"
import type { StudioAdCampaignPlan } from "@/core/validation/studio-ad"

export type StudioAdCampaignRow = Database["public"]["Tables"]["studio_ad_campaigns"]["Row"]
export type StudioAdCampaignItemRow = Database["public"]["Tables"]["studio_ad_campaign_items"]["Row"]

export type StudioAdCampaignWithItems = StudioAdCampaignRow & {
  items: StudioAdCampaignItemRow[]
}

type CreateCampaignInput = {
  projectId?: string | null
  sceneId?: string | null
  brief: string
  plan: StudioAdCampaignPlan
  assetCount: number
  aspectRatio: string
  durationSeconds: number
  engineModel?: string | null
}

type UpdateCampaignItemInput = {
  itemId: string
  status?: "planned" | "queued" | "processing" | "completed" | "failed"
  taskId?: string | null
  traceId?: string | null
  outputUrl?: string | null
  error?: string | null
  masterPrompt?: string
  durationSeconds?: number
}

async function ensureSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { supabase, user: null, error: "Unauthorized. Please sign in." }
  return { supabase, user, error: null }
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

function makeCampaignName(brief: string): string {
  const cleaned = brief.replace(/\s+/g, " ").trim()
  if (!cleaned) return "Fast Track Campaign"
  return cleaned.length > 64 ? `${cleaned.slice(0, 61)}...` : cleaned
}

export async function createStudioAdCampaign(input: CreateCampaignInput) {
  const session = await ensureSession()
  if (session.error || !session.user) return { error: session.error || "Unauthorized" }

  const { supabase, user } = session
  const { data: campaign, error: campaignError } = await supabase
    .from("studio_ad_campaigns")
    .insert({
      user_id: user.id,
      project_id: input.projectId || null,
      scene_id: input.sceneId || null,
      name: makeCampaignName(input.brief),
      brief: input.brief,
      campaign_type: "ugc",
      asset_count: input.assetCount,
      aspect_ratio: input.aspectRatio,
      duration_seconds: input.durationSeconds,
      engine_model: input.engineModel || null,
      campaign_summary: input.plan.campaignSummary,
      audience: input.plan.audience,
      creative_strategy: input.plan.creativeStrategy,
      score: asJson(input.plan.score),
      suggestions: asJson(input.plan.suggestions),
      status: "planned",
    })
    .select("*")
    .single()

  if (campaignError || !campaign) {
    return { error: campaignError?.message || "Failed to save campaign" }
  }

  const items = input.plan.deliverables.map((item, index) => ({
    campaign_id: campaign.id,
    order_index: index,
    title: item.title,
    concept_type: item.conceptType,
    hook: item.hook,
    creator_direction: item.creatorDirection,
    master_prompt: item.masterPrompt,
    negative_prompt: item.negativePrompt,
    duration_seconds: item.durationSeconds,
    aspect_ratio: item.aspectRatio,
    model_family_id: item.modelFamilyId,
    style_preset_id: item.stylePresetId || null,
    motion_preset_id: item.motionPresetId || null,
    continuity_anchors: asJson(item.continuityAnchors),
    production_notes: asJson(item.productionNotes),
    status: "planned",
  }))

  const { data: createdItems, error: itemsError } = await supabase
    .from("studio_ad_campaign_items")
    .insert(items)
    .select("*")
    .order("order_index", { ascending: true })

  if (itemsError) return { error: itemsError.message }

  revalidatePath("/dashboard/fast-video")
  return { data: { ...campaign, items: createdItems || [] } as StudioAdCampaignWithItems }
}

export async function listStudioAdCampaigns(projectId?: string | null) {
  const session = await ensureSession()
  if (session.error || !session.user) return { error: session.error || "Unauthorized", data: [] as StudioAdCampaignWithItems[] }

  let query = session.supabase
    .from("studio_ad_campaigns")
    .select("*, items:studio_ad_campaign_items(*)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(8)

  if (projectId) {
    query = query.eq("project_id", projectId)
  }

  const { data, error } = await query
  if (error) return { error: error.message, data: [] as StudioAdCampaignWithItems[] }

  return {
    data: (data || []).map((campaign) => ({
      ...campaign,
      items: [...(campaign.items || [])].sort((a, b) => a.order_index - b.order_index),
    })) as StudioAdCampaignWithItems[],
  }
}

export async function getStudioAdCampaign(campaignId: string) {
  const session = await ensureSession()
  if (session.error || !session.user) return { error: session.error || "Unauthorized" }

  const { data, error } = await session.supabase
    .from("studio_ad_campaigns")
    .select("*, items:studio_ad_campaign_items(*)")
    .eq("id", campaignId)
    .eq("user_id", session.user.id)
    .single()

  if (error || !data) return { error: error?.message || "Campaign not found" }

  return {
    data: {
      ...data,
      items: [...(data.items || [])].sort((a, b) => a.order_index - b.order_index),
    } as StudioAdCampaignWithItems,
  }
}

export async function updateStudioAdCampaignItem(input: UpdateCampaignItemInput) {
  const session = await ensureSession()
  if (session.error) return { error: session.error }

  const updates: Database["public"]["Tables"]["studio_ad_campaign_items"]["Update"] = {
    updated_at: new Date().toISOString(),
  }
  if (input.status) updates.status = input.status
  if ("taskId" in input) updates.task_id = input.taskId ?? null
  if ("traceId" in input) updates.trace_id = input.traceId ?? null
  if ("outputUrl" in input) updates.output_url = input.outputUrl ?? null
  if ("error" in input) updates.error = input.error ?? null
  if (input.masterPrompt) updates.master_prompt = input.masterPrompt
  if (typeof input.durationSeconds === "number") updates.duration_seconds = input.durationSeconds

  const { data, error } = await session.supabase
    .from("studio_ad_campaign_items")
    .update(updates)
    .eq("id", input.itemId)
    .select("campaign_id")
    .single()

  if (error) return { error: error.message }

  if (data?.campaign_id) {
    await refreshCampaignStatus(data.campaign_id)
  }

  revalidatePath("/dashboard/fast-video")
  return { data: true }
}

export async function deleteStudioAdCampaign(campaignId: string) {
  const session = await ensureSession()
  if (session.error) return { error: session.error }

  const { error } = await session.supabase.from("studio_ad_campaigns").delete().eq("id", campaignId)
  if (error) return { error: error.message }

  revalidatePath("/dashboard/fast-video")
  return { data: true }
}

async function refreshCampaignStatus(campaignId: string) {
  const supabase = await createClient()
  const { data: items } = await supabase
    .from("studio_ad_campaign_items")
    .select("status")
    .eq("campaign_id", campaignId)

  const statuses = (items || []).map((item) => item.status)
  const status =
    statuses.length > 0 && statuses.every((item) => item === "completed")
      ? "completed"
      : statuses.some((item) => item === "processing" || item === "queued")
        ? "processing"
        : statuses.some((item) => item === "failed")
          ? "failed"
          : "planned"

  await supabase
    .from("studio_ad_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
}

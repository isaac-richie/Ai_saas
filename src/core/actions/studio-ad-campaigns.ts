"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { Database, Json } from "@/core/types/db"
import type { StudioAdCampaignPlan } from "@/core/validation/studio-ad"
import { frameCapability } from "@/core/validation/shot-frames"
import { campaignMode, characterReferenceSchema, referenceCapability, productReferenceSchema, qualityFlagsSchema, validateOwnedCampaignReferences, type CampaignReferences, type CharacterReference, type ProductReference, type QualityFlags } from "@/core/validation/campaign-references"

const MISSING_COLUMN = ["42703", "PGRST204", "42P01", "PGRST205"]

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
  references?: CampaignReferences | null
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
  qualityFlags?: QualityFlags
  generationModel?: string | null
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
  let references: CampaignReferences | null = null
  try {
    references = input.references ? validateOwnedCampaignReferences(input.references, user.id) : null
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Invalid campaign references." }
  }
  const withReferences = references && campaignMode(references) !== "generic" ? references : null
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

  if (withReferences) {
    await recordCampaignReferences(supabase, user.id, campaign.id, withReferences, input.plan, createdItems || [])
  }

  revalidatePath("/dashboard/fast-video")
  return { data: { ...campaign, campaign_references: withReferences, items: createdItems || [] } as StudioAdCampaignWithItems }
}

/**
 * Stores references (migration 0035) next to the campaign. The plan and items
 * are already saved, so a missing migration only skips these typed rows.
 */
async function recordCampaignReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  campaignId: string,
  refs: CampaignReferences,
  plan: StudioAdCampaignPlan,
  items: StudioAdCampaignItemRow[],
) {
  const db = supabase as unknown as { from: (table: string) => { update: (v: unknown) => { eq: (k: string, v: string) => Promise<{ error: { code: string } | null }> }; insert: (v: unknown) => Promise<{ error: { code: string } | null }> } }
  const snapshot = await db.from("studio_ad_campaigns").update({
    campaign_references: refs, campaign_style: refs.style, relationship_type: refs.relationship, platform: plan.platform ?? null,
  }).eq("id", campaignId)
  if (snapshot.error) {
    console.warn("Campaign reference snapshot skipped; apply migration 0035.", { code: snapshot.error.code })
    return
  }
  const rows = [refs.character, refs.product].flatMap((ref) => ref ? [{
    user_id: userId, reference_id: ref.id, campaign_id: campaignId, reference_type: ref.type, asset_paths: ref.assetPaths, name: ref.name,
    description: ref.type === "character"
      ? { role: ref.role, ageRange: ref.ageRange, appearance: ref.appearance, wardrobe: ref.wardrobe, voice: ref.voice, expressionAction: ref.expressionAction }
      : { variant: ref.variant, logoText: ref.logoText, colourMaterial: ref.colourMaterial, packaging: ref.packaging, keyFeatures: ref.keyFeatures, forbiddenChanges: ref.forbiddenChanges },
    lock_identity: ref.type === "character" ? ref.locks.identity : ref.locks.shape && ref.locks.logoText,
    lock_appearance: ref.type === "character" ? ref.locks.wardrobe : ref.locks.colour && ref.locks.packaging,
    locks: ref.locks, influence_strength: ref.influence, rights_confirmed: ref.rightsConfirmed,
  }] : [])
  const inserted = await db.from("campaign_references").insert(rows)
  if (inserted.error) console.warn("Campaign reference rows skipped.", { code: inserted.error.code })
  await Promise.all(items.map((item, index) => db.from("studio_ad_campaign_items").update({
    character_reference_id: refs.character?.id ?? null,
    product_reference_id: refs.product?.id ?? null,
    relationship_type: refs.character && refs.product ? refs.relationship : null,
    product_interaction: plan.deliverables[index]?.productInteraction ?? null,
    shot_sequence: plan.deliverables[index]?.shotSequence ?? null,
    call_to_action: plan.deliverables[index]?.callToAction ?? null,
  }).eq("id", item.id)))
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
  // Callers pass every key, using undefined for "unchanged". Only explicit values
  // (including null to clear) are written, so a flag or status update never wipes
  // a finished clip's URL or task ID.
  if (input.taskId !== undefined) updates.task_id = input.taskId
  if (input.traceId !== undefined) updates.trace_id = input.traceId
  if (input.outputUrl !== undefined) updates.output_url = input.outputUrl
  if (input.error !== undefined) updates.error = input.error
  if (input.masterPrompt) updates.master_prompt = input.masterPrompt
  if (typeof input.durationSeconds === "number") updates.duration_seconds = input.durationSeconds
  // Columns from migration 0035; written separately so older databases still update.
  const extras: Record<string, unknown> = {}
  if (input.qualityFlags) {
    const flags = qualityFlagsSchema.safeParse(input.qualityFlags)
    if (!flags.success) return { error: "Invalid review flags." }
    extras.quality_flags = flags.data
  }
  if (input.generationModel) {
    // Provider, model and capability snapshot stored on the asset (migration 0036).
    const family = input.generationModel.includes("seedance") ? "seedance" : "kling"
    extras.generation_model = input.generationModel.slice(0, 120)
    extras.provider = "kie"
    extras.capability_snapshot = { model: input.generationModel, family, frames: frameCapability(family), references: referenceCapability(family) }
  }
  if (Object.keys(extras).length) {
    const { error: extrasError } = await session.supabase.from("studio_ad_campaign_items").update(extras as never).eq("id", input.itemId)
    if (extrasError && MISSING_COLUMN.includes(extrasError.code)) {
      // Capability snapshots (0036) are best-effort; review flags (0035) are user-facing.
      if (!input.qualityFlags) return { data: true }
      return { error: "Review flags need migration 0035. Your campaign is unchanged." }
    }
    if (extrasError) return { error: extrasError.message }
  }

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

/**
 * Characters and products the user already attached to earlier campaigns, so
 * they can be reused without re-uploading. Newest first, one entry per reference.
 */
export async function listSavedCampaignReferences(): Promise<{ data?: { characters: CharacterReference[]; products: ProductReference[] }; error?: string }> {
  const session = await ensureSession()
  if (session.error || !session.user) return { error: session.error || "Unauthorized" }
  const db = session.supabase as unknown as { from: (table: string) => { select: (columns: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: { code: string } | null }> } } } } }
  const { data, error } = await db.from("campaign_references")
    .select("reference_id,reference_type,name,asset_paths,description,locks,influence_strength,rights_confirmed,created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) return { data: { characters: [], products: [] } }
  const seen = new Set<string>()
  const characters: CharacterReference[] = []
  const products: ProductReference[] = []
  for (const row of data || []) {
    const id = String(row.reference_id)
    if (seen.has(id)) continue
    seen.add(id)
    const description = (row.description && typeof row.description === "object" ? row.description : {}) as Record<string, unknown>
    const base = { id, name: row.name, assetPaths: row.asset_paths, locks: row.locks, influence: row.influence_strength, rightsConfirmed: row.rights_confirmed === true }
    if (row.reference_type === "character") {
      const parsed = characterReferenceSchema.safeParse({ ...base, type: "character", ...description })
      if (parsed.success && parsed.data.assetPaths.every((path) => path.startsWith(`${session.user!.id}/`))) characters.push(parsed.data)
    } else {
      const parsed = productReferenceSchema.safeParse({ ...base, type: "product", ...description })
      if (parsed.success && parsed.data.assetPaths.every((path) => path.startsWith(`${session.user!.id}/`))) products.push(parsed.data)
    }
  }
  return { data: { characters: characters.slice(0, 12), products: products.slice(0, 12) } }
}

"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { Database } from "@/core/types/db"
import { validateOwnedReferences, type MediaReference } from "@/core/validation/media-reference"
import { shotFrameSchema } from "@/core/validation/shot-frames"
import { campaignProvenanceSchema, type CampaignProvenance } from "@/core/validation/campaign-references"

export type FastVideoStoryboardRow = Database["public"]["Tables"]["fast_video_storyboard_items"]["Row"]

type ReplaceFastVideoStoryboardInput = {
  projectId: string
  sceneId: string
  items: Array<{
    mediaReferences?: MediaReference[]
    campaignProvenance?: CampaignProvenance | null
    id: string
    sourceClipId: string | null
    url: string
    subject: string
    prompt: string
    durationSeconds: number
    modelFamilyId?: string | null
    sceneGroup: "Scene A" | "Scene B" | "Scene C"
    note: string
    status: "draft" | "ready"
    createdAt: string
    direction?: string
    review?: string
    startFrame?: unknown
    endFrame?: unknown
    previousItemId?: string | null
    enhancedPrompt?: string | null
    enhancedFrom?: string | null
    autoEnhance?: boolean
    driftReview?: string | null
  }>
}

const SCENE_GROUPS = new Set(["Scene A", "Scene B", "Scene C"])
const ITEM_STATUSES = new Set(["draft", "ready"])
const REVIEW_STATES = new Set(["draft", "generating", "review", "approved", "failed"])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Newest first. Older databases drop missing columns on save rather than losing the storyboard.
const OPTIONAL_COLUMN_GROUPS = [
  ["drift_review"], // 0041
  ["enhanced_prompt", "enhanced_from", "auto_enhance"], // 0039
  ["direction", "review_status", "start_frame", "end_frame", "previous_item_id"], // 0038
  ["campaign_provenance"], // 0036
]

function ownedFrame(frame: unknown, userId: string) {
  const parsed = shotFrameSchema.safeParse(frame)
  return parsed.success && parsed.data.assetPath.startsWith(`${userId}/`) ? parsed.data : null
}

async function ensureSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { supabase, user: null, error: "Unauthorized. Please sign in." }
  return { supabase, user, error: null }
}

function sanitizeStoryboardItem(
  item: ReplaceFastVideoStoryboardInput["items"][number],
  orderIndex: number,
  userId: string
): Database["public"]["Tables"]["fast_video_storyboard_items"]["Insert"] {
  return {
    media_references: JSON.parse(JSON.stringify(item.mediaReferences || [])),
    id: item.id,
    project_id: "",
    scene_id: "",
    order_index: orderIndex,
    source_clip_id: item.sourceClipId,
    url: item.url,
    subject: item.subject.trim() || "Storyboard shot",
    prompt: item.prompt.trim(),
    duration_seconds: Math.max(1, Math.min(30, Math.round(item.durationSeconds || 5))),
    model_family_id: item.modelFamilyId || null,
    scene_group: SCENE_GROUPS.has(item.sceneGroup) ? item.sceneGroup : "Scene A",
    note: item.note.trim(),
    status: ITEM_STATUSES.has(item.status) ? item.status : "ready",
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // Migration 0036; omitted entirely when absent so older databases still accept the row.
    ...(item.campaignProvenance ? { campaign_provenance: campaignProvenanceSchema.parse(item.campaignProvenance) } : {}),
    direction: (item.direction || "").trim().slice(0, 1200),
    review_status: item.review && REVIEW_STATES.has(item.review) ? item.review : null,
    start_frame: ownedFrame(item.startFrame, userId),
    end_frame: ownedFrame(item.endFrame, userId),
    previous_item_id: item.previousItemId && UUID.test(item.previousItemId) ? item.previousItemId : null,
    // Migration 0039.
    enhanced_prompt: item.enhancedPrompt ? item.enhancedPrompt.trim().slice(0, 1200) : null,
    enhanced_from: item.enhancedFrom ? item.enhancedFrom.trim().slice(0, 1200) : null,
    auto_enhance: item.autoEnhance !== false,
    // Migration 0041.
    drift_review: item.driftReview === "ok" || item.driftReview === "flagged" ? item.driftReview : null,
  } as Database["public"]["Tables"]["fast_video_storyboard_items"]["Insert"]
}

export async function getFastVideoStoryboard(sceneId: string) {
  const session = await ensureSession()
  if (session.error) return { error: session.error, data: [] as FastVideoStoryboardRow[] }

  const { supabase } = session
  const { data, error } = await supabase
    .from("fast_video_storyboard_items")
    .select("*")
    .eq("scene_id", sceneId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) return { error: error.message, data: [] as FastVideoStoryboardRow[] }
  return { data: data || [] }
}

export async function replaceFastVideoStoryboard(input: ReplaceFastVideoStoryboardInput) {
  const session = await ensureSession()
  if (session.error) return { error: session.error }

  const { supabase } = session
  const { projectId, sceneId } = input

  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .select("id, project_id")
    .eq("id", sceneId)
    .single()

  if (sceneError || !scene) {
    return { error: sceneError?.message || "Scene not found" }
  }

  if (scene.project_id !== projectId) {
    return { error: "Selected scene does not belong to the selected project." }
  }

  const items = input.items.slice(0, 60)
  try {
    for (const item of items) item.mediaReferences = validateOwnedReferences(item.mediaReferences, session.user!.id)
  } catch { return { error: "Invalid storyboard media references." } }
  if (items.length === 0) {
    const { error: deleteError } = await supabase
      .from("fast_video_storyboard_items")
      .delete()
      .eq("scene_id", sceneId)

    if (deleteError) return { error: deleteError.message }
  } else {
    const payload = items.map((item, index) => {
      const sanitized = sanitizeStoryboardItem(item, index, session.user!.id)
      sanitized.project_id = projectId
      sanitized.scene_id = sceneId
      return sanitized
    })

    let { error: upsertError } = await supabase
      .from("fast_video_storyboard_items")
      .upsert(payload, { onConflict: "id" })
    // Before migration 0036 there is no provenance column: keep the storyboard, drop only the metadata.
    // Older databases: drop the newest optional columns first, one migration at a time.
    let rows = payload as Record<string, unknown>[]
    const dropped = new Set<number>()
    while (upsertError) {
      const index = OPTIONAL_COLUMN_GROUPS.findIndex((group, i) => !dropped.has(i) && group.some((column) => upsertError!.message.includes(column)))
      if (index < 0) break
      dropped.add(index)
      rows = rows.map((row) => { const copy = { ...row }; for (const column of OPTIONAL_COLUMN_GROUPS[index]) delete copy[column]; return copy })
      ;({ error: upsertError } = await supabase.from("fast_video_storyboard_items").upsert(rows as typeof payload, { onConflict: "id" }))
    }

    if (upsertError) return { error: upsertError.message.includes("media_references") ? "Apply migration 0027 to save storyboard reference snapshots." : upsertError.message }

    const incomingIds = payload.map((item) => item.id)
    const { data: existingRows, error: existingError } = await supabase
      .from("fast_video_storyboard_items")
      .select("id")
      .eq("scene_id", sceneId)

    if (existingError) return { error: existingError.message }

    const idsToDelete = (existingRows || [])
      .map((row) => row.id)
      .filter((id) => !incomingIds.includes(id))

    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("fast_video_storyboard_items")
        .delete()
        .eq("scene_id", sceneId)
        .in("id", idsToDelete)

      if (deleteError) return { error: deleteError.message }
    }
  }

  revalidatePath("/dashboard/fast-video")
  revalidatePath(`/dashboard/projects/${projectId}/scenes/${sceneId}`)

  return { data: true }
}

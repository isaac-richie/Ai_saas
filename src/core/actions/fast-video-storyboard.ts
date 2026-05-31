"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { Database } from "@/core/types/db"

export type FastVideoStoryboardRow = Database["public"]["Tables"]["fast_video_storyboard_items"]["Row"]

type ReplaceFastVideoStoryboardInput = {
  projectId: string
  sceneId: string
  items: Array<{
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
  }>
}

const SCENE_GROUPS = new Set(["Scene A", "Scene B", "Scene C"])
const ITEM_STATUSES = new Set(["draft", "ready"])

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
  orderIndex: number
): Database["public"]["Tables"]["fast_video_storyboard_items"]["Insert"] {
  return {
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
  }
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
  if (items.length === 0) {
    const { error: deleteError } = await supabase
      .from("fast_video_storyboard_items")
      .delete()
      .eq("scene_id", sceneId)

    if (deleteError) return { error: deleteError.message }
  } else {
    const payload = items.map((item, index) => {
      const sanitized = sanitizeStoryboardItem(item, index)
      sanitized.project_id = projectId
      sanitized.scene_id = sceneId
      return sanitized
    })

    const { error: upsertError } = await supabase
      .from("fast_video_storyboard_items")
      .upsert(payload, { onConflict: "id" })

    if (upsertError) return { error: upsertError.message }

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

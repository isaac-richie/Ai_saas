"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { revalidatePath } from "next/cache"

async function ensureSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

async function verifyShot(supabase: Awaited<ReturnType<typeof createClient>>, shotId: string, userId: string) {
  const { data } = await supabase
    .from("shots")
    .select("id, scene_id, generation_settings, scenes!inner(project_id, projects!inner(user_id))")
    .eq("id", shotId)
    .eq("scenes.projects.user_id", userId)
    .maybeSingle()
  return data
}

export async function getNextTakeNumber(shotId: string): Promise<number> {
  const { supabase, user } = await ensureSession()
  if (!user) return 1

  const { data } = await supabase
    .from("shot_generations")
    .select("take_number")
    .eq("shot_id", shotId)
    .order("take_number", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.take_number ?? 0) + 1
}

export async function listTakes(shotId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const shot = await verifyShot(supabase, shotId, user.id)
  if (!shot) return { error: "Shot not found" }

  const { data, error } = await supabase
    .from("shot_generations")
    .select("id, shot_id, take_number, prompt, compiled_prompt, model_version_used, status, output_url, thumbnail_url, first_frame_url, last_frame_url, duration_seconds, aspect_ratio, parameters, created_at")
    .eq("shot_id", shotId)
    .order("take_number", { ascending: true })

  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function approveTake(shotId: string, takeId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const shot = await verifyShot(supabase, shotId, user.id)
  if (!shot) return { error: "Shot not found" }

  const { data: take } = await supabase
    .from("shot_generations")
    .select("id,review_status,last_frame_url")
    .eq("id", takeId)
    .eq("shot_id", shotId)
    .eq("status", "completed")
    .maybeSingle()

  if (!take) return { error: "Take not found or not completed" }
  const productionShot = typeof shot.generation_settings === "object"
    && shot.generation_settings !== null
    && !Array.isArray(shot.generation_settings)
    && typeof shot.generation_settings.production_job_id === "string"
  // AI continuity review is advisory. Manual approval may override a rejected
  // verdict, but the ending frame is still required for the next-shot handoff.
  if (productionShot && !take.last_frame_url) return { error: "Inspect this take before approving it for the continuity chain." }

  const { error } = await supabase
    .from("shots")
    .update({ approved_take_id: takeId, updated_at: new Date().toISOString() })
    .eq("id", shotId)

  if (error) return { error: error.message }
  return { data: { approved: true } }
}

export async function unapproveShot(shotId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const shot = await verifyShot(supabase, shotId, user.id)
  if (!shot) return { error: "Shot not found" }

  const { error } = await supabase
    .from("shots")
    .update({ approved_take_id: null, updated_at: new Date().toISOString() })
    .eq("id", shotId)

  if (error) return { error: error.message }
  return { data: { approved: false } }
}

export async function createTake(input: {
  shotId: string
  prompt: string
  compiledPrompt?: string
  negativePrompt?: string
  provider?: string
  model?: string
  durationSeconds?: number
  aspectRatio?: string
  outputUrl?: string
  status?: string
  parameters?: Record<string, unknown>
}) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const shot = await verifyShot(supabase, input.shotId, user.id)
  if (!shot) return { error: "Shot not found" }

  const takeNumber = await getNextTakeNumber(input.shotId)

  const { data, error } = await supabase
    .from("shot_generations")
    .insert({
      shot_id: input.shotId,
      take_number: takeNumber,
      prompt: input.prompt,
      compiled_prompt: input.compiledPrompt || null,
      negative_prompt: input.negativePrompt || null,
      model_version_used: input.model || null,
      duration_seconds: input.durationSeconds || null,
      aspect_ratio: input.aspectRatio || null,
      output_url: input.outputUrl || null,
      status: input.status || "pending",
      parameters: input.parameters || {},
    })
    .select("id, take_number")
    .single()

  if (error) return { error: error.message }

  if (input.status === "completed" && data?.id) {
    await supabase
      .from("shots")
      .update({ approved_take_id: data.id, updated_at: new Date().toISOString() })
      .eq("id", input.shotId)
      .is("approved_take_id", null)
  }

  return { data }
}

export async function updateTakeMedia(takeId: string, media: {
  outputUrl?: string
  thumbnailUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  status?: string
}) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const updatePayload: Record<string, unknown> = {}
  if (media.outputUrl) updatePayload.output_url = media.outputUrl
  if (media.thumbnailUrl) updatePayload.thumbnail_url = media.thumbnailUrl
  if (media.firstFrameUrl) updatePayload.first_frame_url = media.firstFrameUrl
  if (media.lastFrameUrl) updatePayload.last_frame_url = media.lastFrameUrl
  if (media.status) updatePayload.status = media.status

  const { error } = await supabase
    .from("shot_generations")
    .update(updatePayload)
    .eq("id", takeId)

  if (error) return { error: error.message }
  return { data: { updated: true } }
}

export async function deleteTake(shotId: string, takeId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const shot = await verifyShot(supabase, shotId, user.id)
  if (!shot) return { error: "Shot not found" }

  const { data: currentShot } = await supabase
    .from("shots")
    .select("approved_take_id")
    .eq("id", shotId)
    .maybeSingle()

  if (currentShot?.approved_take_id === takeId) {
    await supabase
      .from("shots")
      .update({ approved_take_id: null, updated_at: new Date().toISOString() })
      .eq("id", shotId)
  }

  const { error } = await supabase
    .from("shot_generations")
    .delete()
    .eq("id", takeId)
    .eq("shot_id", shotId)

  if (error) return { error: error.message }

  revalidatePath("/dashboard/gallery")
  return { data: { deleted: true } }
}

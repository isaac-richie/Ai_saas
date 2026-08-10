"use server"

import { createClient } from "@/infrastructure/supabase/server"

async function ensureSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export type GenerationJobStatus =
  | "queued"
  | "preparing"
  | "submitted"
  | "generating"
  | "downloading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"

export type GenerationJob = {
  id: string
  shotId: string
  takeId: string | null
  provider: string
  model: string | null
  providerTaskId: string | null
  status: GenerationJobStatus
  progress: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

function toJob(row: Record<string, unknown>): GenerationJob {
  return {
    id: row.id as string,
    shotId: row.shot_id as string,
    takeId: (row.take_id as string) || null,
    provider: row.provider as string,
    model: (row.model as string) || null,
    providerTaskId: (row.provider_task_id as string) || null,
    status: row.status as GenerationJobStatus,
    progress: (row.progress as number) || 0,
    errorMessage: (row.error_message as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function createGenerationJob(input: {
  shotId: string
  provider: string
  model?: string | null
  providerTaskId?: string | null
  takeId?: string | null
}) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({
      user_id: user.id,
      shot_id: input.shotId,
      provider: input.provider,
      model: input.model || null,
      provider_task_id: input.providerTaskId || null,
      take_id: input.takeId || null,
      status: "queued",
      progress: 0,
    })
    .select("*")
    .single()

  if (error) return { error: error.message }
  return { data: toJob(data as Record<string, unknown>) }
}

export async function updateGenerationJobStatus(
  jobId: string,
  status: GenerationJobStatus,
  extra?: { progress?: number; errorMessage?: string; providerTaskId?: string; takeId?: string }
) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (extra?.progress !== undefined) update.progress = extra.progress
  if (extra?.errorMessage !== undefined) update.error_message = extra.errorMessage
  if (extra?.providerTaskId !== undefined) update.provider_task_id = extra.providerTaskId
  if (extra?.takeId !== undefined) update.take_id = extra.takeId

  const { data, error } = await supabase
    .from("generation_jobs")
    .update(update)
    .eq("id", jobId)
    .eq("user_id", user.id)
    .select("*")
    .single()

  if (error) return { error: error.message }
  return { data: toJob(data as Record<string, unknown>) }
}

export async function listGenerationJobs(options?: {
  limit?: number
  activeOnly?: boolean
}) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  let query = supabase
    .from("generation_jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(options?.limit || 20)

  if (options?.activeOnly) {
    query = query.in("status", ["queued", "preparing", "submitted", "generating", "downloading", "processing"])
  }

  const { data, error } = await query

  if (error) return { error: error.message }
  return { data: (data || []).map((row) => toJob(row as Record<string, unknown>)) }
}

export async function cancelGenerationJob(jobId: string) {
  return updateGenerationJobStatus(jobId, "cancelled")
}

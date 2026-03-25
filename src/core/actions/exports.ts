"use server"

import { createClient } from "@/infrastructure/supabase/server"

export type ExportProfile = "master_16_9" | "social_9_16" | "square_1_1"
export type ExportStatus = "queued" | "processing" | "completed" | "failed"

export type ExportJobRow = {
  id: string
  user_id: string
  project_id: string
  profile: string
  target_format: string
  status: ExportStatus
  progress: number
  output_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  projects?: { name?: string | null } | { name?: string | null }[] | null
}

export type ExportJobItemRow = {
  id: string
  job_id: string
  shot_generation_id: string | null
  source_url: string | null
  output_url: string | null
  status: ExportStatus
  error_message: string | null
  order_index: number
  created_at: string
}

const PROFILE_TO_FORMAT: Record<ExportProfile, string> = {
  master_16_9: "16:9_h264_master",
  social_9_16: "9:16_social",
  square_1_1: "1:1_square",
}

function toProfile(value: string): ExportProfile {
  if (value === "social_9_16") return "social_9_16"
  if (value === "square_1_1") return "square_1_1"
  return "master_16_9"
}

async function ensureSession() {
  const supabase = await createClient()
  let {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const { data } = await supabase.auth.signInAnonymously()
    user = data.user
  }

  return { supabase, user }
}

export async function queueGalleryExport(optionIds: string[], profileRaw: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }
  const db = supabase

  const profile = toProfile(profileRaw)
  const ids = Array.from(new Set(optionIds.filter(Boolean)))
  if (ids.length === 0) return { error: "No assets selected" }

  const { data: options, error: optionError } = await supabase
    .from("shot_generations")
    .select("id, shot_id, output_url")
    .in("id", ids)

  if (optionError || !options?.length) return { error: optionError?.message || "No exportable assets found" }

  const shotIds = Array.from(new Set(options.map((opt) => opt.shot_id).filter(Boolean)))
  const { data: shots, error: shotError } = await supabase
    .from("shots")
    .select("id, scene_id")
    .in("id", shotIds)

  if (shotError || !shots?.length) return { error: shotError?.message || "Cannot resolve shots" }

  const sceneIds = Array.from(new Set(shots.map((shot) => shot.scene_id).filter(Boolean)))
  const { data: scenes, error: sceneError } = await supabase
    .from("scenes")
    .select("id, project_id")
    .in("id", sceneIds)

  if (sceneError || !scenes?.length) return { error: sceneError?.message || "Cannot resolve scenes" }

  const projectIds = Array.from(new Set(scenes.map((scene) => scene.project_id).filter(Boolean)))
  const { data: ownedProjects, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .in("id", projectIds)

  if (projectError || !ownedProjects?.length) return { error: projectError?.message || "Cannot verify ownership" }

  const ownedSet = new Set(ownedProjects.map((project) => project.id))
  const sceneToProject = new Map(scenes.map((scene) => [scene.id, scene.project_id]))
  const shotToScene = new Map(shots.map((shot) => [shot.id, shot.scene_id]))

  const validOptions = options.filter((option) => {
    if (!option.output_url) return false
    const sceneId = shotToScene.get(option.shot_id)
    const projectId = sceneId ? sceneToProject.get(sceneId) : null
    return Boolean(projectId && ownedSet.has(projectId))
  })

  if (validOptions.length === 0) return { error: "No valid assets to export" }

  const groupedByProject = new Map<string, typeof validOptions>()
  validOptions.forEach((option) => {
    const sceneId = shotToScene.get(option.shot_id)
    const projectId = sceneId ? sceneToProject.get(sceneId) : null
    if (!projectId) return
    if (!groupedByProject.has(projectId)) groupedByProject.set(projectId, [])
    groupedByProject.get(projectId)?.push(option)
  })

  let createdJobs = 0
  let queuedItems = 0

  for (const [projectId, projectOptions] of groupedByProject.entries()) {
    const { data: insertJob, error: insertJobError } = await db
      .from("export_jobs")
      .insert({
        user_id: user.id,
        project_id: projectId,
        profile,
        target_format: PROFILE_TO_FORMAT[profile],
        status: "queued",
      })
      .select("id")
      .single()

    if (insertJobError || !insertJob?.id) continue

    createdJobs += 1

    const itemsPayload = projectOptions.map((option, index) => ({
      job_id: insertJob.id,
      shot_generation_id: option.id,
      source_url: option.output_url,
      order_index: index,
      status: "queued",
    }))

    const itemInsert = await db
      .from("export_job_items")
      .insert(itemsPayload)

    if (!itemInsert.error) queuedItems += projectOptions.length
  }

  return { data: { jobCount: createdJobs, itemCount: queuedItems, profile } }
}

export async function listExportJobs(projectId?: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { data: [] as ExportJobRow[] }
  const db = supabase

  let query = db
    .from("export_jobs")
    .select("id, user_id, project_id, profile, target_format, status, progress, output_url, error_message, created_at, updated_at, projects(name)")

  query = query.eq("user_id", user.id)
  if (projectId) {
    query = query.eq("project_id", projectId)
  }

  const { data, error } = await query.order("created_at", { ascending: false }) as { data: ExportJobRow[] | null; error: { message: string } | null }
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function getExportJobItems(jobId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }
  const db = supabase

  const { data: job, error: jobError } = await db
    .from("export_jobs")
    .select("id, user_id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (jobError || !job?.id) return { error: "Export job not found" }

  const { data, error } = await db
    .from("export_job_items")
    .select("id, job_id, shot_generation_id, source_url, output_url, status, error_message, order_index, created_at")
    .eq("job_id", jobId)
    .order("order_index", { ascending: true }) as { data: ExportJobItemRow[] | null; error: { message: string } | null }

  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function retryExportJob(jobId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }
  const db = supabase

  const { error } = await db
    .from("export_jobs")
    .update({ status: "queued", progress: 0, error_message: null, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  await db
    .from("export_job_items")
    .update({ status: "queued", error_message: null, updated_at: new Date().toISOString() })
    .eq("job_id", jobId)

  return { success: true }
}

export async function cancelExportJob(jobId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }
  const db = supabase

  const { error } = await db
    .from("export_jobs")
    .delete()
    .eq("id", jobId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  return { success: true }
}

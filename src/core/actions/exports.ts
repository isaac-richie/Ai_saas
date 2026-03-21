"use server"

import { createClient } from "@/infrastructure/supabase/server"

type ExportProfile = "master_16_9" | "social_9_16" | "square_1_1"

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

export async function queueGalleryExport(optionIds: string[], profileRaw: string) {
  const supabase = await createClient()
  let {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const { data } = await supabase.auth.signInAnonymously()
    user = data.user
  }

  if (!user) return { error: "Unauthorized" }

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

  const db = supabase as unknown as {
    from: (table: string) => {
      insert: (input: unknown) => {
        select: (fields: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> }
      }
    }
  }

  let createdJobs = 0
  let queuedItems = 0

  for (const [projectId, projectOptions] of groupedByProject.entries()) {
    const insertJob = await db
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

    if (insertJob.error || !insertJob.data?.id) {
      continue
    }

    createdJobs += 1

    const itemsPayload = projectOptions.map((option, index) => ({
      job_id: insertJob.data!.id,
      shot_generation_id: option.id,
      source_url: option.output_url,
      order_index: index,
      status: "queued",
    }))

    const itemInsert = await (supabase as unknown as { from: (table: string) => { insert: (input: unknown) => Promise<{ error: { message: string } | null }> } })
      .from("export_job_items")
      .insert(itemsPayload)

    if (!itemInsert.error) queuedItems += projectOptions.length
  }

  return { data: { jobCount: createdJobs, itemCount: queuedItems, profile } }
}

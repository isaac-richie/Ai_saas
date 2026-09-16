"use server"

import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { productionPlanSchema, canApproveProduction } from "@/core/validation/production-crew"
import { generateFastVideo, persistFastVideoMedia, pollFastVideoStatus } from "@/core/actions/fast-video"
import { resolveKieVideoModelByFamily } from "@/core/config/kie-video-models"
import type { Json } from "@/core/types/db"
import { productionAssetsSchema, ownsAssetUrl } from "@/core/validation/production-assets"

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), brief: z.string().trim().min(8).max(4000), assets: productionAssetsSchema.default([]) }),
  z.object({ action: z.literal("plan"), id: z.string().uuid(), plan: productionPlanSchema }),
  z.object({ action: z.literal("approve"), id: z.string().uuid() }),
])

export async function listProductions() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { data, error } = await db.from("production_jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20)
  if (error) return { error: "Production Desk is not available yet. Apply migration 0021 to enable saved productions." }
  return { data }
}

export async function updateProduction(input: unknown) {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { error: "Please check the production details." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const payload = parsed.data
  if (payload.action === "create" && payload.assets.some(asset => !ownsAssetUrl(asset.url, user.id))) return { error: "Choose references uploaded to your account." }
  if (payload.action === "approve") {
    const { data: job, error } = await db.from("production_jobs").select("plan").eq("id", payload.id).eq("user_id", user.id).maybeSingle()
    if (error || !job || !canApproveProduction(job.plan)) return { error: "Resolve the crew's blocking review notes before approval. Create a revised brief to develop a new plan." }
  }
  const query = payload.action === "create"
    ? db.from("production_jobs").insert({ user_id: user.id, brief: payload.brief, ...(payload.assets.length ? { reference_assets: payload.assets } : {}) })
    : db.from("production_jobs").update(payload.action === "plan"
      ? { status: "awaiting_approval", plan: payload.plan }
      : { status: "approved" }).eq("id", payload.id).eq("user_id", user.id).eq("status", payload.action === "plan" ? "brief" : "awaiting_approval")
  const { data, error } = await query.select("*").single()
  if (error && ["42703", "PGRST204"].includes(error.code || "")) return { error: "Reference storage is not configured yet. Apply migration 0026, then save your brief again. Your draft is still here." }
  if (error) return { error: "Could not save this production. Refresh and try again; the plan may already have changed." }
  return { data }
}

const productionRevisionSchema = z.object({
  productionId: z.string().uuid(),
  direction: z.string().trim().min(8).max(2000),
})

export async function createProductionRevision(input: unknown) {
  const parsed = productionRevisionSchema.safeParse(input)
  if (!parsed.success) return { error: "Describe the direction you want revised." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { data: source } = await db.from("production_jobs").select("*").eq("id", parsed.data.productionId).eq("user_id", user.id).maybeSingle()
  if (!source) return { error: "Production not found." }
  const lineageRoot = source.parent_job_id || source.id
  const { data: latestRevision } = await db.from("production_jobs").select("revision_number").eq("user_id", user.id).eq("parent_job_id", lineageRoot).order("revision_number", { ascending: false }).limit(1).maybeSingle()
  const nextRevision = Math.max(source.revision_number || 1, latestRevision?.revision_number || 1) + 1
  const revisedBrief = `${source.brief}\n\nRevision direction:\n${parsed.data.direction}`
  const { data, error } = await db.from("production_jobs").insert({ user_id: user.id, brief: revisedBrief, parent_job_id: lineageRoot, revision_number: nextRevision, ...(source.reference_assets ? { reference_assets: source.reference_assets } : {}) }).select("*").single()
  if (error) {
    const migrationMissing = ["42703", "PGRST204"].includes(error.code || "")
    return { error: migrationMissing ? "Apply migration 0024 to create versioned production revisions." : "Another revision was created at the same time. Refresh and retry." }
  }
  return { data }
}

export async function materializeProduction(jobId: string) {
  const id = z.string().uuid().safeParse(jobId)
  if (!id.success) return { error: "Choose a valid production." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { data: sourceJob } = await db.from("production_jobs").select("plan").eq("id", id.data).eq("user_id", user.id).maybeSingle()
  const { data, error } = await db.rpc("materialize_production_job", { target_job: id.data })
  if (error) return { error: error.message.includes("Could not find") ? "Apply migration 0022 to create production workspaces." : "Could not create the production workspace." }
  const workspace = data as { projectId: string; sceneId: string; sequenceId: string; existing: boolean }
  const plan = productionPlanSchema.safeParse(sourceJob?.plan)
  const parsedPlan = plan.success ? plan.data : null
  const ledger = parsedPlan?.crew?.bible.continuityLedger
  if (ledger && parsedPlan) {
    const { data: shots, error: shotsError } = await db.from("shots").select("id,sequence_order,generation_settings").eq("scene_id", workspace.sceneId).order("sequence_order")
    if (shotsError || !shots) return { error: "The workspace was created, but its continuity locks could not be loaded. Retry to finish setup." }
    for (const [index, shot] of shots.entries()) {
      const deliverable = parsedPlan.deliverables[index]
      const previousShot = index > 0 ? shots[index - 1] : null
      const existingSettings = isJsonObject(shot.generation_settings) ? shot.generation_settings : {}
      const continuityState = {
        start: deliverable?.continuityStartState || null,
        end: deliverable?.continuityEndState || null,
        intentionalChanges: deliverable?.intentionalChanges || [],
      }
      const { error: lockError } = await db.from("shot_continuity").upsert({
        shot_id: shot.id,
        character_locked: true,
        character_value: [ledger.subjectIdentity, ledger.heroObjects.length ? `Hero objects: ${ledger.heroObjects.join(", ")}` : ""].filter(Boolean).join(" | "),
        wardrobe_locked: true,
        wardrobe_value: ledger.wardrobe,
        location_locked: true,
        location_value: `${ledger.location} | ${ledger.environment}`,
        lighting_locked: true,
        lighting_value: ledger.lighting,
        color_grade_locked: true,
        color_grade_value: ledger.palette.join(", "),
        camera_style_locked: true,
        camera_style_value: `${ledger.cameraRules} | ${ledger.screenDirection}`,
        source_shot_id: previousShot?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "shot_id" })
      const { error: settingsError } = await db.from("shots").update({
        generation_settings: { ...existingSettings, continuity_ledger: ledger, continuity_state: continuityState } as Json,
      }).eq("id", shot.id)
      if (lockError || settingsError) return { error: "The workspace was created, but its continuity contract was not fully saved. Retry to finish setup." }
    }
  }
  return { data: workspace }
}

function isJsonObject(value: Json | null): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const productionShotSchema = z.object({ productionId: z.string().uuid(), shotId: z.string().uuid() })
const activeGenerationStatuses = ["queued", "preparing", "submitted", "generating", "downloading", "processing"]

async function getOwnedProductionShot(db: Awaited<ReturnType<typeof createClient>>, userId: string, productionId: string, shotId: string) {
  const { data: production } = await db.from("production_jobs").select("*").eq("id", productionId).eq("user_id", userId).eq("status", "approved").maybeSingle()
  if (!production?.scene_id) return null
  const { data: shot } = await db.from("shots").select("id,name,prompt_text,description,model,duration_target,aspect_ratio,generation_settings,approved_take_id,previous_shot_id").eq("id", shotId).eq("scene_id", production.scene_id).maybeSingle()
  return shot ? { production, shot } : null
}

export async function listProductionShots(productionId: string) {
  const id = z.string().uuid().safeParse(productionId)
  if (!id.success) return { error: "Choose a valid production." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { data: production } = await db.from("production_jobs").select("scene_id").eq("id", id.data).eq("user_id", user.id).maybeSingle()
  if (!production?.scene_id) return { error: "Create the production workspace first." }
  const { data: shots, error } = await db.from("shots").select("id,name,prompt_text,model,duration_target,aspect_ratio,approved_take_id,previous_shot_id,shot_generations!shot_generations_shot_id_fkey(id,take_number,status,output_url,model_version_used,parameters,review_status,review_notes,media_inspection,first_frame_url,last_frame_url,created_at),generation_jobs(id,status,progress,error_message,provider_task_id,take_id,created_at)").eq("scene_id", production.scene_id).order("sequence_order")
  if (error) return { error: "Could not load production shots." }
  return { data: shots || [] }
}

export async function queueProductionShot(input: unknown) {
  const parsed = productionShotSchema.safeParse(input)
  if (!parsed.success) return { error: "Choose a valid production shot." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const owned = await getOwnedProductionShot(db, user.id, parsed.data.productionId, parsed.data.shotId)
  if (!owned) return { error: "Approved production shot not found." }
  const { shot, production } = owned
  let continuityReferenceUrl: string | null = null
  if (!shot.previous_shot_id) {
    const references = productionAssetsSchema.safeParse(production.reference_assets || [])
    const openingReference = references.success ? references.data.find(asset => asset.role === "character" || asset.role === "product") : null
    if (openingReference && ownsAssetUrl(openingReference.url, user.id)) continuityReferenceUrl = openingReference.url
  }
  if (shot.previous_shot_id) {
    const { data: previousShot } = await db.from("shots").select("approved_take_id").eq("id", shot.previous_shot_id).eq("scene_id", production.scene_id).maybeSingle()
    if (!previousShot?.approved_take_id) return { error: "Approve the previous shot before generating this continuity-linked shot." }
    const { data: previousTake } = await db.from("shot_generations").select("last_frame_url").eq("id", previousShot.approved_take_id).eq("status", "completed").maybeSingle()
    if (!previousTake?.last_frame_url) return { error: "Inspect the approved previous take first so its ending frame can guide this shot." }
    continuityReferenceUrl = previousTake.last_frame_url
  }
  const { data: active } = await db.from("generation_jobs").select("id,status,provider_task_id,take_id").eq("user_id", user.id).eq("shot_id", shot.id).in("status", activeGenerationStatuses).limit(1).maybeSingle()
  if (active) return { data: active, existing: true }

  const { data: latestTake } = await db.from("shot_generations").select("take_number").eq("shot_id", shot.id).order("take_number", { ascending: false }).limit(1).maybeSingle()
  const family = shot.model === "seedance" ? "seedance" : "kling"
  const model = resolveKieVideoModelByFamily({ familyId: family, useImageToVideo: Boolean(continuityReferenceUrl) })
  const duration = Math.max(5, Math.min(15, shot.duration_target || 10))
  const aspect = ["16:9", "9:16", "1:1", "4:5", "21:9"].includes(shot.aspect_ratio || "") ? shot.aspect_ratio! : "16:9"
  const settings = (shot.generation_settings || {}) as Record<string, unknown>
  const { data: take, error: takeError } = await db.from("shot_generations").insert({
    shot_id: shot.id, take_number: (latestTake?.take_number || 0) + 1, prompt: shot.prompt_text || shot.description || shot.name,
    compiled_prompt: shot.prompt_text || null, negative_prompt: typeof settings.negative_prompt === "string" ? settings.negative_prompt : null,
    model_version_used: model, duration_seconds: duration, aspect_ratio: aspect, status: "pending",
    parameters: { source: "production_crew", production_job_id: production.id, requested_duration_seconds: duration, requested_aspect_ratio: aspect },
  }).select("id,take_number").single()
  if (takeError || !take) return { error: "Could not create the take record." }
  const { data: generationJob, error: jobError } = await db.from("generation_jobs").insert({ user_id: user.id, shot_id: shot.id, take_id: take.id, provider: "kie", model, status: "preparing", progress: 5 }).select("*").single()
  if (jobError || !generationJob) {
    await db.from("shot_generations").update({ status: "failed" }).eq("id", take.id)
    return { error: "Could not create the generation job." }
  }

  const generated = await generateFastVideo({
    request_type: "fast_video", project_id: production.project_id, scene_id: production.scene_id, shot_id: shot.id,
    prompt_inputs: { text_subject: shot.prompt_text || shot.description || shot.name, style_preset_id: null, motion_preset_id: null, aspect_ratio: aspect, reference_image: continuityReferenceUrl, variation_setting: "strict" },
    settings: { duration_seconds: duration, model },
  })
  if (generated.error || !generated.data) {
    await Promise.all([
      db.from("shot_generations").update({ status: "failed" }).eq("id", take.id),
      db.from("generation_jobs").update({ status: "failed", progress: 100, error_message: generated.error || "Generation failed", updated_at: new Date().toISOString() }).eq("id", generationJob.id),
    ])
    return { error: generated.error || "Generation failed.", data: { id: generationJob.id, status: "failed", take_id: take.id } }
  }
  const completed = generated.data.status === "completed" && Boolean(generated.data.url)
  await Promise.all([
    db.from("shot_generations").update({ status: completed ? "completed" : "processing", output_url: generated.data.url, parameters: { source: "production_crew", production_job_id: production.id, task_id: generated.data.taskId, trace_id: generated.data.debug?.traceId, requested_duration_seconds: duration, applied_duration_seconds: generated.data.durationSeconds, requested_aspect_ratio: aspect } }).eq("id", take.id),
    db.from("generation_jobs").update({ status: completed ? "completed" : "submitted", progress: completed ? 100 : 15, provider_task_id: generated.data.taskId, updated_at: new Date().toISOString() }).eq("id", generationJob.id),
  ])
  return { data: { ...generationJob, status: completed ? "completed" : "submitted", provider_task_id: generated.data.taskId, take_id: take.id, output_url: generated.data.url, take_number: take.take_number } }
}

export async function pollProductionGeneration(generationJobId: string) {
  const id = z.string().uuid().safeParse(generationJobId)
  if (!id.success) return { error: "Invalid generation job." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { data: job } = await db.from("generation_jobs").select("*").eq("id", id.data).eq("user_id", user.id).maybeSingle()
  if (!job) return { error: "Generation job not found." }
  if (["completed", "failed", "cancelled"].includes(job.status)) return { data: job }
  if (!job.provider_task_id) return { data: job }
  const result = await pollFastVideoStatus(job.provider_task_id)
  // Transport failures do not prove that the provider's paid generation failed.
  if (result.error) return { error: result.error, data: job }
  if (result.data?.status === "failed") {
    const message = result.error || result.data?.error || "Generation failed."
    await Promise.all([
      db.from("generation_jobs").update({ status: "failed", progress: 100, error_message: message, updated_at: new Date().toISOString() }).eq("id", job.id),
      job.take_id ? db.from("shot_generations").update({ status: "failed" }).eq("id", job.take_id) : Promise.resolve(),
    ])
    return { error: message, data: { ...job, status: "failed", error_message: message } }
  }
  if (result.data?.status !== "completed" || !result.data.url) {
    await db.from("generation_jobs").update({ status: "generating", progress: Math.min(90, Math.max(25, job.progress + 10)), updated_at: new Date().toISOString() }).eq("id", job.id)
    return { data: { ...job, status: "generating", progress: Math.min(90, Math.max(25, job.progress + 10)) } }
  }
  const persisted = await persistFastVideoMedia(result.data.url)
  const url = persisted.data?.url || result.data.url
  await Promise.all([
    db.from("generation_jobs").update({ status: "completed", progress: 100, updated_at: new Date().toISOString() }).eq("id", job.id),
    job.take_id ? db.from("shot_generations").update({ status: "completed", output_url: url }).eq("id", job.take_id) : Promise.resolve(),
  ])
  return { data: { ...job, status: "completed", progress: 100, output_url: url } }
}

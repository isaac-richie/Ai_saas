import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { compileProductionPlan, createCrewRunner } from "@/core/services/production-crew"
import { crewReviewSchema, crewShotsSchema, departmentDirectionSchema, productionBibleSchema } from "@/core/validation/production-crew"
import { enforcePromptCompliance } from "@/core/utils/ai/prompt-compliance"
import { productionAssetsSchema, ownsAssetUrl } from "@/core/validation/production-assets"

const stageContextSchema = z.object({
  model: z.string().optional(),
  story: productionBibleSchema.optional(),
  camera: departmentDirectionSchema.optional(),
  lighting: departmentDirectionSchema.optional(),
  productionDesign: departmentDirectionSchema.optional(),
  performance: departmentDirectionSchema.optional(),
  editor: crewShotsSchema.optional(),
  stages: z.array(z.object({ role: z.string(), responseId: z.string() })).default([]),
})

export type CrewStageResult = {
  complete: boolean
  stage: "story" | "departments" | "shots" | "complete"
  message: string
  plan?: unknown
}

export async function advanceProductionCrew(client: SupabaseClient, userId: string, jobId: string): Promise<{ data?: CrewStageResult; error?: string }> {
  const claimUntil = new Date(Date.now() + 3 * 60_000).toISOString()
  const now = new Date().toISOString()
  const { data: job, error: claimError } = await client.from("production_jobs")
    .update({ planning_claimed_until: claimUntil, planning_error: null, planning_updated_at: now })
    .eq("id", jobId).eq("user_id", userId).eq("status", "brief")
    .or(`planning_claimed_until.is.null,planning_claimed_until.lt.${now}`)
    .select("*").maybeSingle()
  if (claimError) return { error: "Apply migration 0025 to enable resumable crew planning." }
  if (!job) {
    const { data: existing } = await client.from("production_jobs").select("status,plan").eq("id", jobId).eq("user_id", userId).maybeSingle()
    if (existing?.status === "awaiting_approval" || existing?.status === "approved") return { data: { complete: true, stage: "complete", message: "Production plan is ready", plan: existing.plan } }
    return { error: "The crew is already working on this stage. Retry shortly." }
  }

  try {
    const context = stageContextSchema.parse(job.planning_context || {})
    const model = context.model || process.env.PRODUCTION_CREW_MODEL || "gpt-6-astra"
    context.model = model
    const references = productionAssetsSchema.parse(job.reference_assets || [])
    if (references.some(asset => !ownsAssetUrl(asset.url, userId))) throw new Error("Invalid reference ownership")
    const run = createCrewRunner(model, references)
    if (job.planning_stage === "brief") {
      const safe = enforcePromptCompliance({ prompt: job.brief, outputType: "video" })
      if (safe.blocked || safe.flags.length) throw new Error("The brief requires a policy-safe rewrite.")
      const story = await run("story-director", "Write the treatment and world bible. Give each beat an emotional purpose. Build a continuityLedger with concrete reusable identity, wardrobe, hero objects, materials, location, environment, palette, lighting, screen direction, camera rules, and invariants. Mark invented creative choices as assumptions.", { brief: job.brief }, productionBibleSchema)
      if (!story.value.continuityLedger) throw new Error("The story crew did not produce a complete continuity ledger.")
      await saveCheckpoint(client, job.id, claimUntil, "brief", "story", { ...context, story: story.value, stages: [...context.stages, { role: "story-director", responseId: story.responseId }] })
      return { data: { complete: false, stage: "story", message: "Story bible locked" } }
    }
    if (job.planning_stage === "story" && context.story) {
      const [camera, lighting, productionDesign, performance] = await Promise.all([
        run("cinematographer", "Design coverage for all three beats: framing, lens intent, one motivated movement, blocking, eyeline, and cut point. Preserve the shared bible.", { brief: job.brief, bible: context.story }, departmentDirectionSchema),
        run("lighting-director", "Define motivated key, fill, practicals, palette, and exposure intent for each beat. Maintain time of day and light direction. Do not invent independent scene changes.", { brief: job.brief, bible: context.story }, departmentDirectionSchema),
        run("production-designer", "Lock the physical world for all three beats: wardrobe, props, materials, location dressing, palette, and repeatable visual motifs. Preserve continuity anchors and avoid adding new hero objects without a story purpose.", { brief: job.brief, bible: context.story }, departmentDirectionSchema),
        run("performance-director", "Direct behavior for all three beats: precise blocking, gestures, eyelines, energy, screen direction, and timing. Keep action physically plausible for a ten-second shot and preserve the same subject identity.", { brief: job.brief, bible: context.story }, departmentDirectionSchema),
      ])
      await saveCheckpoint(client, job.id, claimUntil, "story", "departments", { ...context, camera: camera.value, lighting: lighting.value, productionDesign: productionDesign.value, performance: performance.value, stages: [...context.stages, { role: "cinematographer", responseId: camera.responseId }, { role: "lighting-director", responseId: lighting.responseId }, { role: "production-designer", responseId: productionDesign.responseId }, { role: "performance-director", responseId: performance.responseId }] })
      return { data: { complete: false, stage: "departments", message: "Camera, lighting, design, and performance locked" } }
    }
    if (job.planning_stage === "departments" && context.story && context.camera && context.lighting && (!context.productionDesign || !context.performance)) {
      const [productionDesign, performance] = await Promise.all([
        run("production-designer", "Lock the physical world for all three beats: wardrobe, props, materials, location dressing, palette, and repeatable visual motifs. Preserve continuity anchors and avoid adding new hero objects without a story purpose.", { brief: job.brief, bible: context.story }, departmentDirectionSchema),
        run("performance-director", "Direct behavior for all three beats: precise blocking, gestures, eyelines, energy, screen direction, and timing. Keep action physically plausible for a ten-second shot and preserve the same subject identity.", { brief: job.brief, bible: context.story }, departmentDirectionSchema),
      ])
      await saveCheckpoint(client, job.id, claimUntil, "departments", "departments", { ...context, productionDesign: productionDesign.value, performance: performance.value, stages: [...context.stages, { role: "production-designer", responseId: productionDesign.responseId }, { role: "performance-director", responseId: performance.responseId }] })
      return { data: { complete: false, stage: "departments", message: "Production design and performance direction added" } }
    }
    if (job.planning_stage === "departments" && context.story && context.camera && context.lighting && context.productionDesign && context.performance) {
      const editor = await run("shot-editor", "Compile exactly three executable prompts in beat order. Repeat concrete continuity-ledger details inside every prompt; never say only same or unchanged. For each shot define continuity startState, endState, carriedDetails, and only intentionalChanges. Shot 2 must begin at shot 1's end state; shot 3 must begin at shot 2's end state. Include action progression, framing, motion, lighting, wardrobe, objects, and performance. Resolve contradictions in favor of the bible.", { brief: job.brief, bible: context.story, camera: context.camera, lighting: context.lighting, productionDesign: context.productionDesign, performance: context.performance }, crewShotsSchema)
      if (editor.value.shots.some(shot => !shot.continuity)) throw new Error("The shot crew did not produce complete state handoffs.")
      for (const shot of editor.value.shots) {
        const checked = enforcePromptCompliance({ prompt: shot.prompt, negativePrompt: shot.negativePrompt, outputType: "video" })
        if (checked.blocked || checked.flags.length) throw new Error("A compiled shot needs a policy-safe rewrite.")
      }
      await saveCheckpoint(client, job.id, claimUntil, "departments", "shots", { ...context, editor: editor.value, stages: [...context.stages, { role: "shot-editor", responseId: editor.responseId }] })
      return { data: { complete: false, stage: "shots", message: "Shot prompts compiled" } }
    }
    if (job.planning_stage === "shots" && context.story && context.camera && context.lighting && context.editor && (!context.productionDesign || !context.performance)) {
      const [productionDesign, performance] = await Promise.all([
        run("production-designer", "Lock the physical world for all three beats: wardrobe, props, materials, location dressing, palette, and repeatable visual motifs. Preserve continuity anchors and avoid adding new hero objects without a story purpose.", { brief: job.brief, bible: context.story }, departmentDirectionSchema),
        run("performance-director", "Direct behavior for all three beats: precise blocking, gestures, eyelines, energy, screen direction, and timing. Keep action physically plausible for a ten-second shot and preserve the same subject identity.", { brief: job.brief, bible: context.story }, departmentDirectionSchema),
      ])
      const stagesWithoutStaleEditor = context.stages.filter((stage) => stage.role !== "shot-editor")
      await saveCheckpoint(client, job.id, claimUntil, "shots", "departments", { ...context, editor: undefined, productionDesign: productionDesign.value, performance: performance.value, stages: [...stagesWithoutStaleEditor, { role: "production-designer", responseId: productionDesign.responseId }, { role: "performance-director", responseId: performance.responseId }] })
      return { data: { complete: false, stage: "departments", message: "New department direction added; shot prompts will be recompiled" } }
    }
    if (job.planning_stage === "shots" && context.story && context.camera && context.lighting && context.productionDesign && context.performance && context.editor) {
      const review = await run("continuity-reviewer", "Audit every locked ledger field in every shot and compare each endState with the next startState. Cite concrete identity, wardrobe, object count/placement, material, palette, lighting, weather, blocking, eyeline, screen-direction, geography, or camera-rule conflicts. Any unapproved change, missing invariant, or broken handoff is blocking. Do not grade footage: none exists.", { brief: job.brief, bible: context.story, camera: context.camera, lighting: context.lighting, productionDesign: context.productionDesign, performance: context.performance, shots: context.editor.shots }, crewReviewSchema)
      const stages = [...context.stages, { role: "continuity-reviewer", responseId: review.responseId }]
      const plan = compileProductionPlan({ model, story: context.story, camera: context.camera, lighting: context.lighting, productionDesign: context.productionDesign, performance: context.performance, editor: context.editor, review: review.value, stages })
      const { data: saved, error } = await client.from("production_jobs").update({ status: "awaiting_approval", plan, planning_stage: "complete", planning_context: { ...context, stages }, planning_claimed_until: null, planning_updated_at: new Date().toISOString() }).eq("id", job.id).eq("planning_stage", "shots").eq("planning_claimed_until", claimUntil).select("id").maybeSingle()
      if (error) throw error
      if (!saved) throw new Error("Planning lease expired; reload the latest checkpoint.")
      return { data: { complete: true, stage: "complete", message: "Production plan is ready", plan } }
    }
    throw new Error("The saved planning checkpoint is incomplete.")
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown"
    console.error("Production crew stage failed", { jobId: job.id, stage: job.planning_stage, error: message })
    await client.from("production_jobs").update({ planning_error: message.slice(0, 500), planning_claimed_until: null, planning_updated_at: new Date().toISOString() }).eq("id", job.id).eq("planning_claimed_until", claimUntil)
    return { error: `The crew could not finish the ${job.planning_stage} stage. Its last completed checkpoint is safe; retry to resume.` }
  }
}

async function saveCheckpoint(client: SupabaseClient, jobId: string, claimUntil: string, expectedStage: string, nextStage: string, context: unknown) {
  const { data, error } = await client.from("production_jobs").update({ planning_stage: nextStage, planning_context: context, planning_claimed_until: null, planning_updated_at: new Date().toISOString() }).eq("id", jobId).eq("planning_stage", expectedStage).eq("planning_claimed_until", claimUntil).select("id").maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Planning lease expired; reload the latest checkpoint.")
}

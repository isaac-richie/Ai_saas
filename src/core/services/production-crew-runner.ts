import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { compileCrewShotsForReview, compileProductionPlan, createCrewRunner } from "@/core/services/production-crew"
import { crewReviewSchema, crewShotsSchema, departmentDirectionSchema, productionBibleSchema } from "@/core/validation/production-crew"
import { enforcePromptCompliance } from "@/core/utils/ai/prompt-compliance"
import { productionAssetsSchema, ownsAssetUrl } from "@/core/validation/production-assets"
import { productionShotSettingsSchema } from "@/core/validation/production-settings"
import { compactRevisionContext } from "@/core/utils/production/revision-context"

const stageContextSchema = z.object({
  shotSettings: productionShotSettingsSchema.optional(),
  revision: z.object({
    directions: z.array(z.string()),
    findings: crewReviewSchema.shape.findings,
  }).optional(),
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
  if (claimError) {
    console.error("Production crew claim failed", { jobId, code: claimError.code })
    return { error: ["42703", "PGRST204"].includes(claimError.code)
      ? "Apply migration 0025 to enable resumable crew planning."
      : "Could not start the crew stage. Your saved checkpoint is unchanged; please retry." }
  }
  if (!job) {
    const { data: existing } = await client.from("production_jobs").select("status,plan").eq("id", jobId).eq("user_id", userId).maybeSingle()
    if (existing?.status === "awaiting_approval" || existing?.status === "approved") return { data: { complete: true, stage: "complete", message: "Production plan is ready", plan: existing.plan } }
    return { error: "The crew is already working on this stage. Retry shortly." }
  }

  try {
    const context = stageContextSchema.parse(job.planning_context || {})
    const model = process.env.PRODUCTION_CREW_MODEL?.trim() || context.model || "gpt-6-astra"
    context.model = model
    const references = productionAssetsSchema.parse(job.reference_assets || [])
    if (references.some(asset => !ownsAssetUrl(asset.url, userId))) throw new Error("Invalid reference ownership")
    const runner = createCrewRunner(model, references, context.shotSettings?.length ?? 3)
    const run: typeof runner = (role, instruction, input, schema) => runner(
      role, instruction,
      { source: input, revision: compactRevisionContext({ revision: context.revision }) ?? null, shotSettings: context.shotSettings ?? null }, schema,
    )
    if (job.planning_stage === "brief") {
      const safe = enforcePromptCompliance({ prompt: job.brief, outputType: "video" })
      if (safe.blocked || safe.flags.length) throw new Error("The brief requires a policy-safe rewrite.")
      const story = await run("story-director", "Write the treatment and world bible. Give each beat an emotional purpose. Build a continuityLedger with concrete reusable identity, wardrobe, hero objects, materials, location, environment, palette, lighting, screen direction, camera rules, and invariants. Mark invented creative choices as assumptions.", { brief: job.brief }, productionBibleSchema)
      if (!story.value.continuityLedger) throw new Error("The story crew did not produce a complete continuity ledger.")
      await saveCheckpoint(client, job.id, claimUntil, "brief", "story", { ...context, story: story.value, stages: [...context.stages, { role: "story-director", responseId: story.responseId }] })
      return { data: { complete: false, stage: "story", message: "Story bible locked" } }
    }
    // Save one department per request so a failed colleague never discards paid work.
    if (["story", "departments", "shots"].includes(job.planning_stage) && context.story && (!context.camera || !context.lighting || !context.productionDesign || !context.performance)) {
      const departments = [
        { key: "camera", role: "cinematographer", instruction: "Design coverage for all planned beats: framing, lens intent, one motivated movement, blocking, eyeline, and cut point. Preserve the shared bible." },
        { key: "lighting", role: "lighting-director", instruction: "Define motivated key, fill, practicals, palette, and exposure intent for each beat. Maintain time of day and light direction. Do not invent independent scene changes." },
        { key: "productionDesign", role: "production-designer", instruction: "Lock the physical world for all planned beats: wardrobe, props, materials, location dressing, palette, and repeatable visual motifs. Preserve continuity anchors and avoid adding new hero objects without a story purpose." },
        { key: "performance", role: "performance-director", instruction: "Direct behavior for all planned beats: precise blocking, gestures, eyelines, energy, screen direction, and timing. Keep action physically plausible for the selected shot duration and preserve the same subject identity." },
      ] as const
      const department = departments.find(item => !context[item.key])!
      const result = await run(department.role, department.instruction, { brief: job.brief, bible: context.story }, departmentDirectionSchema)
      const nextContext = { ...context, [department.key]: result.value, editor: undefined, stages: [...context.stages.filter(stage => stage.role !== department.role && stage.role !== "shot-editor"), { role: department.role, responseId: result.responseId }] }
      const complete = departments.every(item => Boolean(nextContext[item.key]))
      const nextStage = complete ? "departments" : "story"
      await saveCheckpoint(client, job.id, claimUntil, job.planning_stage, nextStage, nextContext)
      return { data: { complete: false, stage: nextStage, message: department.role + " saved; completed departments will not be repeated" } }
    }
    if (job.planning_stage === "departments" && context.story && context.camera && context.lighting && context.productionDesign && context.performance) {
      const editor = await run("shot-editor", "Compile one executable prompt per selected shot, in beat order. The action field must contain the complete timed choreography, performance, and dialogue within the selected shot duration. Put that timed action and camera direction first in the prompt, then essential continuity details. Never end a field mid-sentence. For each shot define continuity startState, endState, carriedDetails, and only intentionalChanges. Every shot after the first must begin at the preceding shot's end state. Include framing, motion, lighting, wardrobe, objects, and performance. Resolve contradictions in favor of the bible.", { brief: job.brief, bible: context.story, camera: context.camera, lighting: context.lighting, productionDesign: context.productionDesign, performance: context.performance }, crewShotsSchema)
      if (editor.value.shots.length !== (context.shotSettings?.length ?? 3)) throw new Error("The crew returned the wrong shot count. Retry this stage.")
      if (editor.value.shots.some(shot => !shot.continuity)) throw new Error("The shot crew did not produce complete state handoffs.")
      for (const shot of editor.value.shots) {
        const checked = enforcePromptCompliance({ prompt: shot.prompt, negativePrompt: shot.negativePrompt, outputType: "video" })
        if (checked.blocked || checked.flags.length) throw new Error("A compiled shot needs a policy-safe rewrite.")
      }
      await saveCheckpoint(client, job.id, claimUntil, "departments", "shots", { ...context, editor: editor.value, stages: [...context.stages, { role: "shot-editor", responseId: editor.responseId }] })
      return { data: { complete: false, stage: "shots", message: "Shot prompts compiled" } }
    }
    if (job.planning_stage === "shots" && context.story && context.camera && context.lighting && context.productionDesign && context.performance && context.editor) {
      const review = await run("continuity-reviewer", "Audit the exact compiled provider prompts and compare each endState with the next startState. A contradiction, incomplete sentence, missing executable action/camera instruction, unapproved identity/object change, or broken handoff is blocking. The provider sees only the prompt, not the separate metadata or ledger. Missing required details must remain blocking; accept concise wording only when it preserves their meaning. Do not grade footage: none exists.", { brief: job.brief, bible: context.story, camera: context.camera, lighting: context.lighting, productionDesign: context.productionDesign, performance: context.performance, shots: compileCrewShotsForReview(context.story, context.editor, context.shotSettings) }, crewReviewSchema)
      const stages = [...context.stages, { role: "continuity-reviewer", responseId: review.responseId }]
      const plan = compileProductionPlan({ shotSettings: context.shotSettings, model, story: context.story, camera: context.camera, lighting: context.lighting, productionDesign: context.productionDesign, performance: context.performance, editor: context.editor, review: review.value, stages })
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

import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { compileCrewShotsForReview, compileProductionPlan, createCrewRunner, safeCrewError } from "@/core/services/production-crew"
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
  previousEditor: crewShotsSchema.optional(),
  referenceSnapshot: z.string().optional(),
  stages: z.array(z.object({ role: z.string(), responseId: z.string() })).default([]),
})

export type CrewStageResult = {
  complete: boolean
  stage: "story" | "departments" | "shots" | "complete"
  message: string
  plan?: unknown
}

function boundedSentence(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= limit) return normalized
  const prefix = normalized.slice(0, limit - 1).trimEnd()
  const sentenceEnd = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("!"), prefix.lastIndexOf("?"))
  if (sentenceEnd >= Math.floor(limit * 0.45)) return prefix.slice(0, sentenceEnd + 1)
  const boundary = prefix.lastIndexOf(" ")
  return `${prefix.slice(0, boundary > 0 ? boundary : prefix.length).replace(/[,:;\-–—]+$/, "").trimEnd()}.`
}

/**
 * The brief and references are the authoritative creative source. Seed the
 * continuity context locally so planning starts with visual direction instead
 * of spending a separate model call generating a story bible.
 */
function seedProductionBible(brief: string, references: Array<{ name: string; role: string }>, shotCount: number) {
  const normalizedBrief = brief.replace(/\s+/g, " ").trim()
  const firstSentence = normalizedBrief.split(/(?<=[.!?])\s+/)[0] || normalizedBrief
  const proposedTitle = boundedSentence(firstSentence, 120).replace(/[.!?]+$/, "")
  const referenceAnchors = references.map(reference => `Preserve ${reference.role} details shown in ${reference.name}.`)
  const continuityAnchors = [
    ...referenceAnchors,
    "Preserve the subject, action, and visual details specified in the original brief.",
    "Keep locations, wardrobe, objects, palette, and screen direction consistent unless the brief changes them.",
    "Do not add story facts or visual elements that conflict with the brief or references.",
  ].slice(0, 8)
  return {
    title: proposedTitle.length >= 3 ? proposedTitle : "Untitled production",
    treatment: boundedSentence(normalizedBrief, 600),
    audienceEmotion: "Follow the emotional intent expressed in the original brief.",
    world: "Use only the setting, locations, and conditions described in the original brief and references.",
    continuityAnchors,
    continuityLedger: null,
    beats: Array.from({ length: shotCount }, (_, index) => `Beat ${index + 1} advances the same scene and action described in the original brief.`),
    assumptions: ["No story, character, location, or prop details are assumed beyond the brief and references."],
  }
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

  let failedStage = job.planning_stage === "brief" ? "visual direction" : job.planning_stage
  try {
    const context = stageContextSchema.parse(job.planning_context || {})
    const model = process.env.PRODUCTION_CREW_MODEL?.trim() || context.model || "gpt-6-astra"
    context.model = model
    const safeBrief = enforcePromptCompliance({ prompt: job.brief, outputType: "video" })
    if (safeBrief.blocked) throw new Error(`The brief is blocked by safety policy: ${safeBrief.reason || "rewrite the brief and retry."}`)
    const planningBrief = safeBrief.prompt || job.brief
    const references = productionAssetsSchema.parse(job.reference_assets || [])
    if (references.some(asset => !ownsAssetUrl(asset.url, userId))) throw new Error("Invalid reference ownership")
    const referenceSnapshot = JSON.stringify(references)
    if (context.referenceSnapshot && context.referenceSnapshot !== referenceSnapshot && job.planning_stage !== "brief") {
      // Previously paid department outputs may describe different source images.
      // A new reference set must not be mixed with those saved checkpoints.
      await saveCheckpoint(client, job.id, claimUntil, job.planning_stage, "brief", {
        model, shotSettings: context.shotSettings, revision: context.revision, referenceSnapshot, stages: [],
      })
      return { data: { complete: false, stage: "story", message: "References changed; restarting visual direction with the new sources" } }
    }
    context.referenceSnapshot = referenceSnapshot
    const runner = createCrewRunner(model, references, context.shotSettings?.length ?? 3)
    const run: typeof runner = (role, instruction, input, schema) => runner(
      role, instruction,
      { source: input, revision: compactRevisionContext({ revision: context.revision }) ?? null, shotSettings: context.shotSettings ?? null }, schema,
    )
    let workingStage = job.planning_stage
    if (job.planning_stage === "brief") {
      context.story = productionBibleSchema.parse(seedProductionBible(planningBrief, references, context.shotSettings?.length ?? 3))
      workingStage = "story"
      failedStage = "visual direction"
    }
    // Save one department per request so a failed colleague never discards paid work.
    if (["story", "departments", "shots"].includes(workingStage) && context.story && (!context.camera || !context.lighting || !context.productionDesign || !context.performance)) {
      const departments = [
        { key: "camera", role: "cinematographer", instruction: "Design coverage for all planned beats: framing, lens intent, one motivated movement, blocking, eyeline, and cut point. Preserve the shared bible." },
        { key: "lighting", role: "lighting-director", instruction: "Define motivated key, fill, practicals, palette, and exposure intent for each beat. Maintain time of day and light direction. Do not invent independent scene changes." },
        { key: "productionDesign", role: "production-designer", instruction: "Lock the physical world for all planned beats: wardrobe, props, materials, location dressing, palette, and repeatable visual motifs. Preserve continuity anchors and avoid adding new hero objects without a story purpose." },
        { key: "performance", role: "performance-director", instruction: "Direct behavior for all planned beats: precise blocking, gestures, eyelines, energy, screen direction, and timing. Keep action physically plausible for the selected shot duration and preserve the same subject identity." },
      ] as const
      const department = departments.find(item => !context[item.key])!
      failedStage = department.role
      const result = await run(department.role, department.instruction, { brief: planningBrief, bible: context.story }, departmentDirectionSchema)
      const nextContext = { ...context, [department.key]: result.value, editor: undefined, stages: [...context.stages.filter(stage => stage.role !== department.role && stage.role !== "shot-editor"), { role: department.role, responseId: result.responseId }] }
      const complete = departments.every(item => Boolean(nextContext[item.key]))
      const nextStage = complete ? "departments" : "story"
      await saveCheckpoint(client, job.id, claimUntil, job.planning_stage, nextStage, nextContext)
      return { data: { complete: false, stage: nextStage, message: department.role + " saved; completed departments will not be repeated" } }
    }
    if (job.planning_stage === "departments" && context.story && context.camera && context.lighting && context.productionDesign && context.performance) {
      failedStage = "shot prompts"
      const repairInstruction = context.previousEditor
        ? "Repair the previous executable shots using the revision findings. Preserve every unaffected shot's prompt, timing, model, action, and continuity exactly. Change only what is required to fix blocking defects and any adjacent handoff affected by that fix; do not reimagine the film. Return all shots in their original order with complete fields."
        : "Compile one executable prompt per selected shot, in beat order. The action field must contain the complete timed choreography, performance, and dialogue within the selected shot duration. Put that timed action and camera direction first in the prompt, then essential continuity details. Never end a field mid-sentence. For each shot define continuity startState, endState, carriedDetails, and only intentionalChanges. Every shot after the first must begin at the preceding shot's end state. Include framing, motion, lighting, wardrobe, objects, and performance. Resolve contradictions in favor of the bible."
      const editor = await run("shot-editor", repairInstruction, { brief: planningBrief, bible: context.story, camera: context.camera, lighting: context.lighting, productionDesign: context.productionDesign, performance: context.performance, ...(context.previousEditor ? { previousShots: context.previousEditor.shots } : {}) }, crewShotsSchema)
      if (editor.value.shots.length !== (context.shotSettings?.length ?? 3)) throw new Error("The crew returned the wrong shot count. Retry this stage.")
      if (editor.value.shots.some(shot => !shot.continuity)) throw new Error("The shot crew did not produce complete state handoffs.")
      const sanitizedShots = editor.value.shots.map(shot => {
        const checked = enforcePromptCompliance({ prompt: shot.prompt, negativePrompt: shot.negativePrompt, outputType: "video" })
        if (checked.blocked) throw new Error(`A compiled shot is blocked by safety policy: ${checked.reason || "rewrite the shot and retry."}`)
        return { ...shot, prompt: checked.prompt, negativePrompt: checked.negativePrompt }
      })
      const sanitizedEditor = { ...editor.value, shots: sanitizedShots }
      await saveCheckpoint(client, job.id, claimUntil, "departments", "shots", { ...context, previousEditor: undefined, editor: sanitizedEditor, stages: [...context.stages, { role: "shot-editor", responseId: editor.responseId }] })
      return { data: { complete: false, stage: "shots", message: "Shot prompts compiled" } }
    }
    if (job.planning_stage === "shots" && context.story && context.camera && context.lighting && context.productionDesign && context.performance && context.editor) {
      failedStage = "continuity review"
      const review = await run("continuity-reviewer", "Audit only the exact provider prompts and continuity handoffs supplied below. A finding is blocking only when a provider prompt itself is incomplete, contradictory, exceeds the stated limit, or conflicts with the adjacent start/end handoff. Do not block on bible, department, action, edit-note, or other source metadata: it is not sent to the provider. Treat uncertainty or creative suggestions as notes. Do not grade footage: none exists.", { continuityContract: context.story.continuityLedger || { anchors: context.story.continuityAnchors }, shots: compileCrewShotsForReview(context.story, context.editor, context.shotSettings) }, crewReviewSchema)
      const stages = [...context.stages, { role: "continuity-reviewer", responseId: review.responseId }]
      const plan = compileProductionPlan({ shotSettings: context.shotSettings, model, story: context.story, camera: context.camera, lighting: context.lighting, productionDesign: context.productionDesign, performance: context.performance, editor: context.editor, review: review.value, stages })
      const { data: saved, error } = await client.from("production_jobs").update({ status: "awaiting_approval", plan, planning_stage: "complete", planning_context: { ...context, stages }, planning_claimed_until: null, planning_updated_at: new Date().toISOString() }).eq("id", job.id).eq("planning_stage", "shots").eq("planning_claimed_until", claimUntil).select("id").maybeSingle()
      if (error) throw error
      if (!saved) throw new Error("Planning lease expired; reload the latest checkpoint.")
      return { data: { complete: true, stage: "complete", message: "Production plan is ready", plan } }
    }
    throw new Error("The saved planning checkpoint is incomplete.")
  } catch (cause) {
    const message = safeCrewError(cause)
    console.error("Production crew stage failed", { jobId: job.id, stage: failedStage, error: message })
    await client.from("production_jobs").update({ planning_error: message.slice(0, 500), planning_claimed_until: null, planning_updated_at: new Date().toISOString() }).eq("id", job.id).eq("planning_claimed_until", claimUntil)
    if (message.startsWith("AI planning credits are exhausted")) {
      return { error: `${message} Your production is saved; select Resume crew after the balance is restored.` }
    }
    return { error: `The crew could not finish ${failedStage}. Its last completed checkpoint is safe; retry to resume.` }
  }
}

async function saveCheckpoint(client: SupabaseClient, jobId: string, claimUntil: string, expectedStage: string, nextStage: string, context: unknown) {
  const { data, error } = await client.from("production_jobs").update({ planning_stage: nextStage, planning_context: context, planning_claimed_until: null, planning_updated_at: new Date().toISOString() }).eq("id", jobId).eq("planning_stage", expectedStage).eq("planning_claimed_until", claimUntil).select("id").maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Planning lease expired; reload the latest checkpoint.")
}

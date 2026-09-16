"use server"

import { z } from "zod"
import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { createClient } from "@/infrastructure/supabase/server"
import type { Json } from "@/core/types/db"
import { enforcePromptCompliance } from "@/core/utils/ai/prompt-compliance"

const inspectionSchema = z.object({
  takeId: z.string().uuid(), duration: z.number().positive().max(300), width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384), audioDetected: z.boolean().nullable().default(null),
})

export async function recordTakeInspection(input: unknown) {
  const parsed = inspectionSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid media metadata." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { data: take } = await db.from("shot_generations").select("id,duration_seconds,aspect_ratio,shot_id,media_inspection,review_status,review_notes,shots!shot_generations_shot_id_fkey!inner(scene_id,scenes!inner(project_id,projects!inner(user_id)))").eq("id", parsed.data.takeId).eq("shots.scenes.projects.user_id", user.id).maybeSingle()
  if (!take) return { error: "Take not found." }
  const actualRatio = parsed.data.width / parsed.data.height
  const expected = take.aspect_ratio === "9:16" ? 9 / 16 : take.aspect_ratio === "1:1" ? 1 : take.aspect_ratio === "4:5" ? 4 / 5 : take.aspect_ratio === "21:9" ? 21 / 9 : 16 / 9
  const durationDelta = take.duration_seconds == null ? null : Math.abs(parsed.data.duration - take.duration_seconds)
  const findings = [
    ...(durationDelta != null && durationDelta > 1.25 ? [`Duration differs from request by ${durationDelta.toFixed(2)}s.`] : []),
    ...(Math.abs(actualRatio - expected) > 0.08 ? ["Rendered aspect ratio differs from the requested frame."] : []),
    ...(parsed.data.audioDetected === false ? ["No audio track was detected by the browser."] : []),
  ]
  const existingInspection = isRecord(take.media_inspection) ? take.media_inspection : {}
  const existingKeyframeReview = isRecord(existingInspection.keyframeReview) ? existingInspection.keyframeReview : null
  const browserMetadata = { inspectedAt: new Date().toISOString(), source: "browser_metadata", actualDurationSeconds: parsed.data.duration, width: parsed.data.width, height: parsed.data.height, audioDetected: parsed.data.audioDetected, findings }
  const inspection = { ...existingInspection, browserMetadata } satisfies Json
  const metadataStatus = findings.length ? "warning" : "pass"
  const reviewStatus = strongestReviewStatus(metadataStatus, take.review_status, existingKeyframeReview?.overall)
  const reviewNotes = [findings.join(" "), typeof existingKeyframeReview?.summary === "string" ? existingKeyframeReview.summary : take.review_notes].filter(Boolean).join(" ")
  const { error } = await db.from("shot_generations").update({ media_inspection: inspection, review_status: reviewStatus, review_notes: reviewNotes || null }).eq("id", take.id)
  if (error) return { error: "Apply migration 0023 to record media inspections." }
  return { data: { status: reviewStatus, findings } }
}

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function strongestReviewStatus(...values: unknown[]) {
  const normalized = values.map(value => value === "reject" ? "rejected" : value)
  if (normalized.includes("rejected")) return "rejected"
  if (normalized.includes("warning")) return "warning"
  return "pass"
}

const evaluationSchema = z.object({
  productionId: z.string().uuid(), story: z.number().int().min(1).max(5), continuity: z.number().int().min(1).max(5),
  visual: z.number().int().min(1).max(5), editability: z.number().int().min(1).max(5), notes: z.string().trim().max(2000).default(""),
})

export async function submitProductionEvaluation(input: unknown) {
  const parsed = evaluationSchema.safeParse(input)
  if (!parsed.success) return { error: "Complete all four scores from 1 to 5." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { error } = await db.from("production_evaluations").insert({ production_job_id: parsed.data.productionId, user_id: user.id, story_score: parsed.data.story, continuity_score: parsed.data.continuity, visual_score: parsed.data.visual, editability_score: parsed.data.editability, notes: parsed.data.notes || null })
  if (error) return { error: "Apply migration 0023 before recording evaluations." }
  return { data: { saved: true } }
}

const correctionInputSchema = z.object({
  takeId: z.string().uuid(),
  reviewerNote: z.string().trim().min(3).max(1200),
})
const correctionOutputSchema = z.object({
  revisedPrompt: z.string().min(30).max(1600),
  changes: z.array(z.string().min(3).max(240)).min(1).max(6),
  retainedAnchors: z.array(z.string().min(3).max(240)).max(8),
})

export async function proposeTakeCorrection(input: unknown) {
  const parsed = correctionInputSchema.safeParse(input)
  if (!parsed.success) return { error: "Describe the visible problem to correct." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { data: take } = await db.from("shot_generations").select("id,shot_id,prompt,compiled_prompt,review_notes,media_inspection,shots!shot_generations_shot_id_fkey!inner(name,prompt_text,generation_settings,scene_id,scenes!inner(project_id,projects!inner(user_id)))").eq("id", parsed.data.takeId).eq("shots.scenes.projects.user_id", user.id).maybeSingle()
  if (!take) return { error: "Take not found." }
  const shotRelation = take.shots as unknown as { name: string; prompt_text: string | null; generation_settings: unknown }
  const previousPrompt = shotRelation.prompt_text || take.compiled_prompt || take.prompt
  if (!previousPrompt) return { error: "This shot has no source prompt to revise." }
  if (!process.env.OPENAI_API_KEY) return { error: "The director connection is not configured." }
  const model = process.env.PRODUCTION_CREW_MODEL || "gpt-6-astra"
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 150_000, maxRetries: 0 })
  try {
    const response = await client.responses.parse({
      model,
      reasoning: { effort: "low" },
      store: false,
      max_output_tokens: 1800,
      instructions: "You are a corrective cinematography supervisor. The supplied continuity_ledger and continuity_state are immutable except for explicitly listed intentionalChanges. Rewrite only what the reviewer evidence requires, while repeating every concrete identity, wardrobe, hero-object, material, location, palette, lighting, weather, geography, and state-handoff fact. Never replace facts with phrases such as same as before. Preserve shot duration and unaffected creative intent. Do not claim you saw footage; the supplied notes and metadata are your only evidence. Return a physically executable, policy-compliant video prompt and list retained anchors.",
      input: JSON.stringify({ shot: shotRelation.name, previousPrompt, reviewerNote: parsed.data.reviewerNote, automatedMetadataReview: take.review_notes, mediaInspection: take.media_inspection, continuityContract: shotRelation.generation_settings }),
      text: { format: zodTextFormat(correctionOutputSchema, "take_correction") },
    })
    if (response.status !== "completed" || !response.output_parsed) return { error: "The correction proposal was incomplete. Try again." }
    const proposal = correctionOutputSchema.parse(response.output_parsed)
    const compliance = enforcePromptCompliance({ prompt: proposal.revisedPrompt, outputType: "video" })
    if (compliance.blocked || compliance.flags.length) return { error: "The proposed correction needs a policy-safe rewrite. Adjust the review note and retry." }
    const { data: revision, error } = await db.from("shot_prompt_revisions").insert({ shot_id: take.shot_id, take_id: take.id, user_id: user.id, previous_prompt: previousPrompt, proposed_prompt: proposal.revisedPrompt, reviewer_note: parsed.data.reviewerNote, rationale: proposal.changes, retained_anchors: proposal.retainedAnchors, model }).select("id").single()
    if (error || !revision) return { error: "Apply migration 0024 to save correction proposals." }
    return { data: { revisionId: revision.id, ...proposal } }
  } catch (cause) {
    console.error("Take correction failed", { takeId: take.id, error: cause instanceof Error ? cause.message : "unknown" })
    return { error: "The correction supervisor could not finish this proposal. Try again." }
  }
}

export async function applyTakeCorrection(revisionId: string) {
  const id = z.string().uuid().safeParse(revisionId)
  if (!id.success) return { error: "Choose a valid correction proposal." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const { data: revision } = await db.from("shot_prompt_revisions").select("id,shot_id,proposed_prompt,status").eq("id", id.data).eq("user_id", user.id).maybeSingle()
  if (!revision || revision.status !== "proposed") return { error: "Correction proposal not found or already resolved." }
  const { error: shotError } = await db.from("shots").update({ prompt_text: revision.proposed_prompt, updated_at: new Date().toISOString() }).eq("id", revision.shot_id)
  if (shotError) return { error: "Could not apply the corrected prompt." }
  const { error: revisionError } = await db.from("shot_prompt_revisions").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", revision.id).eq("status", "proposed")
  if (revisionError) return { error: "The prompt changed, but its audit record could not be finalized." }
  return { data: { applied: true, shotId: revision.shot_id, prompt: revision.proposed_prompt } }
}

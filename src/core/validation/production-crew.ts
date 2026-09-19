import { z } from "zod"
import { studioAdCampaignPlanSchema, studioAdCampaignDeliverableSchema } from "./studio-ad"

const note = z.string().min(3).max(600)

export const continuityLedgerSchema = z.object({
  subjectIdentity: z.string().min(3).max(300),
  wardrobe: z.string().min(3).max(300),
  heroObjects: z.array(z.string().min(2).max(160)).max(8),
  location: z.string().min(3).max(300),
  environment: z.string().min(3).max(300),
  palette: z.array(z.string().min(2).max(80)).min(1).max(8),
  lighting: z.string().min(3).max(300),
  screenDirection: z.string().min(3).max(220),
  cameraRules: z.string().min(3).max(300),
  invariants: z.array(z.string().min(3).max(180)).min(3).max(12),
})

export const shotContinuityStateSchema = z.object({
  startState: z.string().min(3).max(300),
  endState: z.string().min(3).max(300),
  carriedDetails: z.array(z.string().min(2).max(160)).min(3).max(12),
  intentionalChanges: z.array(z.string().min(2).max(160)).max(4),
})

export const productionBibleSchema = z.object({
  title: z.string().min(3).max(120),
  treatment: note,
  audienceEmotion: note,
  world: note,
  continuityAnchors: z.array(z.string().min(3).max(240)).min(1).max(8),
  // Optional only so productions planned before continuity-ledger v2 remain readable.
  // Structured Outputs requires optional object properties to be nullable.
  continuityLedger: continuityLedgerSchema.nullable(),
  beats: z.array(note).min(2).max(12),
  assumptions: z.array(note).max(6),
})

export const departmentDirectionSchema = z.object({
  approach: note,
  shotDirections: z.array(note).min(2).max(12),
  constraints: z.array(note).min(1).max(6),
})

export const crewShotsSchema = z.object({
  shots: z.array(z.object({
    title: z.string().min(3).max(120),
    intent: z.string().min(5).max(220),
    action: z.string().min(10).max(500),
    prompt: z.string().min(30).max(1000),
    negativePrompt: z.string().min(5).max(500),
    model: z.enum(["kling", "seedance"]),
    editNote: z.string().min(3).max(1200),
    continuity: shotContinuityStateSchema.nullable(),
  })).min(2).max(12),
})

export const crewReviewSchema = z.object({
  summary: note,
  findings: z.array(z.object({
    shotNumber: z.number().int().min(1).max(12),
    severity: z.enum(["note", "blocking"]),
    evidence: note,
    correction: note,
  })).max(24),
})

export const crewMetadataSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  model: z.string(),
  createdAt: z.string(),
  bible: productionBibleSchema,
  camera: departmentDirectionSchema,
  lighting: departmentDirectionSchema,
  productionDesign: departmentDirectionSchema.optional(),
  performance: departmentDirectionSchema.optional(),
  review: crewReviewSchema,
  // These identify completed model calls, not generated footage.
  stages: z.array(z.object({ role: z.string(), responseId: z.string() })).refine(
    (stages) => stages.length === 5 || stages.length === 7,
    "Crew plans must contain either the legacy five-role crew or the full seven-role crew.",
  ),
})

export const productionPlanSchema = studioAdCampaignPlanSchema.extend({
  // Editorial notes are not provider prompts and need room for complete cut/compositing instructions.
  deliverables: z.array(studioAdCampaignDeliverableSchema.extend({
    durationSeconds: z.number().int().min(4).max(15),
    productionNotes: z.array(z.string().min(3).max(1200)).max(5).default([]),
  })).min(2).max(12),
  crew: crewMetadataSchema.optional(),
})
export type ProductionPlan = z.infer<typeof productionPlanSchema>
export type CrewMetadata = z.infer<typeof crewMetadataSchema>

export function canApproveProduction(plan: unknown): boolean {
  const parsed = productionPlanSchema.safeParse(plan)
  if (!parsed.success || parsed.data.crew?.review.findings.some(finding => finding.severity === "blocking")) return false
  if (parsed.data.crew?.version === 2) {
    return Boolean(
      parsed.data.crew.bible.continuityLedger
      && parsed.data.deliverables.every(shot => shot.continuityStartState && shot.continuityEndState)
    )
  }
  return true
}

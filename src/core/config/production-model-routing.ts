/**
 * Planning tiers are selected by the task, never by an untrusted brief.
 * PRODUCTION_CREW_MODEL is retained only as a legacy premium-model setting;
 * it must not silently promote routine crew calls to Astra.
 */
export type ProductionModelTier = "economy" | "balanced" | "premium"

const ECONOMY_ROLES = new Set([
  "cinematographer",
  "lighting-director",
  "production-designer",
  "performance-director",
  "reference-analysis",
  "keyframe-inspection",
])

const BALANCED_ROLES = new Set([
  "story-director",
  "shot-editor",
  "continuity-reviewer",
  "take-correction",
])

export function productionModelTier(role: string): ProductionModelTier {
  if (ECONOMY_ROLES.has(role)) return "economy"
  if (BALANCED_ROLES.has(role)) return "balanced"
  // Unknown roles require an explicit routing decision before they can run.
  throw new Error(`No production model route is configured for ${role}.`)
}

export function resolveProductionModel(role: string, env: NodeJS.ProcessEnv = process.env) {
  const tier = productionModelTier(role)
  const model = tier === "economy"
    ? env.PRODUCTION_CREW_ECONOMY_MODEL?.trim() || "gpt-6-luna"
    : env.PRODUCTION_CREW_BALANCED_MODEL?.trim() || "gpt-6-sol"
  return { tier, model }
}

/** Premium is opt-in for a future explicitly approved operation, not a fallback. */
export function resolvePremiumProductionModel(env: NodeJS.ProcessEnv = process.env) {
  return env.PRODUCTION_CREW_PREMIUM_MODEL?.trim() || env.PRODUCTION_CREW_MODEL?.trim() || "gpt-6-astra"
}

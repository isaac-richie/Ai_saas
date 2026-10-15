/**
 * Prompt limits per model, measured on Kie on 2026-10-15 with probes that could not start a task:
 * Kling 3.0 rejects over 2,500 characters, GPT Image 1.5 over ~3,000, Seedance 2.5 and
 * Nano Banana Pro over ~20,000. The budgets below keep a margin under each hard cap, and cap the
 * very long ones at a length models still follow well.
 */
export const PROMPT_INTAKE_LIMIT = 50_000

const BUDGETS: { match: RegExp; budget: number; hardLimit: number }[] = [
  { match: /ai-avatar/i, budget: 1000, hardLimit: 1000 },
  // Kling: the provider appends reference-set tags after budgeting, so keep ~60 characters spare.
  { match: /kling/i, budget: 2440, hardLimit: 2500 },
  { match: /seedance/i, budget: 10_000, hardLimit: 20_000 },
  { match: /gpt-image/i, budget: 2950, hardLimit: 3000 },
  { match: /nano-banana/i, budget: 10_000, hardLimit: 20_000 },
]

/** Characters of prompt a model reads well (our budget), for the selected model id. Unknown models get Kling's. */
export function promptBudgetFor(model?: string | null): number {
  return BUDGETS.find((entry) => entry.match.test(model ?? ""))?.budget ?? 2440
}

/** The provider's hard cap, for messages. */
export function promptHardLimitFor(model?: string | null): number {
  return BUDGETS.find((entry) => entry.match.test(model ?? ""))?.hardLimit ?? 2500
}

/** Pasted JSON (a scene breakdown) is kept as structure when it is condensed. */
export function looksLikeJson(text: string): boolean {
  const trimmed = text.trim()
  if (!/^[[{]/.test(trimmed)) return false
  try { JSON.parse(trimmed); return true } catch { return false }
}

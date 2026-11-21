/**
 * The live planning model for the Motion Ad Director: OpenAI structured output against the plan schema.
 * planStoryboard (planner.ts) validates the reply and retries once; this only makes the call.
 */
import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { resolveProductionModel } from "@/core/config/production-model-routing"
import { planSchema } from "./contract"
import type { PlanModel } from "./planner"

export function openAiPlanModel(apiKey = process.env.OPENAI_API_KEY): PlanModel {
  if (!apiKey) throw new Error("The planning assistant isn't set up on this server yet.")
  const client = new OpenAI({ apiKey, maxRetries: 1 })
  return async (instructions, input) => {
    const result = await client.responses.parse({
      model: resolveProductionModel("motion-ad-director").model,
      store: false,
      max_output_tokens: 6000,
      instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: input }] }],
      // The SDK's strict parse is left out on purpose: our own validation reports every problem, so the
      // retry can be told exactly what to fix.
      text: { format: { ...zodTextFormat(planSchema, "motion_ad_plan") } },
    }, { signal: AbortSignal.timeout(90_000) })
    if (!result.output_text) return null
    try { return JSON.parse(result.output_text) } catch { return result.output_text }
  }
}

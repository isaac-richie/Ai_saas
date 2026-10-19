import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { checkRateLimit } from "@/core/utils/security/rate-limit"
import { readBoundedBody } from "@/core/utils/security/bounded-body"
import { PROMPT_INTAKE_LIMIT, promptBudgetFor } from "@/core/config/prompt-limits"
import { condensePrompt } from "@/core/services/prompt-condenser"

export const runtime = "nodejs"
export const maxDuration = 120

const requestSchema = z.object({
  text: z.string().trim().min(10).max(PROMPT_INTAKE_LIMIT, `Keep it under ${PROMPT_INTAKE_LIMIT.toLocaleString()} characters.`),
  model: z.string().max(80).optional(),
  // Room the caller already needs for references and continuity, so the condensed idea plus those still fits.
  reserve: z.number().int().min(0).max(3000).optional(),
  purpose: z.enum(["video", "image", "lip-sync"]).optional(),
})

/** Long brief or JSON in, a model-ready prompt out, for the creator to approve. */
export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 })
  if (!checkRateLimit(`prompt-condense:${user.id}`, { max: 12, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ error: "Please wait a moment before condensing again." }, { status: 429 })
  }
  try {
    const input = requestSchema.parse(JSON.parse(await readBoundedBody(request, PROMPT_INTAKE_LIMIT * 2 + 2000)))
    const target = Math.max(400, promptBudgetFor(input.model) - (input.reserve ?? 0))
    const result = await condensePrompt(input.text, target, input.purpose ?? "video")
    return NextResponse.json({ ...result, target }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid brief." }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't condense this brief." }, { status: 502 })
  }
}

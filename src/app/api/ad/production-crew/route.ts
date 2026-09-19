import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { checkStudioAdRateLimit } from "@/core/services/studio-ad/rate-limit"
import { advanceProductionCrew } from "@/core/services/production-crew-runner"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 })
  const parsed = z.object({ jobId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Choose a saved production brief." }, { status: 400 })
  if (!checkStudioAdRateLimit(`production-crew:${user.id}`).allowed) return NextResponse.json({ error: "Please wait before continuing the crew plan." }, { status: 429 })
  const result = await advanceProductionCrew(db, user.id, parsed.data.jobId)
  if (result.error) {
    const policyBlocked = result.error.includes("blocked by safety policy")
    return NextResponse.json({ error: result.error }, { status: result.error.includes("already working") ? 409 : policyBlocked ? 422 : 502 })
  }
  return NextResponse.json({ ok: true, ...result.data })
}

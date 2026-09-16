import { NextResponse } from "next/server"
import { createAdminClient, hasSupabaseAdminEnv } from "@/infrastructure/supabase/admin"
import { advanceProductionCrew } from "@/core/services/production-crew-runner"

export const runtime = "nodejs"
export const maxDuration = 300

function isAuthorized(request: Request): boolean {
  const secret = process.env.PRODUCTION_WORKER_SECRET || process.env.CRON_SECRET
  if (!secret) return false
  const authorization = request.headers.get("authorization")
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null
  return request.headers.get("x-production-worker-secret") === secret || bearer === secret
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: "Production worker requires Supabase admin credentials." }, { status: 503 })

  const db = createAdminClient()
  const { data: jobs, error } = await db.from("production_jobs")
    .select("id,user_id")
    .eq("status", "brief")
    .not("planning_updated_at", "is", null)
    .is("planning_error", null)
    .in("planning_stage", ["brief", "story", "departments", "shots"])
    .or(`planning_claimed_until.is.null,planning_claimed_until.lt.${new Date().toISOString()}`)
    .order("planning_updated_at", { ascending: true, nullsFirst: true })
    .limit(1)
  if (error) return NextResponse.json({ error: "Apply migration 0025 to enable production worker recovery." }, { status: 503 })

  const results = []
  for (const job of jobs || []) {
    const result = await advanceProductionCrew(db, job.user_id, job.id)
    results.push({ jobId: job.id, complete: result.data?.complete || false, stage: result.data?.stage || null, error: result.error || null })
  }
  return NextResponse.json({ ok: true, processed: results.length, results })
}

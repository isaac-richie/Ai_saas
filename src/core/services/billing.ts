import type { SupabaseClient } from "@supabase/supabase-js"

type SupabaseLike = SupabaseClient

export type BillingFeature = "studio" | "fast_video"

export type UsageQuotaResult = {
  allowed: boolean
  usedCount: number
  maxCount: number | null
  remaining: number | null
  message?: string
}

export type BillingSnapshot = {
  planCode: string
  planName: string
  status: string
  maxProjects: number | null
  maxStudioGenerations: number | null
  maxFastVideoGenerations: number | null
  studioGenerationsUsed: number
  fastVideoGenerationsUsed: number
}

const LIMIT_MESSAGE: Record<BillingFeature, string> = {
  studio:
    "Studio free limit reached (5/5). Upgrade to Studio Pro for unlimited Studio generations.",
  fast_video:
    "Fast Track free limit reached (5/5). Upgrade to Studio Pro for unlimited Fast Track generations.",
}

// Testing phase override: keep billing/tier system in place, but allow more usage.
const TESTING_PHASE_FREE_LIMIT = 5

export async function ensureUserBillingState(supabase: SupabaseLike, userId: string) {
  await supabase.rpc("ensure_user_billing_state", { p_user_id: userId })
}

export async function consumeUsageQuota(
  supabase: SupabaseLike,
  userId: string,
  feature: BillingFeature
): Promise<UsageQuotaResult> {
  const { data, error } = await supabase.rpc("consume_usage_quota", {
    p_user_id: userId,
    p_feature: feature,
  })

  if (error) {
    return {
      allowed: false,
      usedCount: 0,
      maxCount: null,
      remaining: null,
      message: "Unable to verify your plan limits right now. Please try again.",
    }
  }

  const row = Array.isArray(data) ? data[0] : data
  const allowed = Boolean(row?.allowed)
  const usedCount = Number(row?.used_count ?? 0)
  const rawMax = row?.max_count == null ? null : Number(row.max_count)
  const maxCount = rawMax == null ? null : Math.max(rawMax, TESTING_PHASE_FREE_LIMIT)
  const remaining = row?.remaining == null ? null : Number(row.remaining)

  if (!allowed) {
    return {
      allowed: false,
      usedCount,
      maxCount,
      remaining,
      message: LIMIT_MESSAGE[feature],
    }
  }

  return {
    allowed: true,
    usedCount,
    maxCount,
    remaining,
  }
}

export async function canCreateProject(supabase: SupabaseLike, userId: string) {
  await ensureUserBillingState(supabase, userId)

  const { data: entitlement, error: entitlementError } = await supabase
    .from("entitlements")
    .select("max_projects")
    .eq("user_id", userId)
    .maybeSingle()

  if (entitlementError) {
    return {
      allowed: false,
      message: "Could not validate project limit. Please try again.",
    }
  }

  const maxProjects: number | null =
    entitlement?.max_projects == null ? null : Number(entitlement.max_projects)
  if (maxProjects == null) {
    return { allowed: true }
  }

  const { count, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)

  if (countError) {
    return {
      allowed: false,
      message: "Could not validate project usage. Please try again.",
    }
  }

  const current = Number(count ?? 0)
  if (current >= maxProjects) {
    return {
      allowed: false,
      message: `Free plan project limit reached (${maxProjects}/${maxProjects}). Upgrade to Studio Pro for unlimited projects.`,
    }
  }

  return {
    allowed: true,
  }
}

export async function getBillingSnapshotForUser(
  supabase: SupabaseLike,
  userId: string
): Promise<BillingSnapshot | null> {
  await ensureUserBillingState(supabase, userId)

  const { data: entitlement } = await supabase
    .from("entitlements")
    .select("plan_code, max_projects, max_studio_generations, max_fast_video_generations")
    .eq("user_id", userId)
    .maybeSingle()

  const { data: usage } = await supabase
    .from("usage_counters")
    .select("studio_generations_used, fast_video_generations_used")
    .eq("user_id", userId)
    .maybeSingle()

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_code, status")
    .eq("user_id", userId)
    .maybeSingle()

  const planCode = (entitlement?.plan_code || subscription?.plan_code || "creator_free") as string
  const { data: plan } = await supabase
    .from("plans")
    .select("code, name")
    .eq("code", planCode)
    .maybeSingle()

  return {
    planCode,
    planName: plan?.name || (planCode === "studio_pro" ? "Studio Pro" : "Creator Free"),
    status: subscription?.status || "active",
    maxProjects: entitlement?.max_projects == null ? null : Number(entitlement.max_projects),
    maxStudioGenerations:
      entitlement?.max_studio_generations == null ? null : Number(entitlement.max_studio_generations),
    maxFastVideoGenerations:
      entitlement?.max_fast_video_generations == null ? null : Number(entitlement.max_fast_video_generations),
    studioGenerationsUsed: Number(usage?.studio_generations_used ?? 0),
    fastVideoGenerationsUsed: Number(usage?.fast_video_generations_used ?? 0),
  }
}

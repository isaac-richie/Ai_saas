import { createAdminClient, hasSupabaseAdminEnv } from "@/infrastructure/supabase/admin"

/** Emails that run the studio: always in, and allowed to grant access to others. */
export function getAdminAllowlist(): string[] {
  const raw = process.env.INNER_CIRCLE_ADMIN_EMAILS || process.env.ADMIN_EMAILS || ""
  return raw.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase()
  return Boolean(normalized && getAdminAllowlist().includes(normalized))
}

/**
 * Private beta: the studio (Fast Track, Studio, every paid generation) is open to admins and to
 * people whose Inner Circle entry an admin has set to "active". Everyone else sees "Beta is coming".
 */
export async function hasBetaAccess(email: string | null | undefined): Promise<boolean> {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return false
  if (isAdminEmail(normalized)) return true
  if (!hasSupabaseAdminEnv()) return false
  const { data, error } = await createAdminClient()
    .from("inner_circle_waitlist")
    .select("status")
    .eq("email", normalized)
    .maybeSingle()
  return !error && data?.status === "active"
}

export const BETA_LOCKED_MESSAGE = "Visiowave is in private beta. Join the Inner Circle and we'll contact you if you're selected."

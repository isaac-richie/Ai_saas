import { createClient } from "@/infrastructure/supabase/server"
import { decrypt } from "@/core/utils/security/encryption"

/**
 * The Kie key for a request: the studio's environment key, else the creator's own connected key.
 * Server-only: never exported from a "use server" module, so it can't be called from the browser.
 */
export async function resolveKieApiKey(userId: string): Promise<string | null> {
  if (process.env.KIE_AI_API_KEY) return process.env.KIE_AI_API_KEY
  const db = await createClient()
  const { data: provider } = await db.from("providers").select("id").eq("slug", "kie").eq("is_active", true).maybeSingle()
  if (!provider?.id) return null
  const { data: key } = await db.from("user_api_keys").select("encrypted_key").eq("user_id", userId).eq("provider_id", provider.id).maybeSingle()
  return key?.encrypted_key ? decrypt(key.encrypted_key) || null : null
}

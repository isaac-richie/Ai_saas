import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { hasBetaAccess } from "@/core/services/beta-access"

export const dynamic = "force-dynamic"

/** /settings sits outside /dashboard, so it applies the same private-beta gate itself. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/settings/api-keys")
  // /dashboard shows the "Your next film starts here" screen to people without access.
  if (!(await hasBetaAccess(user.email))) redirect("/dashboard")
  return <>{children}</>
}

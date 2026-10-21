import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { hasBetaAccess } from "@/core/services/beta-access"
import { BetaComing } from "@/interface/components/system/BetaComing"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/dashboard")
  }

  // Private beta: only admins and approved Inner Circle members get the studio.
  if (!(await hasBetaAccess(user.email))) {
    return <BetaComing email={user.email ?? ""} />
  }

  return <>{children}</>
}


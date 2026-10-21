"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/infrastructure/supabase/admin"
import { createClient } from "@/infrastructure/supabase/server"
import { isAdminEmail } from "@/core/services/beta-access"

const STATUSES = ["pending", "active"] as const

/** Admin only: let an Inner Circle member into the private beta ("active"), or take access back ("pending"). */
export async function setInnerCircleAccess(formData: FormData) {
  const id = String(formData.get("id") || "")
  const status = String(formData.get("status") || "")
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(STATUSES as readonly string[]).includes(status)) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) return

  await createAdminClient().from("inner_circle_waitlist").update({ status }).eq("id", id)
  revalidatePath("/dashboard/inner-circle")
}

"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { getBillingSnapshotForUser } from "@/core/services/billing"

export async function getMyBillingSnapshot() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const snapshot = await getBillingSnapshotForUser(supabase, user.id)
  if (!snapshot) {
    return { error: "Could not load billing details." }
  }

  return { data: snapshot }
}


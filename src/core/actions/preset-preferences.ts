"use server"

import { createClient } from "@/infrastructure/supabase/server"

type PresetType = "style" | "motion" | "shot_look"

async function ensureSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function getPresetPreferences(presetType: PresetType) {
  const { supabase, user } = await ensureSession()
  if (!user) return { data: { pinned: [] as string[], recent: [] as string[] } }

  const { data } = await supabase
    .from("user_preset_preferences")
    .select("preset_id, pinned, last_used_at")
    .eq("user_id", user.id)
    .eq("preset_type", presetType)
    .order("last_used_at", { ascending: false })

  const pinned = (data || []).filter((r) => r.pinned).map((r) => r.preset_id)
  const recent = (data || []).filter((r) => !r.pinned).slice(0, 5).map((r) => r.preset_id)

  return { data: { pinned, recent } }
}

export async function recordPresetUsage(presetType: PresetType, presetId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const { error } = await supabase
    .from("user_preset_preferences")
    .upsert(
      {
        user_id: user.id,
        preset_type: presetType,
        preset_id: presetId,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,preset_type,preset_id" }
    )

  if (error) return { error: error.message }
  return { data: { recorded: true } }
}

export async function togglePresetPin(presetType: PresetType, presetId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const { data: existing } = await supabase
    .from("user_preset_preferences")
    .select("id, pinned")
    .eq("user_id", user.id)
    .eq("preset_type", presetType)
    .eq("preset_id", presetId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from("user_preset_preferences")
      .update({ pinned: !existing.pinned })
      .eq("id", existing.id)

    if (error) return { error: error.message }
    return { data: { pinned: !existing.pinned } }
  }

  const { error } = await supabase
    .from("user_preset_preferences")
    .insert({
      user_id: user.id,
      preset_type: presetType,
      preset_id: presetId,
      pinned: true,
    })

  if (error) return { error: error.message }
  return { data: { pinned: true } }
}

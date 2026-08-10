"use server"

import { createClient } from "@/infrastructure/supabase/server"

export type ContinuityKey = "character" | "wardrobe" | "location" | "lighting" | "color_grade" | "camera_style"

export type ContinuityLocks = {
  character_locked: boolean
  character_value: string | null
  character_ref_url: string | null
  wardrobe_locked: boolean
  wardrobe_value: string | null
  wardrobe_ref_url: string | null
  location_locked: boolean
  location_value: string | null
  location_ref_url: string | null
  lighting_locked: boolean
  lighting_value: string | null
  color_grade_locked: boolean
  color_grade_value: string | null
  camera_style_locked: boolean
  camera_style_value: string | null
  source_shot_id: string | null
}

async function ensureSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

async function verifyShot(supabase: Awaited<ReturnType<typeof createClient>>, shotId: string, userId: string) {
  const { data } = await supabase
    .from("shots")
    .select("id, scene_id, scenes!inner(project_id, projects!inner(user_id))")
    .eq("id", shotId)
    .eq("scenes.projects.user_id", userId)
    .maybeSingle()
  return data
}

export async function getShotContinuity(shotId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const { data, error } = await supabase
    .from("shot_continuity")
    .select("*")
    .eq("shot_id", shotId)
    .maybeSingle()

  if (error) return { error: error.message }
  return { data }
}

export async function upsertShotContinuity(shotId: string, locks: Partial<ContinuityLocks>) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const shot = await verifyShot(supabase, shotId, user.id)
  if (!shot) return { error: "Shot not found" }

  const { data, error } = await supabase
    .from("shot_continuity")
    .upsert(
      {
        shot_id: shotId,
        ...locks,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shot_id" }
    )
    .select("shot_id")
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function inheritContinuityFromShot(targetShotId: string, sourceShotId: string) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const target = await verifyShot(supabase, targetShotId, user.id)
  if (!target) return { error: "Target shot not found" }

  const { data: source } = await supabase
    .from("shot_continuity")
    .select("*")
    .eq("shot_id", sourceShotId)
    .maybeSingle()

  if (!source) return { error: "Source shot has no continuity data" }

  const inherited: Partial<ContinuityLocks> & { source_shot_id: string } = {
    source_shot_id: sourceShotId,
  }

  if (source.character_locked) {
    inherited.character_locked = true
    inherited.character_value = source.character_value
    inherited.character_ref_url = source.character_ref_url
  }
  if (source.wardrobe_locked) {
    inherited.wardrobe_locked = true
    inherited.wardrobe_value = source.wardrobe_value
    inherited.wardrobe_ref_url = source.wardrobe_ref_url
  }
  if (source.location_locked) {
    inherited.location_locked = true
    inherited.location_value = source.location_value
    inherited.location_ref_url = source.location_ref_url
  }
  if (source.lighting_locked) {
    inherited.lighting_locked = true
    inherited.lighting_value = source.lighting_value
  }
  if (source.color_grade_locked) {
    inherited.color_grade_locked = true
    inherited.color_grade_value = source.color_grade_value
  }
  if (source.camera_style_locked) {
    inherited.camera_style_locked = true
    inherited.camera_style_value = source.camera_style_value
  }

  return upsertShotContinuity(targetShotId, inherited)
}

export async function buildContinuityClause(shotId: string): Promise<string> {
  const { supabase, user } = await ensureSession()
  if (!user) return ""

  const shot = await verifyShot(supabase, shotId, user.id)
  if (!shot) return ""

  const { data } = await supabase
    .from("shot_continuity")
    .select("*")
    .eq("shot_id", shotId)
    .maybeSingle()

  if (!data) return ""

  const parts: string[] = []

  if (data.character_locked && data.character_value) {
    parts.push(`character: ${data.character_value}`)
  }
  if (data.wardrobe_locked && data.wardrobe_value) {
    parts.push(`wardrobe: ${data.wardrobe_value}`)
  }
  if (data.location_locked && data.location_value) {
    parts.push(`location: ${data.location_value}`)
  }
  if (data.lighting_locked && data.lighting_value) {
    parts.push(`lighting: ${data.lighting_value}`)
  }
  if (data.color_grade_locked && data.color_grade_value) {
    parts.push(`color grade: ${data.color_grade_value}`)
  }
  if (data.camera_style_locked && data.camera_style_value) {
    parts.push(`camera style: ${data.camera_style_value}`)
  }

  if (parts.length === 0) return ""
  return `continuity locks -> ${parts.join(", ")}`
}

"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { getShotContinuity, upsertShotContinuity, inheritContinuityFromShot, type ContinuityLocks } from "@/core/actions/continuity"
import type { ContinuityKey } from "@/interface/components/fast-video/ContinuityPanel"

type ClientLocks = Record<ContinuityKey, boolean>
type ClientValues = Record<ContinuityKey, string>

const KEY_MAP: Record<ContinuityKey, { locked: string; value: string }> = {
  character: { locked: "character_locked", value: "character_value" },
  wardrobe: { locked: "wardrobe_locked", value: "wardrobe_value" },
  location: { locked: "location_locked", value: "location_value" },
  lighting: { locked: "lighting_locked", value: "lighting_value" },
  colorGrade: { locked: "color_grade_locked", value: "color_grade_value" },
  cameraStyle: { locked: "camera_style_locked", value: "camera_style_value" },
}

function clientToDb(locks: ClientLocks, values: ClientValues): Partial<ContinuityLocks> {
  return {
    character_locked: locks.character,
    character_value: values.character?.trim() || null,
    character_ref_url: null,
    wardrobe_locked: locks.wardrobe,
    wardrobe_value: values.wardrobe?.trim() || null,
    wardrobe_ref_url: null,
    location_locked: locks.location,
    location_value: values.location?.trim() || null,
    location_ref_url: null,
    lighting_locked: locks.lighting,
    lighting_value: values.lighting?.trim() || null,
    color_grade_locked: locks.colorGrade,
    color_grade_value: values.colorGrade?.trim() || null,
    camera_style_locked: locks.cameraStyle,
    camera_style_value: values.cameraStyle?.trim() || null,
    source_shot_id: null,
  }
}

function dbToClient(row: Record<string, unknown>): { locks: ClientLocks; values: ClientValues } {
  const locks = {} as ClientLocks
  const values = {} as ClientValues
  for (const [key, map] of Object.entries(KEY_MAP)) {
    const k = key as ContinuityKey
    locks[k] = Boolean(row[map.locked])
    values[k] = (row[map.value] as string) || ""
  }
  return { locks, values }
}

export function useContinuitySync() {
  const saveContinuity = useCallback(async (
    shotId: string,
    locks: ClientLocks,
    values: ClientValues,
  ) => {
    const db = clientToDb(locks, values)
    const res = await upsertShotContinuity(shotId, db)
    if (res.error) {
      toast.error(`Failed to save continuity: ${res.error}`)
      return false
    }
    return true
  }, [])

  const loadContinuity = useCallback(async (shotId: string) => {
    const res = await getShotContinuity(shotId)
    if (res.error) {
      toast.error(`Failed to load continuity: ${res.error}`)
      return null
    }
    if (!res.data) return null
    return dbToClient(res.data as Record<string, unknown>)
  }, [])

  const inheritContinuity = useCallback(async (
    targetShotId: string,
    sourceShotId: string,
  ) => {
    const res = await inheritContinuityFromShot(targetShotId, sourceShotId)
    if (res.error) {
      toast.error(`Failed to inherit continuity: ${res.error}`)
      return false
    }
    return true
  }, [])

  return { saveContinuity, loadContinuity, inheritContinuity }
}

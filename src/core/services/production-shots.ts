/**
 * A Longer film's shots are permanent (migration 0058). Re-planning updates them in place; a shot the
 * new plan no longer has is kept with its Takes and marked `retired_at` in generation_settings.
 */

type Settings = unknown
type ShotLike = { id: string; sequence_order: number | null; generation_settings?: Settings }

const settingsOf = (value: Settings) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {})

/** Made by the film's crew plan (not added by hand in Scene Studio). */
export function isProductionShot(settings: Settings): boolean {
  return typeof settingsOf(settings).production_job_id === "string"
}

/** Left out by a later plan: kept, with its Takes, but no longer part of the film. */
export function isRetiredShot(settings: Settings): boolean {
  return settingsOf(settings).retired_at != null
}

/** The film's live shots in plan order: shot N of the plan is the Nth of these. */
export function livePlanShots<T extends ShotLike>(shots: T[], planLength: number): T[] {
  return shots
    .filter((shot) => isProductionShot(shot.generation_settings) && !isRetiredShot(shot.generation_settings))
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
    .slice(0, Math.max(0, planLength))
}

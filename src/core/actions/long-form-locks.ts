"use server"

import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { labelProductionAssets, ownsAssetUrl, productionAssetsSchema, type ProductionAsset } from "@/core/validation/production-assets"
import { productionPlanSchema } from "@/core/validation/production-crew"
import { resolveKieVideoModelByFamily } from "@/core/config/kie-video-models"
import { LOCK_ROLES, planLockedRequest, resolveLocks, type LockBinding } from "@/core/services/long-form-locks"
import { MAX_BINDINGS_PER_SCOPE, fetchImage, isMissingLocksTable, loadFilmLocks } from "@/core/services/long-form-lock-store"
import { LONG_FORM_LOCKS_ENABLED } from "@/core/config/feature-flags"

const bindingInput = z.object({
  assetId: z.string().uuid(),
  /** Present for an already-pinned version (kept exactly as pinned, even if the library changed). */
  assetUrl: z.string().url().optional(),
  role: z.enum(LOCK_ROLES),
  entityLabel: z.string().trim().max(60).default(""),
  viewLabel: z.string().trim().max(60).default(""),
})

const saveSchema = z.object({
  productionId: z.string().uuid(),
  scope: z.enum(["scene", "shot"]),
  shotNumber: z.number().int().min(1).max(24).nullable(),
  expectedRevision: z.number().int().min(0),
  bindings: z.array(bindingInput).max(MAX_BINDINGS_PER_SCOPE),
}).refine(v => (v.scope === "scene") === (v.shotNumber === null), { message: "Scene locks have no shot number; shot locks need one." })

type Session = Awaited<ReturnType<typeof createClient>>

async function ownedFilm(db: Session, userId: string, productionId: string) {
  const { data: job } = await db.from("production_jobs").select("id,parent_job_id,reference_assets,plan,scene_id").eq("id", productionId).eq("user_id", userId).maybeSingle()
  if (!job) return null
  const rootId = (job.parent_job_id as string | null) || (job.id as string)
  const parsed = productionAssetsSchema.safeParse(job.reference_assets ?? [])
  const library = (parsed.success ? labelProductionAssets(parsed.data) : []).filter(asset => asset.mediaType === "image")
  return { job, rootId, library }
}

export type FilmLockView = {
  enabled: boolean
  /** False until the database migration (0052) has been applied. */
  available: boolean
  rootId: string
  revision: number
  scene: LockBinding[]
  shots: Record<number, LockBinding[]>
  library: ProductionAsset[]
  safetyLimit: number
}

/** The film's locks and image library, for the Long Form cards and editor. */
export async function getFilmLocks(productionId: string): Promise<{ data?: FilmLockView; error?: string }> {
  if (!z.string().uuid().safeParse(productionId).success) return { error: "Choose a production." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const film = await ownedFilm(db, user.id, productionId)
  if (!film) return { error: "Production not found." }
  try {
    const locks = await loadFilmLocks(db, film.rootId)
    return { data: { enabled: LONG_FORM_LOCKS_ENABLED, ...locks, rootId: film.rootId, library: film.library, safetyLimit: MAX_BINDINGS_PER_SCOPE } }
  } catch {
    return { error: "Could not load locked images." }
  }
}

/**
 * Saves one scope's bindings (this shot, or the entire scene) as a whole. New images are read, checked
 * and pinned (checksum, real type, size); already-pinned versions are kept exactly. Saving never depends
 * on the selected model: an over-limit set is saved and generation is blocked separately.
 */
export async function saveLockScope(input: unknown): Promise<{ data?: { revision: number }; error?: string; stale?: boolean }> {
  if (!LONG_FORM_LOCKS_ENABLED) return { error: "Locked images are turned off." }
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the locked images and try again." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const film = await ownedFilm(db, user.id, parsed.data.productionId)
  if (!film) return { error: "Production not found." }

  let current
  try { current = await loadFilmLocks(db, film.rootId) } catch { return { error: "Could not load locked images." } }
  if (!current.available) return { error: "Locked images need a database update (migration 0052). Nothing was saved." }
  if (current.revision !== parsed.data.expectedRevision) return { error: "These locks changed in another window. Reload to see the latest, then try again.", stale: true }

  const existing = parsed.data.scope === "scene" ? current.scene : current.shots[parsed.data.shotNumber!] ?? []
  const pinnedByUrl = new Map(existing.map(b => [b.assetUrl, b]))
  const libraryById = new Map(film.library.map(asset => [asset.id, asset]))
  const fetched = new Map<string, Awaited<ReturnType<typeof fetchImage>>>()

  const rows = []
  for (const item of parsed.data.bindings) {
    const pinned = item.assetUrl ? pinnedByUrl.get(item.assetUrl) : undefined
    if (item.assetUrl && !pinned) return { error: "A locked image version isn't part of this shot's saved locks. Reload and try again." }
    let source: Pick<LockBinding, "assetId" | "assetUrl" | "sha256" | "assetName" | "contentType" | "byteSize" | "width" | "height">
    if (pinned) {
      if (pinned.assetId !== item.assetId) return { error: "A locked image doesn't match its saved version. Reload and try again." }
      source = pinned
    } else {
      // A new lock must come from THIS film's library, uploaded by this account.
      const asset = libraryById.get(item.assetId)
      if (!asset || !ownsAssetUrl(asset.url, user.id)) return { error: "Choose images from this film's reference library." }
      let image = fetched.get(asset.url)
      if (!image) {
        try { image = await fetchImage(asset.url, asset.name) } catch (error) { return { error: error instanceof Error ? error.message : "An image could not be read." } }
        fetched.set(asset.url, image)
      }
      source = { assetId: asset.id, assetUrl: asset.url, sha256: image.sha256, assetName: asset.name.slice(0, 160), contentType: image.probe.contentType, byteSize: image.byteSize, width: image.probe.width, height: image.probe.height }
    }
    rows.push({
      asset_id: source.assetId, asset_url: source.assetUrl, asset_sha256: source.sha256, asset_name: source.assetName,
      content_type: source.contentType, byte_size: source.byteSize, width: source.width, height: source.height,
      role: item.role, entity_label: item.entityLabel, view_label: item.viewLabel,
    })
  }

  const { data: revision, error } = await db.rpc("save_long_form_bindings", {
    p_root: film.rootId, p_scope: parsed.data.scope, p_shot: parsed.data.shotNumber, p_expected_revision: parsed.data.expectedRevision, p_bindings: rows,
  })
  if (isMissingLocksTable(error)) return { error: "Locked images need a database update (migration 0052). Nothing was saved." }
  if (error?.code === "40001") return { error: "These locks changed in another window. Reload to see the latest, then try again.", stale: true }
  if (error) return { error: "Could not save the locked images. Nothing was changed." }
  return { data: { revision: Number(revision) } }
}

export type ShotLockStatus = {
  shotNumber: number
  requiredImageCount: number
  bindingCount: number
  status: "none" | "mapped" | "blocked"
  issues: string[]
  model: string
}

/**
 * Checks every shot's locks against its chosen model without submitting anything: required and mapped
 * counts, or why it can't generate. File checks (still readable, unchanged) happen at generation.
 */
export async function preflightFilmLocks(productionId: string): Promise<{ data?: ShotLockStatus[]; error?: string }> {
  if (!z.string().uuid().safeParse(productionId).success) return { error: "Choose a production." }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: "Please sign in." }
  const film = await ownedFilm(db, user.id, productionId)
  if (!film) return { error: "Production not found." }
  const plan = productionPlanSchema.safeParse(film.job.plan)
  if (!plan.success) return { data: [] }
  let locks
  try { locks = await loadFilmLocks(db, film.rootId) } catch { return { error: "Could not load locked images." } }
  return {
    data: plan.data.deliverables.map((shot, index) => {
      const shotNumber = index + 1
      const model = resolveKieVideoModelByFamily({ familyId: shot.modelFamilyId, useImageToVideo: true })
      return shotLockStatus(locks.scene, locks.shots[shotNumber] ?? [], shotNumber, model)
    }),
  }
}

function shotLockStatus(scene: LockBinding[], shot: LockBinding[], shotNumber: number, model: string): ShotLockStatus {
  const resolved = resolveLocks(scene, shot)
  if (!resolved.bindingCount) return { shotNumber, requiredImageCount: 0, bindingCount: 0, status: "none", issues: [], model }
  // In a Long Form film every shot after the first continues from the previous shot's last frame.
  const planned = planLockedRequest(resolved, model, { continuityStartUrl: shotNumber > 1 ? "continuity://previous-shot" : null })
  return { shotNumber, requiredImageCount: resolved.requiredImageCount, bindingCount: resolved.bindingCount, status: planned.ok ? "mapped" : "blocked", issues: planned.ok ? [] : planned.issues, model }
}

import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { probeImage, type ImageProbe } from "@/core/utils/image-probe"
import type { LockBinding, LockRole, ResolvedBinding } from "@/core/services/long-form-locks"

/** Largest image the app will pin; Seedance's own cap. Kling's 10 MB cap is checked at planning. */
export const MAX_LOCK_IMAGE_BYTES = 30 * 1024 * 1024
/**
 * Operational safety limit, separate from any model capability: how many bindings one scope may save.
 * Shown in the editor. A model may accept fewer; that is checked per endpoint, not here.
 */
export const MAX_BINDINGS_PER_SCOPE = 40

type Row = {
  id: string; scope_type: "scene" | "shot"; shot_number: number | null; asset_id: string; asset_url: string; asset_sha256: string
  asset_name: string; content_type: LockBinding["contentType"]; byte_size: number; width: number; height: number
  role: LockRole; entity_label: string; view_label: string
}

export const toBinding = (row: Row): LockBinding => ({
  id: row.id, scopeType: row.scope_type, shotNumber: row.shot_number, assetId: row.asset_id, assetUrl: row.asset_url,
  sha256: row.asset_sha256, assetName: row.asset_name, contentType: row.content_type, byteSize: row.byte_size,
  width: row.width, height: row.height, role: row.role, entityLabel: row.entity_label, viewLabel: row.view_label,
})

export type FilmLocks = { available: boolean; revision: number; scene: LockBinding[]; shots: Record<number, LockBinding[]> }

/** True when the error means the locks tables have not been created yet (migration 0052 pending). */
export const isMissingLocksTable = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /long_form_(reference_bindings|binding_revisions)/.test(error.message ?? "")))

/** The film's locks (RLS limits rows to the signed-in owner). `available` is false before the migration. */
export async function loadFilmLocks(db: SupabaseClient, rootId: string): Promise<FilmLocks> {
  const [{ data: rows, error }, { data: rev, error: revError }] = await Promise.all([
    db.from("long_form_reference_bindings").select("*").eq("production_root_id", rootId).order("created_at", { ascending: true }),
    db.from("long_form_binding_revisions").select("revision").eq("production_root_id", rootId).maybeSingle(),
  ])
  if (isMissingLocksTable(error) || isMissingLocksTable(revError)) return { available: false, revision: 0, scene: [], shots: {} }
  if (error || revError) throw new Error("Could not load locked images.")
  const scene: LockBinding[] = []
  const shots: Record<number, LockBinding[]> = {}
  for (const row of (rows ?? []) as Row[]) {
    const binding = toBinding(row)
    if (binding.scopeType === "scene") scene.push(binding)
    else if (binding.shotNumber) (shots[binding.shotNumber] ??= []).push(binding)
  }
  return { available: true, revision: (rev as { revision?: number } | null)?.revision ?? 0, scene, shots }
}

export type FetchedImage = { sha256: string; byteSize: number; probe: ImageProbe }

/** Downloads one image (bounded) and reads its checksum, real type and size. Throws a plain message. */
export async function fetchImage(url: string, name: string): Promise<FetchedImage> {
  let response: Response
  try {
    response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store" })
  } catch {
    throw new Error(`${name} could not be read. Check the file is still in your library.`)
  }
  if (!response.ok || !response.body) throw new Error(`${name} is missing or not accessible (${response.status}).`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_LOCK_IMAGE_BYTES) throw new Error(`${name} is over 30 MB. Use a smaller image.`)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = Buffer.concat(chunks)
  const probe = probeImage(bytes)
  if (!probe) throw new Error(`${name} isn't a JPG, PNG or WebP image.`)
  return { sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength, probe }
}

/**
 * Before a paid submission: every pinned image must still be readable and byte-identical to the version
 * that was locked. Returns plain issues; empty means every file checked out.
 */
export async function verifyPinnedImages(bindings: ResolvedBinding[]): Promise<string[]> {
  const unique = [...new Map(bindings.map(b => [b.assetUrl, b])).values()]
  const results = await Promise.all(unique.map(async (binding) => {
    try {
      const fetched = await fetchImage(binding.assetUrl, binding.assetName)
      return fetched.sha256 === binding.sha256 ? null : `${binding.assetName} has changed since it was locked. Re-lock it to use the new version.`
    } catch (error) {
      return error instanceof Error ? error.message : `${binding.assetName} could not be checked.`
    }
  }))
  return results.filter((issue): issue is string => Boolean(issue))
}

/** A stable fingerprint of exactly what a locked request will send. */
export function requestFingerprint(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex")
}

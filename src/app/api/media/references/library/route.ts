import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { referenceLibrarySchema } from "@/core/validation/media-reference"
import { shotFramesSchema } from "@/core/validation/shot-frames"

const MISSING_COLUMN = ["42703", "PGRST204"]
import { readBoundedBody } from "@/core/utils/security/bounded-body"

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 })
  let result = await db.from("fast_video_reference_libraries").select("reference_assets,shot_frames,revision,updated_at").eq("user_id", user.id).maybeSingle()
  // Before migration 0034 there is no frames column; references still load.
  if (result.error && MISSING_COLUMN.includes(result.error.code)) {
    result = await db.from("fast_video_reference_libraries").select("reference_assets,revision,updated_at").eq("user_id", user.id).maybeSingle() as typeof result
  }
  const { data, error } = result
  if (error) return NextResponse.json({ error: "Cloud reference storage is unavailable. Apply migration 0028 and retry." }, { status: 503 })
  const frames = shotFramesSchema.safeParse(data?.shot_frames ?? {})
  return NextResponse.json({ references: data?.reference_assets || [], frames: frames.success ? frames.data : null, revision: data?.revision || 0, updatedAt: data?.updated_at || null }, { headers: { "Cache-Control": "no-store" } })
}

export async function PUT(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 })
  try {
    const body = z.object({ references: referenceLibrarySchema, frames: shotFramesSchema.optional().nullable(), revision: z.number().int().min(0).max(2147483646) }).parse(JSON.parse(await readBoundedBody(request, 900000)))
    if (body.references.some((ref) => !ref.assetPath.startsWith(`${user.id}/`))) return NextResponse.json({ error: "This setup contains references from another account." }, { status: 403 })
    if ([body.frames?.start, body.frames?.end].some((frame) => frame && !frame.assetPath.startsWith(`${user.id}/`))) return NextResponse.json({ error: "This setup contains frames from another account." }, { status: 403 })
    const baseRow = { user_id: user.id, reference_assets: body.references, revision: body.revision + 1, updated_at: new Date().toISOString() }
    const write = (row: Record<string, unknown>) => body.revision === 0
      ? db.from("fast_video_reference_libraries").insert(row).select("revision").single()
      : db.from("fast_video_reference_libraries").update(row).eq("user_id", user.id).eq("revision", body.revision).select("revision").maybeSingle()
    let result = await write(body.frames ? { ...baseRow, shot_frames: body.frames } : baseRow)
    // Before migration 0034, save references and report that frames were skipped.
    let framesSaved = Boolean(body.frames)
    if (result.error && MISSING_COLUMN.includes(result.error.code) && body.frames) {
      result = await write(baseRow)
      framesSaved = false
    }
    if (result.error?.code === "23505" || (!result.error && !result.data)) return NextResponse.json({ error: "Another session changed your cloud setup. Load it before saving again. Your local edits are still here." }, { status: 409 })
    if (result.error) return NextResponse.json({ error: "Could not save the setup. Check migration 0028 and retry; local references are unchanged." }, { status: 503 })
    return NextResponse.json({ revision: result.data!.revision, framesSaved }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Invalid or oversized reference setup. Check trims and remove old references before saving." }, { status: 400 })
  }
}

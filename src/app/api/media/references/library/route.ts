import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { referenceLibrarySchema } from "@/core/validation/media-reference"
import { readBoundedBody } from "@/core/utils/security/bounded-body"

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 })
  const { data, error } = await db.from("fast_video_reference_libraries").select("reference_assets,revision,updated_at").eq("user_id", user.id).maybeSingle()
  if (error) return NextResponse.json({ error: "Cloud reference storage is unavailable. Apply migration 0028 and retry." }, { status: 503 })
  return NextResponse.json({ references: data?.reference_assets || [], revision: data?.revision || 0, updatedAt: data?.updated_at || null }, { headers: { "Cache-Control": "no-store" } })
}

export async function PUT(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 })
  try {
    const body = z.object({ references: referenceLibrarySchema, revision: z.number().int().min(0).max(2147483646) }).parse(JSON.parse(await readBoundedBody(request, 900000)))
    if (body.references.some((ref) => !ref.assetPath.startsWith(`${user.id}/`))) return NextResponse.json({ error: "This setup contains references from another account." }, { status: 403 })
    const row = { user_id: user.id, reference_assets: body.references, revision: body.revision + 1, updated_at: new Date().toISOString() }
    const result = body.revision === 0
      ? await db.from("fast_video_reference_libraries").insert(row).select("revision").single()
      : await db.from("fast_video_reference_libraries").update(row).eq("user_id", user.id).eq("revision", body.revision).select("revision").maybeSingle()
    if (result.error?.code === "23505" || (!result.error && !result.data)) return NextResponse.json({ error: "Another session changed your cloud setup. Load it before saving again. Your local edits are still here." }, { status: 409 })
    if (result.error) return NextResponse.json({ error: "Could not save the setup. Check migration 0028 and retry; local references are unchanged." }, { status: 503 })
    return NextResponse.json({ revision: result.data!.revision }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Invalid or oversized reference setup. Check trims and remove old references before saving." }, { status: 400 })
  }
}

import { NextResponse } from "next/server"
import { createClient } from "@/infrastructure/supabase/server"

const MAX_CAPTION_BYTES = 1024 * 1024

function isSrt(value: string): boolean {
  const normalized = value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim()
  return /^\d+\n\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}[\s\S]*/.test(normalized)
}

export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an SRT caption file." }, { status: 400 })
    if (!file.name.toLowerCase().endsWith(".srt")) return NextResponse.json({ error: "Only .srt caption files are supported." }, { status: 415 })
    if (file.size === 0 || file.size > MAX_CAPTION_BYTES) return NextResponse.json({ error: "Caption files must be between 1 byte and 1 MB." }, { status: 413 })
    const content = await file.text()
    if (!isSrt(content)) return NextResponse.json({ error: "The file is not a valid SRT caption track." }, { status: 422 })
    const path = `${user.id}/captions/${crypto.randomUUID()}.srt`
    const { error } = await db.storage.from("elements").upload(path, content.replace(/^\uFEFF/, ""), { contentType: "application/x-subrip", upsert: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data } = db.storage.from("elements").getPublicUrl(path)
    return NextResponse.json({ ok: true, url: data.publicUrl, name: file.name })
  } catch (cause) {
    console.error("Caption upload failed", cause)
    return NextResponse.json({ error: "Could not upload the caption track." }, { status: 500 })
  }
}

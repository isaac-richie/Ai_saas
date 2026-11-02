import { createClient } from "@/infrastructure/supabase/client"

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
}
const UPLOAD_TIMEOUT_MS = 120_000

/**
 * Sends a reference straight from the browser to the creator's own folder in storage. Going through
 * our server capped files at Vercel's ~4.5 MB request limit, so larger photos failed or hung.
 */
export async function uploadReferenceFile(file: File): Promise<string> {
  const ext = EXTENSIONS[file.type]
  if (!ext) throw new Error("Use a JPG, PNG, WebP, MP4, WebM or MOV file.")
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Please sign in again.")
  const path = `${user.id}/${crypto.randomUUID()}_${Date.now()}.${ext}`
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The upload took too long. Check your connection and try again.")), UPLOAD_TIMEOUT_MS)
  })
  try {
    const { error } = await Promise.race([supabase.storage.from("elements").upload(path, file, { contentType: file.type, upsert: false }), timeout])
    if (error) throw new Error(/exceeded|too large|payload/i.test(error.message) ? "This file is too large to upload." : "The upload did not finish. Try again.")
  } finally {
    clearTimeout(timer)
  }
  return supabase.storage.from("elements").getPublicUrl(path).data.publicUrl
}

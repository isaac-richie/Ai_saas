import { createClient } from "@/infrastructure/supabase/server"
import { NextResponse } from "next/server"

// Only allow raster image types. SVG is intentionally excluded because the
// bucket is public and SVG can carry executable script (stored XSS).
const ALLOWED_MIME_TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const formData = await request.formData()
        const file = formData.get("file")

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 })
        }

        const fileExt = ALLOWED_MIME_TYPES[file.type]
        if (!fileExt) {
            return NextResponse.json(
                { error: "Unsupported file type. Upload a JPEG, PNG, WebP, or GIF image." },
                { status: 415 }
            )
        }

        if (file.size === 0) {
            return NextResponse.json({ error: "File is empty" }, { status: 400 })
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { error: "File is too large. Maximum upload size is 10 MB." },
                { status: 413 }
            )
        }

        // Generate a unique path derived from the validated MIME type, never the
        // client-supplied filename.
        const fileName = `${crypto.randomUUID()}_${Date.now()}.${fileExt}`
        const filePath = `${user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from("elements")
            .upload(filePath, file, { contentType: file.type })

        if (uploadError) {
            const message = uploadError.message || "Upload failed"
            if (/bucket.*not found/i.test(message)) {
                return NextResponse.json(
                    {
                        error:
                            "Storage bucket 'elements' not found. Create 'elements' and 'renders' buckets in Supabase (or run migration 0011_storage_buckets.sql).",
                    },
                    { status: 500 }
                )
            }
            throw uploadError
        }

        const { data: { publicUrl } } = supabase.storage
            .from("elements")
            .getPublicUrl(filePath)

        return NextResponse.json({ success: true, url: publicUrl })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to upload file"
        console.error("Upload error:", error)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

import { createClient } from "@/infrastructure/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const formData = await request.formData()
        const file = formData.get("file") as File

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 })
        }

        // Sanitize filename & generate unique path string
        const fileExt = file.name.split(".").pop()
        const fileName = `${crypto.randomUUID()}_${Date.now()}.${fileExt}`
        const filePath = `${user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from("elements")
            .upload(filePath, file)

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

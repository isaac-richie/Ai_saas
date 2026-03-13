import { createClient } from "@/infrastructure/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    const supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        user = data.user
    }

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

import { NextResponse } from "next/server"
import { createClient } from "@/infrastructure/supabase/server"
import { mkdir, readFile, writeFile } from "fs/promises"
import { join } from "path"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)
export const runtime = "nodejs"

type WorkerJob = {
    id: string
    project_id: string
    profile: string
}

type WorkerItem = {
    id: string
    source_url: string | null
    order_index: number
}

function extensionFromUrl(url: string): string {
    const clean = url.split("?")[0]
    const parts = clean.split(".")
    if (parts.length < 2) return "bin"
    const ext = parts[parts.length - 1]?.toLowerCase() || "bin"
    return ext.slice(0, 10)
}

function extensionFromContentType(contentType: string | null): string {
    if (!contentType) return "bin"
    if (contentType.includes("image/jpeg")) return "jpg"
    if (contentType.includes("image/png")) return "png"
    if (contentType.includes("image/webp")) return "webp"
    if (contentType.includes("video/mp4")) return "mp4"
    if (contentType.includes("video/webm")) return "webm"
    return "bin"
}

function isVideoExt(ext: string): boolean {
    return ext === "mp4" || ext === "mov" || ext === "webm" || ext === "m4v"
}

async function processJob(supabase: any, userId: string, job: WorkerJob) {
    await supabase
        .from("export_jobs")
        .update({ status: "processing", progress: 5, error_message: null, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("user_id", userId)

    const { data: items, error: itemsError } = await supabase
        .from("export_job_items")
        .select("id, source_url, order_index")
        .eq("job_id", job.id)
        .order("order_index", { ascending: true }) as { data: WorkerItem[] | null; error: { message: string } | null }

    if (itemsError || !items || items.length === 0) {
        await supabase
            .from("export_jobs")
            .update({ status: "failed", error_message: itemsError?.message || "No items in export job", updated_at: new Date().toISOString() })
            .eq("id", job.id)
            .eq("user_id", userId)
        return { ok: false, error: itemsError?.message || "No items in export job" }
    }

    const tmpDir = join("/tmp", `export-job-${job.id}`)
    await mkdir(tmpDir, { recursive: true })

    const uploadedItemUrls: string[] = []
    const localVideoPaths: string[] = []
    let processed = 0

    for (const item of items) {
        if (!item.source_url) continue

        const response = await fetch(item.source_url)
        if (!response.ok) {
            await supabase
                .from("export_job_items")
                .update({ status: "failed", error_message: "Failed to download source asset", updated_at: new Date().toISOString() })
                .eq("id", item.id)
            continue
        }

        const contentType = response.headers.get("content-type")
        const fallbackExt = extensionFromUrl(item.source_url)
        const ext = extensionFromContentType(contentType) || fallbackExt
        const fileBuffer = Buffer.from(await response.arrayBuffer())
        const storagePath = `exports/${userId}/${job.project_id}/${job.id}/item-${item.order_index + 1}.${ext}`

        const { error: uploadError } = await supabase.storage
            .from("renders")
            .upload(storagePath, fileBuffer, {
                contentType: contentType || undefined,
                upsert: true,
            })

        if (uploadError) {
            await supabase
                .from("export_job_items")
                .update({ status: "failed", error_message: uploadError.message, updated_at: new Date().toISOString() })
                .eq("id", item.id)
            continue
        }

        const { data: publicData } = supabase.storage.from("renders").getPublicUrl(storagePath)
        const publicUrl = publicData.publicUrl
        uploadedItemUrls.push(publicUrl)

        await supabase
            .from("export_job_items")
            .update({ status: "completed", output_url: publicUrl, error_message: null, updated_at: new Date().toISOString() })
            .eq("id", item.id)

        if (isVideoExt(ext)) {
            const localPath = join(tmpDir, `clip-${item.order_index}.mp4`)
            await writeFile(localPath, fileBuffer)
            localVideoPaths.push(localPath)
        }

        processed += 1
        const progress = Math.min(85, Math.round((processed / items.length) * 80) + 5)
        await supabase
            .from("export_jobs")
            .update({ progress, updated_at: new Date().toISOString() })
            .eq("id", job.id)
            .eq("user_id", userId)
    }

    if (processed === 0) {
        await supabase
            .from("export_jobs")
            .update({ status: "failed", error_message: "No assets could be exported", updated_at: new Date().toISOString() })
            .eq("id", job.id)
            .eq("user_id", userId)
        return { ok: false, error: "No assets could be exported" }
    }

    let jobOutputUrl: string | null = uploadedItemUrls[0] || null

    if (uploadedItemUrls.length > 1 && localVideoPaths.length === uploadedItemUrls.length) {
        try {
            const listPath = join(tmpDir, "list.txt")
            const listContent = localVideoPaths.map((clip) => `file '${clip}'`).join("\n")
            await writeFile(listPath, listContent)

            const outputPath = join(tmpDir, `export-${job.id}.mp4`)
            await execFileAsync("ffmpeg", [
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", listPath,
                "-c:v", "libx264",
                "-c:a", "aac",
                "-movflags", "+faststart",
                outputPath,
            ])

            const outputBuffer = await readFile(outputPath)
            const outputKey = `exports/${userId}/${job.project_id}/${job.id}/final.mp4`
            const { error: finalUploadError } = await supabase.storage.from("renders").upload(outputKey, outputBuffer, {
                contentType: "video/mp4",
                upsert: true,
            })

            if (!finalUploadError) {
                const { data: finalPublicData } = supabase.storage.from("renders").getPublicUrl(outputKey)
                jobOutputUrl = finalPublicData.publicUrl
            }
        } catch {
            // If merge fails, we still complete with item-level exports.
        }
    } else if (uploadedItemUrls.length > 1) {
        const manifest = {
            jobId: job.id,
            profile: job.profile,
            generatedAt: new Date().toISOString(),
            assets: uploadedItemUrls,
        }

        const manifestKey = `exports/${userId}/${job.project_id}/${job.id}/manifest.json`
        const { error: manifestUploadError } = await supabase.storage.from("renders").upload(
            manifestKey,
            Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"),
            {
                contentType: "application/json",
                upsert: true,
            }
        )

        if (!manifestUploadError) {
            const { data: manifestPublicData } = supabase.storage.from("renders").getPublicUrl(manifestKey)
            jobOutputUrl = manifestPublicData.publicUrl
        }
    }

    await supabase
        .from("export_jobs")
        .update({
            status: "completed",
            progress: 100,
            output_url: jobOutputUrl,
            error_message: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("user_id", userId)

    return { ok: true, outputUrl: jobOutputUrl, processed }
}

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

    const body = await request.json().catch(() => ({}))
    const requestedJobId = typeof body?.jobId === "string" ? body.jobId : null
    const limit = Math.max(1, Math.min(5, Number(body?.limit) || 1))
    const db = supabase as any

    let query = db
        .from("export_jobs")
        .select("id, project_id, profile")
        .eq("user_id", user.id)
        .in("status", ["queued", "processing"])
        .order("created_at", { ascending: true })
        .limit(limit)

    if (requestedJobId) {
        query = query.eq("id", requestedJobId)
    }

    const { data: jobs, error: jobsError } = await query as { data: WorkerJob[] | null; error: { message: string } | null }

    if (jobsError) {
        return NextResponse.json({ error: jobsError.message }, { status: 400 })
    }

    if (!jobs || jobs.length === 0) {
        return NextResponse.json({ success: true, processed: 0, message: "No queued exports" })
    }

    const results = []
    for (const job of jobs) {
        const result = await processJob(db, user.id, job)
        results.push({ jobId: job.id, ...result })
    }

    return NextResponse.json({
        success: true,
        processed: results.filter((result) => result.ok).length,
        results,
    })
}

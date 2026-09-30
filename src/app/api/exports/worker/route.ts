import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/infrastructure/supabase/server"
import { createAdminClient, hasSupabaseAdminEnv } from "@/infrastructure/supabase/admin"
import { mkdir, readFile, writeFile, rm } from "fs/promises"
import { join } from "path"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)
export const runtime = "nodejs"

type WorkerJob = {
    id: string
    user_id: string
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

async function hasFfmpeg(): Promise<boolean> {
    try {
        await execFileAsync("ffmpeg", ["-version"])
        return true
    } catch {
        return false
    }
}

async function cleanupTmpDir(tmpDir: string) {
    try {
        await rm(tmpDir, { recursive: true, force: true })
    } catch {
        // Best-effort cleanup
    }
}

async function processJob(supabase: SupabaseClient, userId: string, job: WorkerJob) {
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

    try {
        const uploadedItemUrls: string[] = []
        const localVideoPaths: string[] = []
        let processed = 0

        for (const item of items) {
            if (!item.source_url) continue

            const response = await fetch(item.source_url)
            if (!response.ok) {
                await supabase
                    .from("export_job_items")
                    .update({ status: "failed", error_message: `Failed to download source asset (HTTP ${response.status})`, updated_at: new Date().toISOString() })
                    .eq("id", item.id)
                continue
            }

            const contentType = response.headers.get("content-type")
            const fallbackExt = extensionFromUrl(item.source_url)
            const contentExt = extensionFromContentType(contentType)
            const ext = contentExt === "bin" ? fallbackExt : contentExt
            const fileBuffer = Buffer.from(await response.arrayBuffer())
            if (!fileBuffer.length) {
                await supabase
                    .from("export_job_items")
                    .update({ status: "failed", error_message: "Source asset is empty", updated_at: new Date().toISOString() })
                    .eq("id", item.id)
                continue
            }
            const storagePath = `${userId}/exports/${job.project_id}/${job.id}/item-${item.order_index + 1}.${ext}`

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

        if (processed !== items.length) {
            const message = processed === 0
                ? "No assets could be exported"
                : `${items.length - processed} of ${items.length} source assets could not be exported`
            await supabase
                .from("export_jobs")
                .update({ status: "failed", output_url: null, error_message: message, updated_at: new Date().toISOString() })
                .eq("id", job.id)
                .eq("user_id", userId)
            return { ok: false, error: message }
        }

        // A sequence must never silently become a download of its first item.
        let jobOutputUrl: string | null = items.length === 1 ? uploadedItemUrls[0] : null
        let sequenceError: string | null = null

        if (items.length > 1 && localVideoPaths.length === items.length) {
            const ffmpegAvailable = await hasFfmpeg()
            if (ffmpegAvailable) {
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
                    const outputKey = `${userId}/exports/${job.project_id}/${job.id}/final.mp4`
                    const { error: finalUploadError } = await supabase.storage.from("renders").upload(outputKey, outputBuffer, {
                        contentType: "video/mp4",
                        upsert: true,
                    })

                    if (!finalUploadError) {
                        const { data: finalPublicData } = supabase.storage.from("renders").getPublicUrl(outputKey)
                        jobOutputUrl = finalPublicData.publicUrl
                    } else {
                        sequenceError = `Could not store the merged video: ${finalUploadError.message}`
                    }
                } catch (concatError) {
                    const message = concatError instanceof Error ? concatError.message : "ffmpeg concat failed"
                    sequenceError = `Video merge failed: ${message.slice(0, 200)}`
                }
            } else {
                sequenceError = "Video merge is unavailable on this worker. Retry when the export service is ready."
            }
        } else if (items.length > 1) {
            sequenceError = "This sequence contains non-video assets and cannot be merged into one playable file."
        }

        if (!jobOutputUrl) {
            const message = sequenceError || "The export did not produce a downloadable file."
            await supabase
                .from("export_jobs")
                .update({ status: "failed", output_url: null, error_message: message, updated_at: new Date().toISOString() })
                .eq("id", job.id)
                .eq("user_id", userId)
            return { ok: false, error: message }
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
    } catch {
        await supabase
            .from("export_jobs")
            .update({ status: "failed", output_url: null, error_message: "Export interrupted while reading or storing media", updated_at: new Date().toISOString() })
            .eq("id", job.id)
            .eq("user_id", userId)
        return { ok: false, error: "Export interrupted. Retry after checking the source files." }
    } finally {
        await cleanupTmpDir(tmpDir)
    }
}

export async function POST(request: Request) {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    return handleWorker(supabase, request, body)
}

export async function GET(request: Request) {
    const supabase = await createClient()
    return handleWorker(supabase, request, {})
}

async function handleWorker(supabase: SupabaseClient, request: Request, body: Record<string, unknown>) {
    const url = new URL(request.url)
    const queryLimit = url.searchParams.get("limit")
    const queryUserId = url.searchParams.get("userId")
    const queryJobId = url.searchParams.get("jobId")

    const configuredSecret = process.env.EXPORT_WORKER_SECRET || process.env.CRON_SECRET
    const receivedSecret = request.headers.get("x-export-worker-secret")
    const authHeader = request.headers.get("authorization")
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
    const hasInternalAccess = Boolean(
        configuredSecret &&
        ((receivedSecret && receivedSecret === configuredSecret) || (bearerToken && bearerToken === configuredSecret))
    )

    const { data: { user } } = await supabase.auth.getUser()
    let effectiveUserId: string | null = user?.id ?? null
    const requestedUserId =
        (typeof body?.userId === "string" ? body.userId : null) ||
        queryUserId

    if (!effectiveUserId && hasInternalAccess && requestedUserId && requestedUserId.length > 10) effectiveUserId = requestedUserId

    if (!effectiveUserId && !hasInternalAccess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (hasInternalAccess && !hasSupabaseAdminEnv()) {
        return NextResponse.json({ error: "Export worker requires Supabase admin credentials." }, { status: 503 })
    }

    const requestedJobId =
        (typeof body?.jobId === "string" ? body.jobId : null) ||
        queryJobId
    const requestedLimit = Number(body?.limit || queryLimit || (hasInternalAccess ? 3 : 1))
    const limit = Math.max(1, Math.min(5, requestedLimit))
    const db = hasInternalAccess ? createAdminClient() : supabase

    let query = db
        .from("export_jobs")
        .select("id, user_id, project_id, profile")
        .in("status", ["queued", "processing"])
        .order("created_at", { ascending: true })
        .limit(limit)

    if (effectiveUserId) query = query.eq("user_id", effectiveUserId)

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
        const result = await processJob(db, job.user_id, job)
        results.push({ jobId: job.id, ...result })
    }

    return NextResponse.json({
        success: true,
        processed: results.filter((result) => result.ok).length,
        results,
    })
}

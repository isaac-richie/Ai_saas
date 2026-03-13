import { NextResponse } from "next/server";
import { createClient } from "@/infrastructure/supabase/server";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    const sequenceId = params.id;
    const supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        user = data.user;
    }

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: sequence, error: sequenceError } = await supabase
        .from("video_sequences")
        .select("id, project_id, scene_id, name")
        .eq("id", sequenceId)
        .single();

    if (sequenceError || !sequence) {
        return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    await supabase
        .from("video_sequences")
        .update({ status: "generating" })
        .eq("id", sequenceId);

    const { data: sequenceShots, error: shotsError } = await supabase
        .from("sequence_shots")
        .select("shot_id, order_index")
        .eq("sequence_id", sequenceId)
        .order("order_index", { ascending: true });

    if (shotsError || !sequenceShots || sequenceShots.length === 0) {
        await supabase
            .from("video_sequences")
            .update({ status: "error" })
            .eq("id", sequenceId);
        return NextResponse.json({ error: "No shots in sequence" }, { status: 400 });
    }

    const clipUrls: string[] = [];

    for (const entry of sequenceShots) {
        const { data: option } = await supabase
            .from("shot_options")
            .select("output_url, status, created_at")
            .eq("shot_id", entry.shot_id)
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        const url = option?.output_url;
        if (!url || !url.endsWith(".mp4")) {
            await supabase
                .from("video_sequences")
                .update({ status: "error" })
                .eq("id", sequenceId);
            return NextResponse.json({ error: "Missing completed video output for one or more shots" }, { status: 400 });
        }
        clipUrls.push(url);
    }

    const tmpDir = join("/tmp", `sequence-${sequenceId}`);
    await mkdir(tmpDir, { recursive: true });

    const clipPaths: string[] = [];
    for (let i = 0; i < clipUrls.length; i += 1) {
        const clipUrl = clipUrls[i];
        const res = await fetch(clipUrl);
        if (!res.ok) {
            await supabase
                .from("video_sequences")
                .update({ status: "error" })
                .eq("id", sequenceId);
            return NextResponse.json({ error: "Failed to download clip" }, { status: 500 });
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const clipPath = join(tmpDir, `clip-${i}.mp4`);
        await writeFile(clipPath, buffer);
        clipPaths.push(clipPath);
    }

    const listPath = join(tmpDir, "list.txt");
    const listContent = clipPaths.map((clip) => `file '${clip}'`).join("\n");
    await writeFile(listPath, listContent);

    const outputPath = join(tmpDir, `sequence-${sequenceId}.mp4`);

    try {
        await execFileAsync("ffmpeg", [
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", listPath,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-movflags", "+faststart",
            outputPath
        ]);
    } catch (error: unknown) {
        await supabase
            .from("video_sequences")
            .update({ status: "error" })
            .eq("id", sequenceId);
        const message = error instanceof Error ? error.message : "FFmpeg failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }

    const outputBuffer = await readFile(outputPath);
    const outputKey = `${sequence.project_id}/${sequence.scene_id}/${sequenceId}.mp4`;

    const { error: uploadError } = await supabase.storage
        .from("renders")
        .upload(outputKey, outputBuffer, {
            contentType: "video/mp4",
            upsert: true,
        });

    if (uploadError) {
        await supabase
            .from("video_sequences")
            .update({ status: "error" })
            .eq("id", sequenceId);
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
        .from("renders")
        .getPublicUrl(outputKey);

    await supabase
        .from("video_sequences")
        .update({ status: "completed", output_url: publicUrl })
        .eq("id", sequenceId);

    return NextResponse.json({ success: true, url: publicUrl });
}

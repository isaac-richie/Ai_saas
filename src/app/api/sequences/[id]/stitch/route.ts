import { NextResponse } from "next/server";
import { createClient } from "@/infrastructure/supabase/server";
import { writeFile, mkdir, readFile, rename } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    const sequenceId = params.id;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: sequence, error: sequenceError } = await supabase
        .from("video_sequences")
        .select("id, project_id, scene_id, name, finishing_settings")
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
        .select("shot_id, order_index, duration_seconds, trim_start_seconds, transition_type, transition_seconds")
        .eq("sequence_id", sequenceId)
        .order("order_index", { ascending: true });

    if (shotsError || !sequenceShots || sequenceShots.length === 0) {
        await supabase
            .from("video_sequences")
            .update({ status: "error" })
            .eq("id", sequenceId);
        return NextResponse.json({ error: "No shots in sequence" }, { status: 400 });
    }

    const clips: Array<{ url: string; duration: number | null; trimStart: number; transition: "cut" | "dissolve" | "fade"; transitionSeconds: number }> = [];

    for (const entry of sequenceShots) {
        const { data: shot } = await supabase.from("shots").select("approved_take_id").eq("id", entry.shot_id).maybeSingle();
        if (!shot?.approved_take_id) {
            await supabase.from("video_sequences").update({ status: "error" }).eq("id", sequenceId);
            return NextResponse.json({ error: "Approve one completed take for every shot before rendering" }, { status: 400 });
        }
        const { data: option } = await supabase
            .from("shot_generations")
            .select("output_url, status, created_at")
            .eq("id", shot.approved_take_id)
            .eq("shot_id", entry.shot_id)
            .eq("status", "completed")
            .maybeSingle();

        const url = option?.output_url;
        if (!url || !url.endsWith(".mp4")) {
            await supabase
                .from("video_sequences")
                .update({ status: "error" })
                .eq("id", sequenceId);
            return NextResponse.json({ error: "Missing completed video output for one or more shots" }, { status: 400 });
        }
        clips.push({
            url,
            duration: entry.duration_seconds,
            trimStart: Number(entry.trim_start_seconds || 0),
            transition: (entry.transition_type || "cut") as "cut" | "dissolve" | "fade",
            transitionSeconds: Number(entry.transition_seconds || 0),
        });
    }

    const tmpDir = join("/tmp", `sequence-${sequenceId}`);
    await mkdir(tmpDir, { recursive: true });

    const clipPaths: string[] = [];
    for (let i = 0; i < clips.length; i += 1) {
        const clipUrl = clips[i].url;
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

    const outputPath = join(tmpDir, `sequence-${sequenceId}.mp4`);

    try {
        const finishing = (sequence.finishing_settings || {}) as { color?: string; audio?: string; loudnessTarget?: number; captions?: string; captionTrackUrl?: string | null; delivery?: string };
        const needsCaptions = finishing.captions && finishing.captions !== "none";
        let captionPath: string | null = null;
        if (needsCaptions) {
            if (!finishing.captionTrackUrl) throw new Error("Caption delivery requires an attached SRT caption track.");
            const expectedHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
            const captionUrl = new URL(finishing.captionTrackUrl);
            if (!expectedHost || captionUrl.protocol !== "https:" || captionUrl.hostname !== expectedHost) throw new Error("Caption track must be stored in this project's media library.");
            const captionResponse = await fetch(captionUrl, { signal: AbortSignal.timeout(30_000) });
            if (!captionResponse.ok) throw new Error("Could not download the attached caption track.");
            const captionBuffer = Buffer.from(await captionResponse.arrayBuffer());
            if (captionBuffer.byteLength === 0 || captionBuffer.byteLength > 1024 * 1024) throw new Error("Caption track is empty or exceeds the 1 MB limit.");
            captionPath = join(tmpDir, "captions.srt");
            await writeFile(captionPath, captionBuffer);
        }
        const dimensions = finishing.delivery === "vertical-1080p" ? [1080, 1920] : finishing.delivery === "square-1080p" ? [1080, 1080] : [1920, 1080];
        const colorFilter = finishing.color === "warm-film" ? ",colorbalance=rs=.04:bs=-.03,eq=contrast=1.03:saturation=1.04" : finishing.color === "cool-noir" ? ",colorbalance=bs=.04:rs=-.02,eq=contrast=1.08:saturation=.88" : finishing.color === "high-contrast" ? ",eq=contrast=1.12:saturation=1.02" : "";
        const normalizedPaths: string[] = [];
        const effectiveDurations: number[] = [];

        for (let index = 0; index < clipPaths.length; index += 1) {
            const { stdout: durationOutput } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", clipPaths[index]]);
            const sourceDuration = Number.parseFloat(durationOutput.trim());
            if (!Number.isFinite(sourceDuration) || sourceDuration <= clips[index].trimStart) throw new Error(`Shot ${index + 1} has no usable footage after its trim point.`);
            const remaining = sourceDuration - clips[index].trimStart;
            const effectiveDuration = Math.max(0.1, Math.min(clips[index].duration || remaining, remaining));
            effectiveDurations.push(effectiveDuration);

            const { stdout: audioOutput } = await execFileAsync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", clipPaths[index]]);
            const hasAudio = Boolean(audioOutput.trim());
            const normalizedPath = join(tmpDir, `normalized-${index}.mp4`);
            const normalizeArgs = ["-y", ...(clips[index].trimStart > 0 ? ["-ss", String(clips[index].trimStart)] : []), "-i", clipPaths[index]];
            if (finishing.audio !== "mute" && !hasAudio) normalizeArgs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
            normalizeArgs.push(
                "-t", String(effectiveDuration),
                "-vf", `scale=${dimensions[0]}:${dimensions[1]}:force_original_aspect_ratio=decrease,pad=${dimensions[0]}:${dimensions[1]}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30${colorFilter}`,
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            );
            if (finishing.audio === "mute") normalizeArgs.push("-an");
            else {
                if (!hasAudio) normalizeArgs.push("-map", "0:v:0", "-map", "1:a:0", "-shortest");
                normalizeArgs.push("-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2");
                if (finishing.audio === "normalize" && hasAudio) normalizeArgs.push("-af", `loudnorm=I=${finishing.loudnessTarget || -14}:TP=-1.5:LRA=11`);
            }
            normalizeArgs.push("-movflags", "+faststart", normalizedPath);
            await execFileAsync("ffmpeg", normalizeArgs);
            normalizedPaths.push(normalizedPath);
        }

        if (normalizedPaths.length === 1) {
            await execFileAsync("ffmpeg", ["-y", "-i", normalizedPaths[0], "-c", "copy", "-movflags", "+faststart", outputPath]);
        } else {
            const inputArgs = normalizedPaths.flatMap(path => ["-i", path]);
            const filters: string[] = [];
            let videoLabel = "0:v";
            let audioLabel = "0:a";
            let timelineDuration = effectiveDurations[0];
            for (let index = 1; index < normalizedPaths.length; index += 1) {
                const requested = clips[index - 1].transition === "cut" ? 0.01 : clips[index - 1].transitionSeconds;
                const transitionDuration = Math.max(0.01, Math.min(requested || 0.5, effectiveDurations[index - 1] / 2, effectiveDurations[index] / 2));
                const offset = Math.max(0, timelineDuration - transitionDuration);
                const transitionName = clips[index - 1].transition === "fade" ? "fadeblack" : "fade";
                const nextVideo = `vx${index}`;
                filters.push(`[${videoLabel}][${index}:v]xfade=transition=${transitionName}:duration=${transitionDuration}:offset=${offset}[${nextVideo}]`);
                videoLabel = nextVideo;
                if (finishing.audio !== "mute") {
                    const nextAudio = `ax${index}`;
                    filters.push(`[${audioLabel}][${index}:a]acrossfade=d=${transitionDuration}:c1=tri:c2=tri[${nextAudio}]`);
                    audioLabel = nextAudio;
                }
                timelineDuration += effectiveDurations[index] - transitionDuration;
            }
            const composeArgs = ["-y", ...inputArgs, "-filter_complex", filters.join(";"), "-map", `[${videoLabel}]`];
            if (finishing.audio !== "mute") composeArgs.push("-map", `[${audioLabel}]`);
            composeArgs.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p");
            if (finishing.audio !== "mute") composeArgs.push("-c:a", "aac", "-b:a", "192k");
            composeArgs.push("-movflags", "+faststart", outputPath);
            await execFileAsync("ffmpeg", composeArgs);
        }
        if (finishing.captions === "burn-in" && captionPath) {
            const captionedPath = join(tmpDir, `captioned-${sequenceId}.mp4`);
            const escapedCaptionPath = captionPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
            await execFileAsync("ffmpeg", ["-y", "-i", outputPath, "-vf", `subtitles=${escapedCaptionPath}`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "copy", "-movflags", "+faststart", captionedPath]);
            await rename(captionedPath, outputPath);
        }
    } catch (error: unknown) {
        await supabase
            .from("video_sequences")
            .update({ status: "error" })
            .eq("id", sequenceId);
        const message = error instanceof Error ? error.message : "FFmpeg failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }

    const outputBuffer = await readFile(outputPath);
    const outputKey = `${user.id}/sequences/${sequence.project_id}/${sequence.scene_id}/${sequenceId}.mp4`;

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

    const savedFinishing = (sequence.finishing_settings || {}) as { captions?: string; captionTrackUrl?: string | null };
    return NextResponse.json({ success: true, url: publicUrl, approvedTakeCount: clips.length, captionTrackUrl: savedFinishing.captions === "sidecar" ? savedFinishing.captionTrackUrl || null : null });
}

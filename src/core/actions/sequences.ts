"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";
import { z } from "zod";

export type VideoSequence = Database["public"]["Tables"]["video_sequences"]["Row"];
export type SequenceShot = Database["public"]["Tables"]["sequence_shots"]["Row"];

async function ensureSession() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { supabase, error: "Unauthorized. Please sign in.", user: null };
    return { supabase, user };
}

export async function createSequence(projectId: string, sceneId: string, name: string) {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { data, error } = await supabase
        .from("video_sequences")
        .insert({
            project_id: projectId,
            scene_id: sceneId,
            name,
            status: "draft",
        })
        .select()
        .single();

    if (error) return { error: error.message };
    revalidatePath(`/dashboard/projects/${projectId}/scenes/${sceneId}`);
    return { data };
}

export async function addShotsToSequence(
    sequenceId: string,
    shots: { shot_id: string; order_index: number; duration_seconds?: number | null }[]
) {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    if (shots.length === 0) return { data: [] as SequenceShot[] };

    const { data, error } = await supabase
        .from("sequence_shots")
        .insert(shots.map((shot) => ({ sequence_id: sequenceId, ...shot })))
        .select();

    if (error) return { error: error.message };
    return { data: data || [] };
}

export async function appendShotToSequence(
    sequenceId: string,
    shotId: string,
    durationSeconds?: number | null
) {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { data: lastRow } = await supabase
        .from("sequence_shots")
        .select("order_index")
        .eq("sequence_id", sequenceId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();

    const nextIndex = (lastRow?.order_index ?? 0) + 1;

    const { data, error } = await supabase
        .from("sequence_shots")
        .insert({
            sequence_id: sequenceId,
            shot_id: shotId,
            order_index: nextIndex,
            duration_seconds: durationSeconds ?? null,
        })
        .select()
        .single();

    if (error) return { error: error.message };

    const { data: sequence } = await supabase
        .from("video_sequences")
        .select("project_id, scene_id")
        .eq("id", sequenceId)
        .single();

    if (sequence?.project_id && sequence?.scene_id) {
        revalidatePath(`/dashboard/projects/${sequence.project_id}/scenes/${sequence.scene_id}`);
    }

    return { data };
}

export async function getSequences(sceneId: string) {
    const session = await ensureSession();
    if (session.error) return { data: [] as VideoSequence[] };
    const supabase = session.supabase;

    const { data, error } = await supabase
        .from("video_sequences")
        .select("*")
        .eq("scene_id", sceneId)
        .order("created_at", { ascending: false });

    if (error) return { error: error.message };
    return { data: data || [] };
}

export async function getSequenceShots(sequenceId: string) {
    const session = await ensureSession();
    if (session.error) return { data: [] as SequenceShot[] };
    const supabase = session.supabase;

    const { data, error } = await supabase
        .from("sequence_shots")
        .select("*")
        .eq("sequence_id", sequenceId)
        .order("order_index", { ascending: true });

    if (error) return { error: error.message };
    return { data: data || [] };
}

export async function updateSequenceStatus(sequenceId: string, status: string, outputUrl?: string | null) {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { error } = await supabase
        .from("video_sequences")
        .update({ status, output_url: outputUrl ?? null })
        .eq("id", sequenceId);

    if (error) return { error: error.message };
    return { data: true };
}

export async function deleteSequence(sequenceId: string) {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { error } = await supabase.from("video_sequences").delete().eq("id", sequenceId);
    if (error) return { error: error.message };
    return { data: true };
}

export async function moveSequenceShot(sequenceId: string, sequenceShotId: string, direction: "up" | "down") {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { data: shots, error } = await supabase
        .from("sequence_shots")
        .select("id, order_index")
        .eq("sequence_id", sequenceId)
        .order("order_index", { ascending: true });

    if (error) return { error: error.message };

    const currentIndex = (shots || []).findIndex((row) => row.id === sequenceShotId);
    if (currentIndex < 0) return { error: "Sequence shot not found" };

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= (shots || []).length) return { data: true };

    const current = shots![currentIndex];
    const target = shots![targetIndex];

    const { error: updateError1 } = await supabase
        .from("sequence_shots")
        .update({ order_index: target.order_index })
        .eq("id", current.id);

    const { error: updateError2 } = await supabase
        .from("sequence_shots")
        .update({ order_index: current.order_index })
        .eq("id", target.id);

    if (updateError1 || updateError2) {
        return { error: updateError1?.message || updateError2?.message || "Failed to reorder" };
    }

    const { data: sequence } = await supabase
        .from("video_sequences")
        .select("project_id, scene_id")
        .eq("id", sequenceId)
        .single();

    if (sequence?.project_id && sequence?.scene_id) {
        revalidatePath(`/dashboard/projects/${sequence.project_id}/scenes/${sequence.scene_id}`);
        revalidatePath(`/dashboard/sequences/${sequenceId}`);
    }

    return { data: true };
}

const sequenceShotEditSchema = z.object({
    sequenceShotId: z.string().uuid(),
    durationSeconds: z.number().positive().max(60),
    trimStartSeconds: z.number().min(0).max(60),
    transitionType: z.enum(["cut", "dissolve", "fade"]),
    transitionSeconds: z.number().min(0).max(2),
}).superRefine((value, context) => {
    if (value.transitionType !== "cut" && value.transitionSeconds <= 0) {
        context.addIssue({ code: "custom", message: "Choose a transition duration." });
    }
});

const sequenceShotDurationSchema = z.object({
    sequenceShotId: z.string().uuid(),
    durationSeconds: z.number().positive().max(60),
});

export async function updateSequenceShotEdit(input: unknown) {
    const parsed = sequenceShotEditSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the shot edit." };
    const session = await ensureSession();
    if (session.error || !session.user) return { error: session.error || "Unauthorized" };
    const supabase = session.supabase;

    const { sequenceShotId, durationSeconds, trimStartSeconds, transitionType } = parsed.data;
    const transitionSeconds = transitionType === "cut" ? 0 : parsed.data.transitionSeconds;

    const { data, error } = await supabase
        .from("sequence_shots")
        .update({
            duration_seconds: durationSeconds,
            trim_start_seconds: trimStartSeconds,
            transition_type: transitionType,
            transition_seconds: transitionSeconds,
        })
        .eq("id", sequenceShotId)
        .select("sequence_id")
        .single();

    if (error) return { error: error.message };

    if (data?.sequence_id) {
        revalidatePath(`/dashboard/sequences/${data.sequence_id}`);
    }

    return { data: true };
}

export async function updateSequenceShotDuration(sequenceShotId: string, durationSeconds: number) {
    const parsed = sequenceShotDurationSchema.safeParse({ sequenceShotId, durationSeconds });
    if (!parsed.success) return { error: "Choose a valid shot and duration." };
    const session = await ensureSession();
    if (session.error || !session.user) return { error: session.error || "Unauthorized" };
    const { data, error } = await session.supabase.from("sequence_shots")
        .update({ duration_seconds: parsed.data.durationSeconds })
        .eq("id", parsed.data.sequenceShotId).select("sequence_id").single();
    if (error) return { error: error.message };
    revalidatePath(`/dashboard/sequences/${data.sequence_id}`);
    return { data: true };
}

export async function removeSequenceShot(sequenceShotId: string) {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { data: existing } = await supabase
        .from("sequence_shots")
        .select("sequence_id")
        .eq("id", sequenceShotId)
        .single();

    const { error } = await supabase.from("sequence_shots").delete().eq("id", sequenceShotId);
    if (error) return { error: error.message };

    if (existing?.sequence_id) {
        revalidatePath(`/dashboard/sequences/${existing.sequence_id}`);
    }

    return { data: true };
}

const finishingSchema = z.object({
    sequenceId: z.string().uuid(),
    color: z.enum(["cinematic-neutral", "warm-film", "cool-noir", "high-contrast"]),
    audio: z.enum(["preserve", "normalize", "mute"]),
    loudnessTarget: z.number().min(-24).max(-9),
    captions: z.enum(["none", "burn-in", "sidecar"]),
    captionTrackUrl: z.string().url().max(2000).nullable().optional(),
    delivery: z.enum(["1080p", "vertical-1080p", "square-1080p"]),
});

export async function updateSequenceFinishing(input: unknown) {
    const parsed = finishingSchema.safeParse(input);
    if (!parsed.success) return { error: "Check the finishing settings." };
    const session = await ensureSession();
    if (session.error || !session.user) return { error: session.error || "Unauthorized" };
    const { sequenceId, ...settings } = parsed.data;
    if (settings.captions !== "none" && !settings.captionTrackUrl) return { error: "Attach an SRT caption track before selecting a caption delivery mode." };
    const { data: sequence } = await session.supabase.from("video_sequences").select("id,project_id,projects!inner(user_id),edit_version").eq("id", sequenceId).eq("projects.user_id", session.user.id).maybeSingle();
    if (!sequence) return { error: "Sequence not found." };
    const { error } = await session.supabase.from("video_sequences").update({ finishing_settings: settings, edit_version: (sequence.edit_version || 1) + 1 }).eq("id", sequenceId);
    if (error) return { error: "Apply migration 0023 to save finishing settings." };
    revalidatePath(`/dashboard/sequences/${sequenceId}`);
    return { data: { settings, version: (sequence.edit_version || 1) + 1 } };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";

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

export async function updateSequenceShotDuration(sequenceShotId: string, durationSeconds: number) {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { data, error } = await supabase
        .from("sequence_shots")
        .update({ duration_seconds: durationSeconds })
        .eq("id", sequenceShotId)
        .select("sequence_id")
        .single();

    if (error) return { error: error.message };

    if (data?.sequence_id) {
        revalidatePath(`/dashboard/sequences/${data.sequence_id}`);
    }

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

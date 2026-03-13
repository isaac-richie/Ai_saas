"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";

export type VideoSequence = Database["public"]["Tables"]["video_sequences"]["Row"];
export type SequenceShot = Database["public"]["Tables"]["sequence_shots"]["Row"];

async function ensureSession() {
    const supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) return { supabase, error: error.message, user: null };
        user = data.user;
    }
    if (!user) return { supabase, error: "No active session", user: null };
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

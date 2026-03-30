"use server";

import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";

export type ShotReference = Database["public"]["Tables"]["shot_references"]["Row"];

async function ensureSession() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { supabase, error: "Unauthorized. Please sign in.", user: null };
    return { supabase, user };
}

export async function addShotReference(shotId: string, url: string, type: string = "image") {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { data, error } = await supabase
        .from("shot_references")
        .insert({
            shot_id: shotId,
            url,
            type,
        })
        .select()
        .single();

    if (error) return { error: error.message };
    return { data };
}

export async function getShotReferences(shotId: string) {
    const session = await ensureSession();
    if (session.error) return { data: [] as ShotReference[] };
    const supabase = session.supabase;

    const { data, error } = await supabase
        .from("shot_references")
        .select("*")
        .eq("shot_id", shotId)
        .order("created_at", { ascending: false });

    if (error) return { error: error.message };
    return { data: data || [] };
}

export async function deleteShotReference(id: string) {
    const session = await ensureSession();
    if (session.error) return { error: session.error };
    const supabase = session.supabase;

    const { error } = await supabase.from("shot_references").delete().eq("id", id);
    if (error) return { error: error.message };
    return { success: true };
}

"use server";

import { createClient } from "@/infrastructure/supabase/server";
import { revalidatePath } from "next/cache";
import { Database } from "@/core/types/db";

export type ShotPreset = Database["public"]["Tables"]["shot_presets"]["Row"];

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

export async function createPreset(name: string, description: string | null, data: Record<string, unknown>) {
    const session = await ensureSession();
    if (session.error || !session.user) return { error: session.error || "No active session" };
    const supabase = session.supabase;
    const user = session.user;

    const { data: preset, error } = await supabase
        .from("shot_presets")
        .insert({
            user_id: user.id,
            name,
            description: description || null,
            data // JSON of camera, lens, shot_type, etc.
        })
        .select()
        .single();

    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    return { data: preset };
}

export async function getPresets() {
    const session = await ensureSession();
    if (session.error || !session.user) return { data: [] };
    const supabase = session.supabase;
    const user = session.user;

    const { data, error } = await supabase
        .from("shot_presets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) return { error: error.message };
    return { data: data || [] };
}

export async function deletePreset(id: string) {
    const session = await ensureSession();
    if (session.error || !session.user) return { error: session.error || "No active session" };
    const supabase = session.supabase;

    const { error } = await supabase.from("shot_presets").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return { success: true };
}

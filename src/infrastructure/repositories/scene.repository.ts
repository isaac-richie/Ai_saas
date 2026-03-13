import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";

type Scene = Database["public"]["Tables"]["scenes"]["Row"];
type NewScene = Database["public"]["Tables"]["scenes"]["Insert"];
type SceneUpdate = Database["public"]["Tables"]["scenes"]["Update"];

export const getScenesByProjectId = async (projectId: string): Promise<Scene[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("scenes")
        .select(`
            *,
            shots:shots(count)
        `)
        .eq("project_id", projectId)
        .order("sequence_order", { ascending: true });

    if (error) throw new Error(error.message);
    return data;
};

export const createScene = async (scene: NewScene): Promise<Scene> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("scenes")
        .insert(scene)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const getSceneById = async (id: string): Promise<Scene | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("scenes")
        .select("*")
        .eq("id", id)
        .single();

    if (error) return null;
    return data;
};

export const updateScene = async (id: string, updates: SceneUpdate): Promise<Scene> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("scenes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const deleteScene = async (id: string): Promise<void> => {
    const supabase = await createClient();
    const { error } = await supabase.from("scenes").delete().eq("id", id);
    if (error) throw new Error(error.message);
};

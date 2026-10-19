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

type CoverTake = { status: string; output_url: string | null; thumbnail_url: string | null; first_frame_url: string | null; created_at: string };

/** One still per scene for its card: the newest finished take's image (a video's thumbnail or first frame). */
export const getSceneCovers = async (sceneIds: string[]): Promise<Record<string, string>> => {
    if (!sceneIds.length) return {};
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("shots")
        .select("scene_id, options:shot_generations!shot_generations_shot_id_fkey(status, output_url, thumbnail_url, first_frame_url, created_at)")
        .in("scene_id", sceneIds);
    if (error || !data) return {};
    const best: Record<string, { url: string; at: string }> = {};
    for (const shot of data as unknown as { scene_id: string; options: CoverTake[] | null }[]) {
        for (const take of shot.options ?? []) {
            if (take.status !== "completed" && take.status !== "approved") continue;
            const isVideo = /\.mp4($|\?)/i.test(take.output_url || "");
            const url = take.thumbnail_url || (isVideo ? take.first_frame_url : take.output_url);
            if (!url || !/^https?:\/\//.test(url)) continue;
            if (!best[shot.scene_id] || take.created_at > best[shot.scene_id].at) best[shot.scene_id] = { url, at: take.created_at };
        }
    }
    return Object.fromEntries(Object.entries(best).map(([id, cover]) => [id, cover.url]));
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

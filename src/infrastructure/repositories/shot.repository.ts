import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";

export type ShotWithDetails = Database["public"]["Tables"]["shots"]["Row"] & {
    camera: { name: string } | null;
    lens: { name: string } | null;
    options?: ShotOption[];
};

type ShotOption = Database["public"]["Tables"]["shot_options"]["Row"];

type NewShot = Database["public"]["Tables"]["shots"]["Insert"];

export const getShotsBySceneId = async (sceneId: string): Promise<ShotWithDetails[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("shots")
        .select(`
            *,
            camera:cameras(name),
            lens:lenses(name),
            options:shot_options(*)
        `)
        .eq("scene_id", sceneId)
        .order("sequence_order", { ascending: true });

    if (error) throw new Error(error.message);
    // Cast to expected type because Supabase types for joins can be tricky to infer perfectly automatically
    return data as ShotWithDetails[];
};

export const getShotById = async (id: string): Promise<ShotWithDetails | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("shots")
        .select(`
            *,
            camera:cameras(name),
            lens:lenses(name)
        `)
        .eq("id", id)
        .single();

    if (error) return null;
    return data as ShotWithDetails;
};

export const createShot = async (shot: NewShot): Promise<Database["public"]["Tables"]["shots"]["Row"]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("shots")
        .insert(shot)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const getNextSequenceOrder = async (sceneId: string): Promise<number> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("shots")
        .select("sequence_order")
        .eq("scene_id", sceneId)
        .order("sequence_order", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return 1;
    const current = data?.sequence_order ?? 0;
    return current + 1;
};

export const updateShot = async (id: string, updates: Partial<Database["public"]["Tables"]["shots"]["Update"]>): Promise<void> => {
    const supabase = await createClient();
    const { error } = await supabase
        .from("shots")
        .update(updates)
        .eq("id", id);

    if (error) throw new Error(error.message);
}

export const deleteShot = async (id: string): Promise<void> => {
    const supabase = await createClient();
    const { error } = await supabase.from("shots").delete().eq("id", id);
    if (error) throw new Error(error.message);
};

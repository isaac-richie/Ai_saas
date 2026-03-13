import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type NewProject = Database["public"]["Tables"]["projects"]["Insert"];

export const getProjects = async (userId: string): Promise<Project[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data;
};

export const getProjectById = async (id: string): Promise<Project | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

    if (error) return null;
    return data;
};

export const createProject = async (project: NewProject): Promise<Project> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("projects")
        .insert(project)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const updateProject = async (id: string, updates: Partial<Project>): Promise<Project> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

export const deleteProject = async (id: string): Promise<void> => {
    const supabase = await createClient();
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
};

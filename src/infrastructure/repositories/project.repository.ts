import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ProjectWithStats = Project & {
    scene_count: number;
    shot_count: number;
    thumbnail_url?: string | null;
};
type NewProject = Database["public"]["Tables"]["projects"]["Insert"];

export const getProjects = async (userId: string): Promise<ProjectWithStats[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("projects")
        .select(`
            *,
            scenes:scenes(
                id,
                shots:shots(count)
            )
        `)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);
    const { data: previewRows, error: previewError } = await supabase
        .from("shot_generations")
        .select(`
            output_url,
            created_at,
            shots!inner(
                scene_id,
                scenes!inner(project_id)
            )
        `)
        .not("output_url", "is", null)
        .order("created_at", { ascending: false });

    if (previewError) {
        // Non-blocking: project list should still render even if thumbnail preview query fails.
        console.error("Project thumbnail preview query failed:", previewError.message);
    }

    const thumbnailByProject = new Map<string, string>();
    ((previewRows as unknown[]) || []).forEach((row) => {
        const record = row as {
            output_url?: string | null;
            shots?: { scenes?: { project_id?: string | null } | null } | null;
        };
        const projectId = record.shots?.scenes?.project_id ?? null;
        const url = record.output_url ?? null;
        if (!projectId || !url) return;
        if (!thumbnailByProject.has(projectId)) {
            thumbnailByProject.set(projectId, url);
        }
    });

    return (data || []).map((project) => {
        const scenes = (project as { scenes?: { shots?: { count: number }[] }[] }).scenes || [];
        const scene_count = scenes.length;
        const shot_count = scenes.reduce((total, scene) => total + (scene.shots?.[0]?.count ?? 0), 0);
        const { scenes: _scenes, ...rest } = project as Project & { scenes?: unknown };
        void _scenes;
        return {
            ...rest,
            scene_count,
            shot_count,
            thumbnail_url: thumbnailByProject.get(project.id) ?? null,
        };
    });
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

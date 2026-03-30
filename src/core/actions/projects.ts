"use server";

import * as ProjectRepo from "@/infrastructure/repositories/project.repository";
import { createClient } from "@/infrastructure/supabase/server";
import { revalidatePath } from "next/cache";
import { Database } from "@/core/types/db";
import { createProjectSchema } from "@/core/validation/schemas";
import { canCreateProject } from "@/core/services/billing";

export type Project = Database["public"]["Tables"]["projects"]["Row"] & {
    scene_count?: number;
    shot_count?: number;
    thumbnail_url?: string | null;
};

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unexpected error";
}

export async function createProject(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized. Please sign in." };
    }

    const projectLimit = await canCreateProject(supabase, user.id);
    if (!projectLimit.allowed) {
        return { error: projectLimit.message };
    }

    const rawData = {
        name: formData.get("name"),
        description: formData.get("description"),
    };

    const validationResult = createProjectSchema.safeParse(rawData);

    if (!validationResult.success) {
        return { error: validationResult.error.issues[0].message };
    }

    const { name, description } = validationResult.data;

    try {
        const project = await ProjectRepo.createProject({
            name,
            description: description || null, // handle optional explicitly if needed by types, though zod optional -> undefined
            user_id: user.id,
            status: "active"
        });

        revalidatePath("/dashboard");
        revalidatePath("/dashboard/projects");
        return { data: project };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function getProjects() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { data: [] };

    try {
        const projects = await ProjectRepo.getProjects(user.id);
        return { data: projects };
    } catch (e: unknown) {
        console.error("Error fetching projects:", e);
        return { error: getErrorMessage(e) };
    }
}

export async function getProjectById(id: string) {
    // Note: Repository handles fetching, but we might want to check ownership here or rely on RLS.
    // Given the repository is generic, RLS at the supabase client level (in repo) should handle security.
    // However, the repo creates a fresh client. The repo should probably accept a client or we rely on the
    // fact that createClient() gets cookies.
    // Yes, createClient() in repo uses cookies() so RLS is applied for the current user.
    try {
        const project = await ProjectRepo.getProjectById(id);
        if (!project) return { error: "Project not found" };
        return { data: project };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

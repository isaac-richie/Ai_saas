"use server";

import { revalidatePath } from "next/cache";
import * as SceneRepo from "@/infrastructure/repositories/scene.repository";
import { createSceneSchema } from "@/core/validation/schemas";
import { Database } from "@/core/types/db";
import { z } from "zod";

export type Scene = Database["public"]["Tables"]["scenes"]["Row"];

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Unexpected error";
}

export async function createScene(projectId: string, formData: FormData) {
    const rawData = {
        name: formData.get("name"),
        description: formData.get("description"),
        sequence_order: parseInt(formData.get("sequence_order") as string) || 1,
    };

    const validationResult = createSceneSchema.safeParse(rawData);

    if (!validationResult.success) {
        return { error: validationResult.error.issues[0].message };
    }

    const { name, description, sequence_order } = validationResult.data;

    try {
        const scene = await SceneRepo.createScene({
            project_id: projectId,
            name,
            description,
            sequence_order,
        });

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { data: scene };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function renameScene(projectId: string, sceneId: string, name: string) {
    const parsed = z.string().min(2, "Scene name is too short").max(120, "Scene name is too long").safeParse(name);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    try {
        const updated = await SceneRepo.updateScene(sceneId, { name: parsed.data.trim() });
        revalidatePath(`/dashboard/projects/${projectId}`);
        return { data: updated };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function deleteScene(projectId: string, sceneId: string) {
    try {
        await SceneRepo.deleteScene(sceneId);
        revalidatePath(`/dashboard/projects/${projectId}`);
        return { data: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function moveScene(projectId: string, sceneId: string, direction: "up" | "down") {
    try {
        const scenes = await SceneRepo.getScenesByProjectId(projectId);
        const currentIndex = scenes.findIndex((scene) => scene.id === sceneId);
        if (currentIndex < 0) return { error: "Scene not found" };

        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= scenes.length) return { data: true };

        const current = scenes[currentIndex];
        const target = scenes[targetIndex];

        await SceneRepo.updateScene(current.id, { sequence_order: target.sequence_order });
        await SceneRepo.updateScene(target.id, { sequence_order: current.sequence_order });

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { data: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function getScenes(projectId: string) {
    try {
        const scenes = await SceneRepo.getScenesByProjectId(projectId);
        return { data: scenes };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

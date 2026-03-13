"use server";

import * as ShotRepo from "@/infrastructure/repositories/shot.repository";
import { revalidatePath } from "next/cache";
import { createShotSchema } from "@/core/validation/schemas";
import { createClient } from "@/infrastructure/supabase/server";
import { Database } from "@/core/types/db";

export type Shot = Database["public"]["Tables"]["shots"]["Row"];
export type NewShot = Database["public"]["Tables"]["shots"]["Insert"];

export async function createShot(sceneId: string, formData: FormData) {
    const supabase = await createClient();

    const rawData = {
        name: formData.get("name"),
        description: formData.get("description"),
        shot_type: formData.get("shot_type"),
        camera_movement: formData.get("camera_movement"),
        estimated_duration: parseInt(formData.get("estimated_duration") as string) || 0,
        camera_id: formData.get("camera_id") || null,
        lens_id: formData.get("lens_id") || null,
    };

    const validationResult = createShotSchema.safeParse(rawData);

    if (!validationResult.success) {
        return { error: validationResult.error.issues[0].message };
    }

    const data = validationResult.data;

    try {
        const nextSequence = await ShotRepo.getNextSequenceOrder(sceneId);
        const shot = await ShotRepo.createShot({
            scene_id: sceneId,
            name: data.name,
            description: data.description || null,
            shot_type: data.shot_type || null,
            camera_movement: data.camera_movement || null,
            estimated_duration: data.estimated_duration,
            camera_id: data.camera_id || null,
            lens_id: data.lens_id || null,
            sequence_order: nextSequence
        });

        const { data: scene } = await supabase
            .from("scenes")
            .select("id, project_id")
            .eq("id", sceneId)
            .single();

        if (scene?.project_id) {
            revalidatePath(`/dashboard/projects/${scene.project_id}/scenes/${scene.id}`);
            revalidatePath(`/dashboard/projects/${scene.project_id}`);
        }

        return { data: shot };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create shot";
        return { error: message };
    }
}

export async function updateShotStatus(shotId: string, optionId: string, status: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { error: updateError } = await supabase
        .from("shot_options")
        .update({ status: status })
        .eq("id", optionId)
        .eq("shot_id", shotId); // Extra check for safety

    if (updateError) {
        return { error: updateError.message };
    }

    const { data: shot } = await supabase
        .from("shots")
        .select("scene_id")
        .eq("id", shotId)
        .single();

    if (shot?.scene_id) {
        const { data: scene } = await supabase
            .from("scenes")
            .select("project_id")
            .eq("id", shot.scene_id)
            .single();

        if (scene?.project_id) {
            revalidatePath(`/dashboard/projects/${scene.project_id}/scenes/${shot.scene_id}`);
        }
    }

    return { success: true };
}

export async function getShots(sceneId: string) {
    try {
        const shots = await ShotRepo.getShotsBySceneId(sceneId);
        return { data: shots };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch shots";
        return { error: message };
    }
}

export async function removeShot(shotId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    try {
        const { data: shot } = await supabase
            .from("shots")
            .select("scene_id")
            .eq("id", shotId)
            .single();

        await ShotRepo.deleteShot(shotId);

        if (shot?.scene_id) {
            const { data: scene } = await supabase
                .from("scenes")
                .select("id, project_id")
                .eq("id", shot.scene_id)
                .single();

            if (scene?.project_id) {
                revalidatePath(`/dashboard/projects/${scene.project_id}/scenes/${scene.id}`);
                revalidatePath(`/dashboard/projects/${scene.project_id}`);
            }
        }

        return { success: true };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete shot";
        return { error: message };
    }
}

export async function getCinematicGear() {
    const supabase = await createClient();

    const { data: cameras } = await supabase
        .from("cameras")
        .select("*")
        .is("project_id", null);

    const { data: lenses } = await supabase
        .from("lenses")
        .select("*")
        .is("project_id", null);

    return { cameras: cameras || [], lenses: lenses || [] };
}

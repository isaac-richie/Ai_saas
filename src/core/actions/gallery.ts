"use server";

import { createClient } from "@/infrastructure/supabase/server";
import { MediaAsset } from "@/interface/components/media/MediaGallery";
import { pollShotStatus } from "@/core/actions/generation";
import { revalidatePath } from "next/cache";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

export type GalleryAsset = MediaAsset & {
    projectId: string;
    projectName: string;
    sceneId: string;
    sceneName: string;
    createdAt: string;
};

async function resolveGalleryUser() {
    const supabase = await createClient();
    const {
        data: { user: existingUser },
    } = await supabase.auth.getUser();

    if (existingUser) return { supabase, user: existingUser, error: null as string | null };
    return {
        supabase,
        user: null,
        error: "Unauthorized. Please sign in.",
    };
}

export async function deleteGalleryAsset(optionId: string) {
    return deleteGalleryAssets([optionId]);
}

export async function deleteGalleryAssets(optionIds: string[]) {
    const { supabase, user, error: sessionError } = await resolveGalleryUser();
    if (!user) return { error: sessionError || "Unauthorized" };

    const ids = Array.from(new Set(optionIds.filter(Boolean)));
    if (ids.length === 0) return { error: "No assets selected" };

    const { error } = await supabase.from("shot_generations").delete().in("id", ids);
    if (error) return { error: error.message };
    revalidatePath("/dashboard/gallery");
    return { success: true, data: { deletedCount: ids.length } };
}

export async function moveGalleryAssetsToProject(optionIds: string[], targetProjectId: string) {
    const { supabase, user, error: sessionError } = await resolveGalleryUser();
    if (!user) return { error: sessionError || "Unauthorized" };

    const dedupedIds = Array.from(new Set(optionIds.filter(Boolean)));
    if (dedupedIds.length === 0) return { error: "No assets selected" };

    const { data: targetProject, error: projectError } = await supabase
        .from("projects")
        .select("id, user_id")
        .eq("id", targetProjectId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (projectError || !targetProject?.id) {
        return { error: "Target project not found" };
    }

    const { data: options, error: optionsError } = await supabase
        .from("shot_generations")
        .select("id, shot_id, prompt, status, output_url, parameters, negative_prompt, seed, cfg_scale, steps, model_version, provider_id")
        .in("id", dedupedIds);

    if (optionsError || !options || options.length === 0) {
        return { error: optionsError?.message || "No assets found to move" };
    }

    const shotIds = Array.from(new Set(options.map((opt) => opt.shot_id).filter(Boolean)));
    const { data: sourceShots, error: shotsError } = await supabase
        .from("shots")
        .select("id, scene_id, name, description, shot_type, camera_movement, estimated_duration, generation_settings, prompt_text, selection_payload")
        .in("id", shotIds);

    if (shotsError || !sourceShots) {
        return { error: shotsError?.message || "Unable to read source shots" };
    }

    const sceneIds = Array.from(new Set(sourceShots.map((shot) => shot.scene_id).filter(Boolean)));
    const { data: sourceScenes, error: scenesError } = await supabase
        .from("scenes")
        .select("id, project_id")
        .in("id", sceneIds);

    if (scenesError || !sourceScenes) {
        return { error: scenesError?.message || "Unable to read source scenes" };
    }

    const sourceProjectIds = Array.from(new Set(sourceScenes.map((scene) => scene.project_id).filter(Boolean)));
    const { data: ownedProjects, error: ownedError } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .in("id", sourceProjectIds);

    if (ownedError || !ownedProjects) {
        return { error: ownedError?.message || "Unable to verify ownership" };
    }

    const ownedProjectSet = new Set(ownedProjects.map((project) => project.id));
    const sceneProjectMap = new Map(sourceScenes.map((scene) => [scene.id, scene.project_id]));
    const shotMap = new Map(sourceShots.map((shot) => [shot.id, shot]));

    const unauthorized = sourceShots.some((shot) => {
        const projectId = sceneProjectMap.get(shot.scene_id);
        return !projectId || !ownedProjectSet.has(projectId);
    });
    if (unauthorized) return { error: "One or more selected assets are not owned by this user" };

    const { data: targetScenes } = await supabase
        .from("scenes")
        .select("id, sequence_order")
        .eq("project_id", targetProjectId)
        .order("sequence_order", { ascending: true });

    let targetSceneId = targetScenes?.[0]?.id || null;

    if (!targetSceneId) {
        const { data: createdScene, error: createSceneError } = await supabase
            .from("scenes")
            .insert({
                project_id: targetProjectId,
                name: "Imported Assets",
                description: "Assets moved from gallery",
                sequence_order: 1,
            })
            .select("id")
            .single();

        if (createSceneError || !createdScene?.id) {
            return { error: createSceneError?.message || "Could not create destination scene" };
        }
        targetSceneId = createdScene.id;
    }

    const { data: latestSequence } = await supabase
        .from("shots")
        .select("sequence_order")
        .eq("scene_id", targetSceneId)
        .order("sequence_order", { ascending: false })
        .limit(1)
        .maybeSingle();

    let sequenceOrder = (latestSequence?.sequence_order ?? 0) + 1;
    let movedCount = 0;

    for (const option of options) {
        const sourceShot = shotMap.get(option.shot_id);
        if (!sourceShot) continue;

        const { data: createdShot, error: createShotError } = await supabase
            .from("shots")
            .insert({
                scene_id: targetSceneId,
                name: `${sourceShot.name} (Moved)`,
                description: sourceShot.description,
                shot_type: sourceShot.shot_type,
                camera_movement: sourceShot.camera_movement,
                estimated_duration: sourceShot.estimated_duration,
                generation_settings: sourceShot.generation_settings,
                prompt_text: sourceShot.prompt_text,
                selection_payload: sourceShot.selection_payload,
                sequence_order: sequenceOrder++,
            })
            .select("id")
            .single();

        if (createShotError || !createdShot?.id) {
            continue;
        }

        const { error: insertGenerationError } = await supabase
            .from("shot_generations")
            .insert({
                shot_id: createdShot.id,
                prompt: option.prompt,
                status: option.status,
                output_url: option.output_url,
                parameters: option.parameters,
                negative_prompt: option.negative_prompt,
                seed: option.seed,
                cfg_scale: option.cfg_scale,
                steps: option.steps,
                model_version: option.model_version,
                provider_id: option.provider_id,
            });

        if (!insertGenerationError) {
            movedCount += 1;
        }
    }

    revalidatePath(`/dashboard/projects/${targetProjectId}`);
    revalidatePath("/dashboard/gallery");

    return { data: { movedCount, targetProjectId } };
}

export async function getGalleryAssets(projectId?: string) {
    const { supabase, user } = await resolveGalleryUser();
    if (!user) return { data: [] as GalleryAsset[] };

    let query = supabase
        .from("shot_generations")
        .select(`
            id,
            prompt,
            status,
            output_url,
            created_at,
            parameters,
            shots!inner (
                id,
                name,
                shot_type,
                scene_id,
                scenes!inner (
                    id,
                    name,
                    project_id,
                    projects!inner (
                        id,
                        name,
                        user_id
                    )
                )
            )
        `)
        .eq("shots.scenes.projects.user_id", user.id);

    if (projectId) {
        query = query.eq("shots.scenes.project_id", projectId);
    }

    const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(1200);
    if (error) return { error: error.message };

    const assets: GalleryAsset[] = [];
    const rows = Array.isArray(data) ? data : [];

    const pendingRows: Array<{
        id: string;
        outputUrl: string | null;
    }> = [];

    for (const row of rows) {
        if (!isRecord(row)) continue;

        const id = getString(row.id);
        const status = getString(row.status);
        const outputUrl = getString(row.output_url);
        const parameters = isRecord(row.parameters) ? row.parameters : null;
        const shot = isRecord(row.shots) ? row.shots : null;
        const scene = shot && isRecord(shot.scenes) ? shot.scenes : null;
        const project = scene && isRecord(scene.projects) ? scene.projects : null;

        if (!id || !shot || !scene || !project) continue;

        const isPending = status === "processing" || status === "pending" || outputUrl === "pending_generation";
        if (isPending) {
            pendingRows.push({ id, outputUrl });
            continue;
        }

        if (!outputUrl || outputUrl === "pending_generation") continue;
        if (!/^https?:\/\//i.test(outputUrl) && !outputUrl.startsWith("/storage/")) continue;

        const paramOutputType = getString(parameters?.output_type);
        const isVideo =
            paramOutputType === "video"
            || outputUrl.includes(".mp4")
            || outputUrl.includes(".webm")
            || outputUrl.includes("tempfile.aiquickdraw.com/p/");

        assets.push({
            id,
            url: outputUrl,
            type: isVideo ? "video" : "image",
            prompt: getString(row.prompt) ?? "",
            shotName: getString(shot.name) ?? "Untitled Shot",
            shotType: getString(shot.shot_type) ?? undefined,
            shotId: getString(shot.id) ?? undefined,
            projectId: getString(project.id) ?? "",
            projectName: getString(project.name) ?? "Untitled Project",
            sceneId: getString(scene.id) ?? "",
            sceneName: getString(scene.name) ?? "Untitled Scene",
            createdAt: getString(row.created_at) ?? "",
        });
    }

    if (pendingRows.length > 0) {
        const MAX_POLLS = 12;
        const polled = await Promise.allSettled(
            pendingRows.slice(0, MAX_POLLS).map(async (pending) => {
                const pollResult = await pollShotStatus(pending.id);
                return {
                    id: pending.id,
                    url: pollResult.data?.url || pending.outputUrl,
                    status: pollResult.data?.status || null,
                    error: pollResult.error || null,
                };
            })
        );

        const resolvedMap = new Map<string, { url: string | null; status: string | null; error: string | null }>();
        for (const item of polled) {
            if (item.status === "fulfilled") {
                resolvedMap.set(item.value.id, {
                    url: item.value.url,
                    status: item.value.status,
                    error: item.value.error,
                });
            }
        }

        for (const row of rows) {
            if (!isRecord(row)) continue;
            const id = getString(row.id);
            if (!id || !resolvedMap.has(id)) continue;

            const shot = isRecord(row.shots) ? row.shots : null;
            const scene = shot && isRecord(shot.scenes) ? shot.scenes : null;
            const project = scene && isRecord(scene.projects) ? scene.projects : null;
            if (!shot || !scene || !project) continue;

            const parameters = isRecord(row.parameters) ? row.parameters : null;
            const resolved = resolvedMap.get(id);
            const outputUrl = resolved?.url || null;
            if (!outputUrl || outputUrl === "pending_generation") continue;
            if (!/^https?:\/\//i.test(outputUrl) && !outputUrl.startsWith("/storage/")) continue;

            const paramOutputType = getString(parameters?.output_type);
            const isVideo =
                paramOutputType === "video"
                || outputUrl.includes(".mp4")
                || outputUrl.includes(".webm")
                || outputUrl.includes("tempfile.aiquickdraw.com/p/");

            assets.push({
                id,
                url: outputUrl,
                type: isVideo ? "video" : "image",
                prompt: getString(row.prompt) ?? "",
                shotName: getString(shot.name) ?? "Untitled Shot",
                shotType: getString(shot.shot_type) ?? undefined,
                shotId: getString(shot.id) ?? undefined,
                projectId: getString(project.id) ?? "",
                projectName: getString(project.name) ?? "Untitled Project",
                sceneId: getString(scene.id) ?? "",
                sceneName: getString(scene.name) ?? "Untitled Scene",
                createdAt: getString(row.created_at) ?? "",
            });
        }
    }

    const deduped = Array.from(
        new Map(assets.map((asset) => [asset.id, asset])).values()
    );
    deduped.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { data: deduped };
}

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

export async function deleteGalleryAsset(optionId: string) {
    const supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const { data } = await supabase.auth.signInAnonymously();
        user = data.user;
    }

    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase.from("shot_generations").delete().eq("id", optionId);
    if (error) return { error: error.message };
    return { success: true };
}

export async function moveGalleryAssetsToProject(optionIds: string[], targetProjectId: string) {
    const supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const { data } = await supabase.auth.signInAnonymously();
        user = data.user;
    }

    if (!user) return { error: "Unauthorized" };

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
    const supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        const { data } = await supabase.auth.signInAnonymously();
        user = data.user;
    }

    if (!user) return { data: [] as GalleryAsset[] };

    let query = supabase
        .from("projects")
        .select(`
            id,
            name,
            scenes (
                id,
                name,
                shots (
                    id,
                    name,
                    shot_type,
                    lens:lenses(name),
                    shot_generations (
                        id,
                        prompt,
                        status,
                        output_url,
                        created_at
                    )
                )
            )
        `)
        .eq("user_id", user.id);

    if (projectId) {
        query = query.eq("id", projectId);
    }

    const { data, error } = await query;
    if (error) return { error: error.message };

    const assets: GalleryAsset[] = [];
    const projects = Array.isArray(data) ? data : [];

    for (const projectRow of projects) {
        if (!isRecord(projectRow)) continue;

        const currentProjectId = getString(projectRow.id);
        const currentProjectName = getString(projectRow.name) ?? "Untitled Project";
        if (!currentProjectId) continue;

        const scenes = Array.isArray(projectRow.scenes) ? projectRow.scenes : [];
        for (const sceneRow of scenes) {
            if (!isRecord(sceneRow)) continue;

            const currentSceneId = getString(sceneRow.id);
            const currentSceneName = getString(sceneRow.name) ?? "Untitled Scene";
            if (!currentSceneId) continue;

            const shots = Array.isArray(sceneRow.shots) ? sceneRow.shots : [];
            for (const shotRow of shots) {
                if (!isRecord(shotRow)) continue;

                const shotName = getString(shotRow.name) ?? "Untitled Shot";
                const shotType = getString(shotRow.shot_type) ?? undefined;
                const lens = isRecord(shotRow.lens) ? shotRow.lens : null;
                const lensName = lens ? getString(lens.name) ?? undefined : undefined;
                const options = Array.isArray(shotRow.shot_generations) ? shotRow.shot_generations : [];

                for (const option of options) {
                    if (!isRecord(option)) continue;
                    let outputUrl = getString(option.output_url);
                    const id = getString(option.id);
                    const status = getString(option.status);

                    if (!id) continue;

                    if (status === 'processing' || status === 'pending' || outputUrl === 'pending_generation') {
                        const pollResult = await pollShotStatus(id);
                        if (pollResult.data) {
                            outputUrl = pollResult.data.url || outputUrl;
                        } else if (pollResult.error) {
                            if (process.env.NODE_ENV !== "production") {
                                console.log(`[Gallery] Error polling ${id}:`, pollResult.error);
                            }
                        }
                    }

                    if (!outputUrl || outputUrl === 'pending_generation') continue;

                    const isVideo = outputUrl.includes('.mp4') || outputUrl.includes('tempfile.aiquickdraw.com/p/');
                    if (process.env.NODE_ENV !== "production") {
                        console.log(`[Gallery] loaded asset: ${outputUrl} | isVideo: ${isVideo}`);
                    }

                    assets.push({
                        id,
                        url: outputUrl,
                        type: isVideo ? "video" : "image",
                        prompt: getString(option.prompt) ?? "",
                        shotName,
                        shotType,
                        lensName,
                        shotId: getString(shotRow.id) ?? undefined,
                        projectId: currentProjectId,
                        projectName: currentProjectName,
                        sceneId: currentSceneId,
                        sceneName: currentSceneName,
                        createdAt: getString(option.created_at) ?? "",
                    });
                }
            }
        }
    }

    assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { data: assets };
}

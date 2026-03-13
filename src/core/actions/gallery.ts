"use server";

import { createClient } from "@/infrastructure/supabase/server";
import { MediaAsset } from "@/interface/components/media/MediaGallery";
import { pollShotStatus } from "@/core/actions/generation";

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

    const { error } = await supabase.from("shot_options").delete().eq("id", optionId);
    if (error) return { error: error.message };
    return { success: true };
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
                    shot_options (
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
                const options = Array.isArray(shotRow.shot_options) ? shotRow.shot_options : [];

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

"use server";

import { createClient } from "@/infrastructure/supabase/server";
import { ProviderFactory } from "@/infrastructure/ai/factory";
import { decrypt } from "@/core/utils/security/encryption";
import { assemblePrompt } from "@/core/utils/prompts/builder";
import { revalidatePath } from "next/cache";
import * as ShotRepo from "@/infrastructure/repositories/shot.repository";
import { Database } from "@/core/types/db";

const SUPPORTED_PROVIDER_PRIORITY = ["openai", "kie"] as const;

type SupportedProviderSlug = typeof SUPPORTED_PROVIDER_PRIORITY[number];
type ProviderRow = { id: string; slug: string };
type UserKeyRow = { provider_id: string; encrypted_key: string };
type ProviderResolution = {
    slug: SupportedProviderSlug;
    providerId?: string;
    apiKey: string;
    source: "user_key" | "env";
};

type ShotOptionUpdate = Database["public"]["Tables"]["shot_generations"]["Update"];

const getSceneFromJoin = (shots: { scene_id: string } | { scene_id: string }[] | null | undefined) => {
    if (!shots) return null;
    if (Array.isArray(shots)) return shots[0] || null;
    return shots;
};

async function resolveGenerationProvider(userId: string): Promise<{ data?: ProviderResolution; error?: string }> {
    const supabase = await createClient();

    const { data: providers, error: providersError } = await supabase
        .from("providers")
        .select("id, slug, is_active")
        .in("slug", [...SUPPORTED_PROVIDER_PRIORITY])
        .eq("is_active", true);

    if (providersError) {
        return { error: providersError.message };
    }

    const availableProviders = (providers ?? []) as ProviderRow[];
    const providerBySlug = new Map<SupportedProviderSlug, ProviderRow>();

    availableProviders.forEach((provider) => {
        if (provider.slug === "openai" || provider.slug === "kie") {
            providerBySlug.set(provider.slug, provider);
        }
    });

    const providerIds = availableProviders.map((provider) => provider.id);

    const { data: userKeys, error: keyError } = providerIds.length
        ? await supabase
            .from("user_api_keys")
            .select("provider_id, encrypted_key")
            .eq("user_id", userId)
            .in("provider_id", providerIds)
        : { data: [], error: null };

    if (keyError) {
        return { error: keyError.message };
    }

    const keys = (userKeys ?? []) as UserKeyRow[];

    const { data: preferenceRow } = await supabase
        .from("user_preferences")
        .select("preferred_provider_slug")
        .eq("user_id", userId)
        .maybeSingle();

    const preferredSlugRaw = preferenceRow?.preferred_provider_slug;
    const preferredSlug =
        preferredSlugRaw === "openai" || preferredSlugRaw === "kie"
            ? preferredSlugRaw
            : null;

    const orderedProviderSlugs: SupportedProviderSlug[] = preferredSlug
        ? [preferredSlug, ...SUPPORTED_PROVIDER_PRIORITY.filter((slug) => slug !== preferredSlug)]
        : [...SUPPORTED_PROVIDER_PRIORITY];

    for (const slug of orderedProviderSlugs) {
        const provider = providerBySlug.get(slug);
        if (!provider) continue;

        const keyRow = keys.find((key) => key.provider_id === provider.id);
        if (!keyRow?.encrypted_key) continue;

        const decrypted = decrypt(keyRow.encrypted_key);
        if (!decrypted) continue;

        return {
            data: {
                slug,
                providerId: provider.id,
                apiKey: decrypted,
                source: "user_key",
            },
        };
    }

    for (const slug of orderedProviderSlugs) {
        const provider = providerBySlug.get(slug);
        if (!provider) continue;

        if (slug === "openai" && process.env.OPENAI_API_KEY) {
            return {
                data: {
                    slug: "openai",
                    providerId: provider.id,
                    apiKey: process.env.OPENAI_API_KEY,
                    source: "env",
                },
            };
        }

        if (slug === "kie" && process.env.KIE_AI_API_KEY) {
            return {
                data: {
                    slug: "kie",
                    providerId: provider ? provider.id : undefined, // Graceful fallback
                    apiKey: process.env.KIE_AI_API_KEY,
                    source: "env",
                },
            };
        }
    }

    return {
        error:
            "No supported provider key found. Add OpenAI or Kie.ai in Settings, or configure OPENAI_API_KEY/KIE_AI_API_KEY.",
    };
}

export async function getActiveGenerationProvider() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    const resolved = await resolveGenerationProvider(user.id);
    if (!resolved.data) {
        return { error: resolved.error ?? "No provider configured" };
    }

    return {
        data: {
            slug: resolved.data.slug,
            source: resolved.data.source,
        },
    };
}

export async function generateShot(shotId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    // 1. Fetch Shot details + Joined Scene/Project for context if needed
    // For prompt builder, we need shot attributes.
    const shot = await ShotRepo.getShotById(shotId);

    if (!shot) {
        return { error: "Shot not found" };
    }

    const resolved = await resolveGenerationProvider(user.id);
    if (!resolved.data) {
        return { error: resolved.error ?? "No provider configured" };
    }

    const selectionPayload = (shot.selection_payload as Record<string, unknown> | null) ?? null;
    const subject = typeof selectionPayload?.subject === "string" ? selectionPayload.subject : "";
    const selections = (selectionPayload?.selections as Record<string, { label?: string }> | undefined) ?? {};
    const prompt = shot.prompt_text
        || (subject
            ? assemblePrompt({
                subject,
                selections,
            })
            : (shot.description || ""));

    // 6. Call Provider
    try {
        const provider = ProviderFactory.create(resolved.data.slug, { apiKey: resolved.data.apiKey });
        const settings = (shot.generation_settings as Record<string, unknown> | null) ?? {};
        const variations = Math.max(1, Math.min(Number(settings.variations ?? 1), 6));
        const baseSeed = typeof settings.seed === "number" ? settings.seed : undefined;
        const seedLocked = Boolean(settings.seed_locked);

        let lastUrl: string | undefined;

        for (let i = 0; i < variations; i += 1) {
            const requestSeed = baseSeed !== undefined && !seedLocked ? baseSeed + i : baseSeed;
            const result = await provider.generate({
                prompt,
                negative_prompt: typeof settings.negative_prompt === "string" ? settings.negative_prompt : undefined,
                aspect_ratio: typeof settings.aspect_ratio === "string" ? settings.aspect_ratio : undefined,
                model: typeof settings.model === "string" ? settings.model : undefined,
                seed: typeof requestSeed === "number" ? requestSeed : undefined,
                steps: typeof settings.steps === "number" ? settings.steps : undefined,
                cfg_scale: typeof settings.cfg_scale === "number" ? settings.cfg_scale : undefined,
                duration_seconds: typeof settings.duration_seconds === "number" ? settings.duration_seconds : undefined,
                variations,
            });

            if (result.status === 'failed') {
                return { error: result.error || "Generation failed" };
            }

            const { error: saveError } = await supabase.from("shot_generations").insert({
                shot_id: shotId,
                prompt: prompt,
                negative_prompt: typeof settings.negative_prompt === "string" ? settings.negative_prompt : null,
                seed: typeof requestSeed === "number" ? requestSeed : null,
                cfg_scale: typeof settings.cfg_scale === "number" ? settings.cfg_scale : null,
                steps: typeof settings.steps === "number" ? settings.steps : null,
                model_version: typeof settings.model === "string" ? settings.model : null,
                provider_id: resolved.data.providerId || null,
                status: result.status,
                output_url: result.url,
                parameters: settings,
            });

            if (saveError) console.error("Failed to save generation result:", saveError);
            lastUrl = result.url;
        }

        const { data: scene } = await supabase
            .from("scenes")
            .select("id, project_id")
            .eq("id", shot.scene_id)
            .single();

        if (scene?.project_id) {
            revalidatePath(`/dashboard/projects/${scene.project_id}/scenes/${scene.id}`, "page");
        }

        return { success: true, url: lastUrl };

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Generation failed";
        return { error: message };
    }
}

export async function generateVideoShot(shotOptionId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    // 1. Fetch the underlying shot_option to get the image URL and original Prompt
        const { data: shotOption, error: optionError } = await supabase
        .from("shot_generations")
        .select(`
            *,
            shots (
                id,
                scene_id
            )
        `)
        .eq("id", shotOptionId)
        .single();

    if (optionError || !shotOption) {
        return { error: "Original shot image not found." };
    }

    if (!shotOption.output_url) {
        return { error: "Cannot generate video from a shot option without an image." };
    }

    // 2. Fetch User Keys & force kie provider resolution
    const { data: providerRow } = await supabase
        .from("providers")
        .select("id, slug")
        .eq("slug", "kie")
        .eq("is_active", true)
        .maybeSingle();

    let apiKey = process.env.KIE_AI_API_KEY;

    // Check user keys if env key is missing and provider exists in DB
    if (!apiKey && providerRow?.id) {
        const { data: userKey } = await supabase
            .from("user_api_keys")
            .select("encrypted_key")
            .eq("user_id", user.id)
            .eq("provider_id", providerRow.id)
            .single();

        if (userKey?.encrypted_key) {
            apiKey = decrypt(userKey.encrypted_key) || undefined;
        }
    }

    if (!apiKey) {
        return { error: "Kie.ai API key missing. Add it to .env.local or settings." };
    }

    const promptText = `Generate a cinematic video sequence based on the original shot: ${shotOption.prompt || "cinematic scene"}`;

    try {
        const provider = ProviderFactory.create("kie", { apiKey: apiKey });

        // Use the output_url of the previous option as the input image prompt.
        const result = await provider.generate({
            prompt: promptText,
            image_prompt: shotOption.output_url,
            output_type: "video"
        });

        if (result.status === 'failed') {
            return { error: result.error || "Generation failed" };
        }

        if (process.env.NODE_ENV !== "production") {
            console.log(`\n\n=== KIE.AI VIDEO TASK STARTED ===\nTASK ID: ${result.provider_check_id}\n=================================\n\n`);
        }

        const { error: saveError } = await supabase.from("shot_generations").insert({
            shot_id: shotOption.shot_id, // Linked to the same generic shot
            prompt: promptText,
            provider_id: providerRow ? providerRow.id : null,
            status: result.status,
            output_url: result.url || 'pending_generation', // URL is usually null when processing async
            parameters: { task_id: result.provider_check_id } // Store in JSONB column
        });

        if (saveError) console.error("Failed to save generation result:", saveError);

        const scene = getSceneFromJoin(shotOption.shots);

        if (scene) {
            const { data: sceneData } = await supabase
                .from("scenes")
                .select("id, project_id")
                .eq("id", scene.scene_id)
                .single();

            if (sceneData?.project_id) {
                revalidatePath(`/dashboard/gallery`, "page");
            }
        }

        return { success: true, status: result.status };

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Video Generation failed";
        return { error: message };
    }
}

export async function pollShotStatus(shotOptionId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    // 1. Fetch the shot_option
    const { data: option, error } = await supabase
        .from("shot_generations")
        .select(`
            id, 
            status, 
            output_url,
            parameters, 
            provider_id,
            shots ( scene_id )
        `)
        .eq("id", shotOptionId)
        .single();

    if (error || !option) {
        return { error: "Shot option not found" };
    }

    // If it's already done and NOT stuck pending, we don't need to poll
    if (option.status !== "processing" && option.status !== "pending" && option.output_url !== 'pending_generation') {
        return { data: { status: option.status, url: option.output_url } };
    }

    const parameters = (option.parameters as Record<string, unknown> | null) ?? null;
    const taskId = typeof parameters?.task_id === "string" ? parameters.task_id : null;
    if (!taskId) {
        return { error: "No task_id found to poll" };
    }

    // 2. Resolve Provider & Key
    let slug = "kie"; // Fallback
    if (option.provider_id) {
        const { data: providerRow } = await supabase
            .from("providers")
            .select("slug")
            .eq("id", option.provider_id)
            .single();
        if (providerRow?.slug) {
            slug = providerRow.slug;
        }
    }

    let apiKey = process.env.KIE_AI_API_KEY; // Default for Kie

    if (slug === "kie" && !apiKey && option.provider_id) {
        const { data: userKey } = await supabase
            .from("user_api_keys")
            .select("encrypted_key")
            .eq("user_id", user.id)
            .eq("provider_id", option.provider_id)
            .single();

        if (userKey?.encrypted_key) {
            apiKey = decrypt(userKey.encrypted_key) || undefined;
        }
    }

    if (!apiKey) {
        return { error: "Provider API key missing during polling." };
    }

    // 3. Poll provider
    try {
        const provider = ProviderFactory.create(slug, { apiKey: apiKey });

        if (!provider.checkStatus) {
            return { error: "Provider does not support async polling." };
        }

        const result = await provider.checkStatus(taskId);

        const shouldUpdate = result.status !== option.status || (result.url && option.output_url === 'pending_generation');

        // 4. Update Database if status changed or URL was freshly discovered
        if (shouldUpdate) {
            const updatePayload: ShotOptionUpdate = {
                status: result.status,
            };

            if (result.url && result.status !== "failed") {
                updatePayload.output_url = result.url;
            } else if (result.status === "failed") {
                updatePayload.output_url = null;
                // Optionally log error in parameters
                updatePayload.parameters = { ...(parameters || {}), error: result.error };
            }

            const { error: updateError } = await supabase
                .from("shot_generations")
                .update(updatePayload)
                .eq("id", option.id);

            if (!updateError) {
                const scene = getSceneFromJoin(option.shots);
                if (scene?.scene_id) {
                    const { data: sceneData } = await supabase
                        .from("scenes")
                        .select("project_id")
                        .eq("id", scene.scene_id)
                        .single();

                    if (sceneData?.project_id) {
                        try {
                            revalidatePath(`/dashboard/projects/${sceneData.project_id}/scenes/${scene.scene_id}`, "page");
                            revalidatePath(`/dashboard/gallery`, "page");
                        } catch {
                            // Suppress Next.js "unsupported during render" errors when pollShotStatus is called by a page server component
                        }
                    }
                }
            }
        }

        return { data: { status: result.status, url: result.url } };

    } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : "Polling failed" };
    }
}

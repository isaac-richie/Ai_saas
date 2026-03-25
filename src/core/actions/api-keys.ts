"use server";

import { createClient } from "@/infrastructure/supabase/server";
import { encrypt } from "@/core/utils/security/encryption";
import { revalidatePath } from "next/cache";

export async function addApiKey(providerId: string, apiKey: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    const encryptedKey = encrypt(apiKey);

    const { error } = await supabase.from("user_api_keys").upsert({
        user_id: user.id,
        provider_id: providerId,
        encrypted_key: encryptedKey,
        last_test_status: "untested",
        last_tested_at: null,
    }, {
        onConflict: 'user_id, provider_id'
    });

    if (error) {
        return { error: error.message };
    }

    revalidatePath("/dashboard/settings");
    return { success: true };
}

export async function listApiKeys() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    // Get all providers
    const { data: providers, error: providersError } = await supabase
        .from("providers")
        .select("*")
        .eq("is_active", true);

    if (providersError) return { error: providersError.message };

    // Get user's keys
    const { data: keys, error: keysError } = await supabase
        .from("user_api_keys")
        .select("provider_id, created_at, last_test_status, last_tested_at")
        .eq("user_id", user.id);

    if (keysError) return { error: keysError.message };

    // Merge data to show connection status
    const result = providers.map(provider => {
        const key = keys.find(k => k.provider_id === provider.id);
        return {
            ...provider,
            isConnected: !!key,
            lastUpdated: key?.created_at || null,
            testStatus: key?.last_test_status || "untested",
            lastTestedAt: key?.last_tested_at || null,
        };
    });

    return { data: result };
}

async function validateProviderKey(slug: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
    const normalized = slug.toLowerCase();

    if (normalized === "openai" || normalized === "dall-e-3") {
        const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) return { ok: true, message: "OpenAI key validated" };
        if (res.status === 401 || res.status === 403) return { ok: false, message: "OpenAI key unauthorized" };
        return { ok: false, message: `OpenAI validation failed (${res.status})` };
    }

    if (normalized === "kie" || normalized === "kie-runway") {
        const res = await fetch("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=health-check", {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.status === 401 || res.status === 403) return { ok: false, message: "Kie key unauthorized" };
        if (res.ok || res.status === 400 || res.status === 404) return { ok: true, message: "Kie key accepted" };
        return { ok: false, message: `Kie validation failed (${res.status})` };
    }

    if (normalized === "runway" || normalized === "gen-3") {
        const res = await fetch("https://api.runwayml.com/v1/tasks?limit=1", {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "X-Runway-Version": "2024-11-06",
            },
        });
        if (res.status === 401 || res.status === 403) return { ok: false, message: "Runway key unauthorized" };
        if (res.ok || (res.status >= 400 && res.status < 500)) return { ok: true, message: "Runway key accepted" };
        return { ok: false, message: `Runway validation failed (${res.status})` };
    }

    return { ok: true, message: "Provider connected (manual validation pending)" };
}

export async function testApiKeyConnection(providerId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    const { data: provider, error: providerError } = await supabase
        .from("providers")
        .select("id, slug, name")
        .eq("id", providerId)
        .single();

    if (providerError || !provider) {
        return { error: providerError?.message || "Provider not found" };
    }

    const { data: keyRow, error: keyError } = await supabase
        .from("user_api_keys")
        .select("encrypted_key")
        .eq("provider_id", providerId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (keyError || !keyRow?.encrypted_key) {
        return { error: keyError?.message || "No API key found for provider" };
    }

    const { decrypt } = await import("@/core/utils/security/encryption");
    const rawApiKey = decrypt(keyRow.encrypted_key);
    if (!rawApiKey) {
        return { error: "Failed to decrypt API key" };
    }

    let validation: { ok: boolean; message: string };
    try {
        validation = await validateProviderKey(provider.slug, rawApiKey);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Connection test failed";
        validation = { ok: false, message };
    }

    await supabase
        .from("user_api_keys")
        .update({
            last_test_status: validation.ok ? "valid" : "invalid",
            last_tested_at: new Date().toISOString(),
        })
        .eq("provider_id", providerId)
        .eq("user_id", user.id);

    revalidatePath("/dashboard/settings");
    return validation.ok
        ? { success: true, message: validation.message }
        : { error: validation.message };
}

export async function deleteApiKey(providerId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    const { error } = await supabase
        .from("user_api_keys")
        .delete()
        .match({ user_id: user.id, provider_id: providerId });

    if (error) {
        return { error: error.message };
    }

    // If deleted provider was preferred, reset preference to auto (null).
    const { data: provider } = await supabase
        .from("providers")
        .select("slug")
        .eq("id", providerId)
        .maybeSingle();

    if (provider?.slug === "openai" || provider?.slug === "runway") {
        const { data: pref } = await supabase
            .from("user_preferences")
            .select("preferred_provider_slug")
            .eq("user_id", user.id)
            .maybeSingle();

        if (pref?.preferred_provider_slug === provider.slug) {
            await supabase
                .from("user_preferences")
                .upsert(
                    {
                        user_id: user.id,
                        preferred_provider_slug: null,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id" }
                );
        }
    }

    revalidatePath("/dashboard/settings");
    return { success: true };
}

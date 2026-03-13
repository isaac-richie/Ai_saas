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
        .select("provider_id, created_at")
        .eq("user_id", user.id);

    if (keysError) return { error: keysError.message };

    // Merge data to show connection status
    const result = providers.map(provider => {
        const key = keys.find(k => k.provider_id === provider.id);
        return {
            ...provider,
            isConnected: !!key,
            lastUpdated: key?.created_at || null
        };
    });

    return { data: result };
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

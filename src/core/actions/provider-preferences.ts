"use server";

import { createClient } from "@/infrastructure/supabase/server";
import { revalidatePath } from "next/cache";

const SUPPORTED_PROVIDER_SLUGS = ["openai", "runway"] as const;
type SupportedProviderSlug = typeof SUPPORTED_PROVIDER_SLUGS[number];

function isSupportedProviderSlug(value: string): value is SupportedProviderSlug {
  return SUPPORTED_PROVIDER_SLUGS.includes(value as SupportedProviderSlug);
}

export async function getPreferredProviderSlug() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { data, error } = await supabase
    .from("user_preferences")
    .select("preferred_provider_slug")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: error.message };

  return { data: data?.preferred_provider_slug ?? null };
}

export async function setPreferredProviderSlug(slug: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  if (slug !== null && !isSupportedProviderSlug(slug)) {
    return { error: "Unsupported provider" };
  }

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      preferred_provider_slug: slug,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true };
}

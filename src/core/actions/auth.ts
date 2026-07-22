"use server";

import { createClient } from "@/infrastructure/supabase/server";
import {
    forgotPasswordSchema,
    loginSchema,
    signupSchema,
    ForgotPasswordInput,
    LoginInput,
    SignupInput,
} from "@/core/types/auth";
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/core/utils/security/safe-redirect";

function getAppUrl() {
    return (
        process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
        || "http://localhost:3000"
    );
}

/**
 * Supabase's client rejects (rather than resolving with `{ error }`) on
 * transport-level failures like DNS/timeout. Without this, those throws go
 * uncaught inside the server action and the user sees no feedback at all.
 */
async function withNetworkFallback<T extends { error: { message: string } | null }>(
    promise: Promise<T>
): Promise<T> {
    try {
        return await promise;
    } catch {
        return { error: { message: "fetch failed" } } as T;
    }
}

export async function login(data: LoginInput, nextPath?: string) {
    const result = loginSchema.safeParse(data);
    if (!result.success) {
        return { error: "Invalid input data" };
    }

    const supabase = await createClient();
    const { error } = await withNetworkFallback(supabase.auth.signInWithPassword(result.data));

    if (error) {
        return { error: error.message };
    }

    redirect(sanitizeNextPath(nextPath, "/dashboard"));
}

export async function signup(data: SignupInput) {
    const result = signupSchema.safeParse(data);
    if (!result.success) {
        return { error: "Invalid input data" };
    }

    const supabase = await createClient();
    const { error } = await withNetworkFallback(supabase.auth.signUp({
        ...result.data,
        options: {
            emailRedirectTo: `${getAppUrl()}/auth/callback`,
        },
    }));

    if (error) {
        return { error: error.message };
    }

    return { success: true, message: "Check your email to confirm your account." };
}

export async function requestPasswordReset(data: ForgotPasswordInput) {
    const result = forgotPasswordSchema.safeParse(data);
    if (!result.success) {
        return { error: "Enter a valid email address." };
    }

    const supabase = await createClient();
    const { error } = await withNetworkFallback(supabase.auth.resetPasswordForEmail(result.data.email, {
        redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password`,
    }));

    if (error) {
        return { error: error.message };
    }

    return {
        success: true,
        message: "If that email exists, a password reset link is on its way.",
    };
}

export async function logout() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
}

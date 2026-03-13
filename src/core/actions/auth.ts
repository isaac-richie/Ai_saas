"use server";

import { createClient } from "@/infrastructure/supabase/server";
import { loginSchema, signupSchema, LoginInput, SignupInput } from "@/core/types/auth";
import { redirect } from "next/navigation";

export async function login(data: LoginInput) {
    const result = loginSchema.safeParse(data);
    if (!result.success) {
        return { error: "Invalid input data" };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(result.data);

    if (error) {
        return { error: error.message };
    }

    redirect("/");
}

export async function signup(data: SignupInput) {
    const result = signupSchema.safeParse(data);
    if (!result.success) {
        return { error: "Invalid input data" };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
        ...result.data,
        options: {
            emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        },
    });

    if (error) {
        return { error: error.message };
    }

    return { success: true, message: "Check your email to confirm your account." };
}

export async function logout() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
}

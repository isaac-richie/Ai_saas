import { NextResponse } from "next/server";
import { createClient } from "@/infrastructure/supabase/server";
import { getAppBaseUrl } from "@/core/utils/app-url";
import { sanitizeNextPath } from "@/core/utils/security/safe-redirect";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    // if "next" is in param, use it as the redirect URL, otherwise the dashboard.
    // Sanitized to same-origin paths only to prevent open redirects.
    const next = sanitizeNextPath(searchParams.get("next"), "/dashboard");

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(`${getAppBaseUrl()}${next}`);
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${getAppBaseUrl()}/auth/auth-code-error`);
}

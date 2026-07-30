import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/core/utils/app-url";
import { sanitizeNextPath } from "@/core/utils/security/safe-redirect";
import { createClient } from "@/infrastructure/supabase/server";

const SUPPORTED_OTP_TYPES = new Set<EmailOtpType>([
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
    "email",
]);

function getEmailOtpType(value: string | null): EmailOtpType | null {
    if (!value) return null;
    return SUPPORTED_OTP_TYPES.has(value as EmailOtpType) ? value as EmailOtpType : null;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tokenHash = searchParams.get("token_hash");
    const type = getEmailOtpType(searchParams.get("type"));
    const next = sanitizeNextPath(searchParams.get("next"), "/dashboard");

    if (tokenHash && type) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
        });

        if (!error) {
            return NextResponse.redirect(`${getAppBaseUrl()}${next}`);
        }
    }

    return NextResponse.redirect(`${getAppBaseUrl()}/auth/auth-code-error`);
}

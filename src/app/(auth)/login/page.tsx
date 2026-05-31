import { LoginForm } from "@/interface/components/auth/LoginForm";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Login | AI Cinematography Dashboard",
    description: "Login to your account",
};

export default async function LoginPage({
    searchParams,
}: {
    searchParams?: Promise<{ next?: string | string[] }>;
}) {
    const resolved = await searchParams;
    const nextValue = Array.isArray(resolved?.next) ? resolved?.next[0] : resolved?.next;
    const nextPath = nextValue?.startsWith("/") ? nextValue : "/dashboard";
    return <LoginForm nextPath={nextPath} />;
}

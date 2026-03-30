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
    searchParams: Promise<{ next?: string }>;
}) {
    const params = await searchParams;
    const nextPath = params?.next?.startsWith("/") ? params.next : "/dashboard";
    return <LoginForm nextPath={nextPath} />;
}

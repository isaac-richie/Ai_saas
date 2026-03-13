import { LoginForm } from "@/interface/components/auth/LoginForm";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Login | AI Cinematography Dashboard",
    description: "Login to your account",
};

export default function LoginPage() {
    return <LoginForm />;
}

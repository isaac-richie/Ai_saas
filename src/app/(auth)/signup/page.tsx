import { SignupForm } from "@/interface/components/auth/SignupForm";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Sign Up | AI Cinematography Dashboard",
    description: "Create a new account",
};

export default function SignupPage() {
    return <SignupForm />;
}

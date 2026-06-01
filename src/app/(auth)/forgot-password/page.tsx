import { Metadata } from "next"
import { ForgotPasswordForm } from "@/interface/components/auth/ForgotPasswordForm"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Reset Password | AI Cinematography Dashboard",
  description: "Request a secure password reset link.",
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}

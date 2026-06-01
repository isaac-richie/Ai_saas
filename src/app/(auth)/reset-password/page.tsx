import { Metadata } from "next"
import { ResetPasswordForm } from "@/interface/components/auth/ResetPasswordForm"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Create New Password | AI Cinematography Dashboard",
  description: "Set a new password for your account.",
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}

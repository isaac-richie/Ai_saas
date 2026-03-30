import { Metadata } from "next"
import { VerifyOtpForm } from "@/interface/components/auth/VerifyOtpForm"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Verify OTP | AI Cinematography Dashboard",
  description: "Verify your email OTP code",
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; mode?: string }>
}) {
  const params = await searchParams
  const email = params.email?.trim().toLowerCase()

  if (!email) {
    redirect("/login")
  }

  const nextPath =
    typeof params.next === "string" && params.next.startsWith("/")
      ? params.next
      : "/dashboard"
  const mode = params.mode === "signup" ? "signup" : "signin"

  return <VerifyOtpForm email={email} nextPath={nextPath} mode={mode} />
}


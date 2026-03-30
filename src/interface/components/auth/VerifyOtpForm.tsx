"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/interface/components/ui/button"
import { Input } from "@/interface/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { CheckCircle2, ShieldCheck } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import { humanizeAuthError } from "@/interface/components/auth/auth-error-message"

type VerifyOtpFormProps = {
  email: string
  nextPath: string
  mode: "signin" | "signup"
}

export function VerifyOtpForm({ email, nextPath, mode }: VerifyOtpFormProps) {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [resendPending, setResendPending] = useState(false)

  const normalizedEmail = email.trim().toLowerCase()

  useEffect(() => {
    if (!error) return
    const timeoutId = window.setTimeout(() => setError(null), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [error])

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit OTP code sent to your email.")
      return
    }

    try {
      setPending(true)
      setError(null)
      setSuccess(null)

      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: code.trim(),
        type: "email",
      })

      if (error) {
        setError(humanizeAuthError(error.message))
        return
      }

      setSuccess("Verification successful. Redirecting to dashboard...")
      router.replace(nextPath)
    } finally {
      setPending(false)
    }
  }

  async function onResend() {
    try {
      setResendPending(true)
      setError(null)
      setSuccess(null)
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: mode === "signup",
        },
      })
      if (error) {
        setError(humanizeAuthError(error.message))
        return
      }
      setSuccess("A new OTP has been sent.")
    } finally {
      setResendPending(false)
    }
  }

  return (
    <Card className="w-full rounded-3xl border border-white/12 bg-[#0f1012]/95 text-white shadow-[0_30px_50px_-35px_rgba(0,0,0,0.95)] backdrop-blur-xl">
      <CardHeader className="space-y-4">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/60">
          <ShieldCheck className="h-3.5 w-3.5" />
          Email Verification
        </div>
        <div>
          <CardTitle className="text-3xl font-semibold tracking-tight text-white">Enter OTP code</CardTitle>
          <CardDescription className="mt-2 text-sm text-white/60">
            We sent a 6-digit code to <span className="font-medium text-white/85">{normalizedEmail}</span>.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onVerify} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              <span className="inline-flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />{success}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm text-white/75">One-time password</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="h-12 rounded-xl border-white/14 bg-[#13161b] text-center text-2xl tracking-[0.4em] text-white placeholder:text-white/25 focus:border-cyan-400/60 focus-visible:ring-cyan-400/20"
            />
          </div>

          <Button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] text-black hover:opacity-90"
            disabled={pending}
          >
            {pending ? "Verifying..." : "Verify and Continue"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
            onClick={onResend}
            disabled={resendPending || pending}
          >
            {resendPending ? "Resending..." : "Resend OTP"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-white/55">
          Wrong email?{" "}
          <Link href={mode === "signup" ? "/signup" : "/login"} className="font-medium text-cyan-300 hover:underline">
            Go back
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}

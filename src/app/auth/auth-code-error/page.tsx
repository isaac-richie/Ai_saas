import Link from "next/link"

export default function AuthCodeErrorPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
      <div className="w-full rounded-2xl border border-white/10 bg-[#0f1012] p-6 text-white shadow-[0_24px_50px_-38px_rgba(0,0,0,0.95)]">
        <h1 className="text-2xl font-semibold">Authentication failed</h1>
        <p className="mt-2 text-sm text-white/65">
          We could not complete sign-in from the callback link. Please try again.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/15"
          >
            Go to Login
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Create Account
          </Link>
        </div>
      </div>
    </main>
  )
}


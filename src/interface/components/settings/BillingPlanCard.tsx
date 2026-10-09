import Link from "next/link"
import { BillingSnapshot } from "@/core/services/billing"
import { Badge } from "@/interface/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"

function usageLabel(used: number, max: number | null) {
  if (max == null) return `${used} used · unlimited`
  return `${used}/${max}`
}

function usagePercent(used: number, max: number | null) {
  if (max == null || max <= 0) return 0
  return Math.min(100, Math.round((used / max) * 100))
}

export function BillingPlanCard({
  billing,
  checkoutUrl,
}: {
  billing: BillingSnapshot
  checkoutUrl?: string
}) {
  const isPro = billing.planCode === "studio_pro"

  return (
    <Card data-reveal="card" className="rounded-2xl border border-gold-400/[0.12] bg-obsidian-900 text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Billing & Usage</CardTitle>
          <p className="mt-1 text-sm text-white/55">
            Your current plan and generation limits.
          </p>
        </div>
        <Badge className="rounded-full border border-gold-400/[0.12] bg-white/10 text-white/90">
          {billing.planName}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gold-400/[0.12] bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-white/45">Projects</p>
            <p className="mt-1 text-sm font-medium text-white/85">
              {billing.maxProjects == null ? "Unlimited" : `${billing.maxProjects} max`}
            </p>
          </div>
          <div className="rounded-xl border border-gold-400/[0.12] bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-white/45">Studio</p>
            <p className="mt-1 text-sm font-medium text-white/85">
              {usageLabel(billing.studioGenerationsUsed, billing.maxStudioGenerations)}
            </p>
          </div>
          <div className="rounded-xl border border-gold-400/[0.12] bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-white/45">Quick videos</p>
            <p className="mt-1 text-sm font-medium text-white/85">
              {usageLabel(billing.fastVideoGenerationsUsed, billing.maxFastVideoGenerations)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-white/55">
              <span>Studio usage</span>
              <span>{usageLabel(billing.studioGenerationsUsed, billing.maxStudioGenerations)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#f3e5c0] to-[#d9c08a] transition-[width] duration-300"
                style={{ width: `${usagePercent(billing.studioGenerationsUsed, billing.maxStudioGenerations)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-white/55">
              <span>Quick video usage</span>
              <span>{usageLabel(billing.fastVideoGenerationsUsed, billing.maxFastVideoGenerations)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#f3e5c0] to-[#d9c08a] transition-[width] duration-300"
                style={{ width: `${usagePercent(billing.fastVideoGenerationsUsed, billing.maxFastVideoGenerations)}%` }}
              />
            </div>
          </div>
        </div>

        {!isPro && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-400/30 bg-gold-400/10 p-3">
            <p className="text-sm text-gold-100">
              Upgrade to Studio Pro for unlimited Studio and Quick video generations.
            </p>
            {checkoutUrl ? (
              <Link
                href={checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-gradient-to-r from-[#f3e5c0] via-[#d9c08a] to-[#b08d52] px-3 py-1.5 text-xs font-semibold text-black"
              >
                Upgrade
              </Link>
            ) : (
              <span className="text-xs text-gold-100/80">Set `NEXT_PUBLIC_CHECKOUT_URL` to enable upgrade.</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

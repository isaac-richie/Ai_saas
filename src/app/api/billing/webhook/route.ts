import { createHmac, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/infrastructure/supabase/admin"

type BillingWebhookPayload = {
  type?: string
  data?: {
    user_id?: string
    provider?: string
    provider_customer_id?: string
    provider_subscription_id?: string
    current_period_end?: string | null
    cancel_at_period_end?: boolean
    plan_code?: string
  }
}

function verifySignature(rawBody: string, providedSignature: string, secret: string) {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(providedSignature))
  } catch {
    return false
  }
}

function getPlanFromEvent(type: string, payload: BillingWebhookPayload) {
  const explicitPlan = payload.data?.plan_code
  if (explicitPlan === "studio_pro" || explicitPlan === "creator_free") {
    return explicitPlan
  }

  if (type === "payment_succeeded" || type === "subscription_active") return "studio_pro"
  if (
    type === "subscription_cancelled"
    || type === "subscription_canceled"
    || type === "subscription_expired"
  ) return "creator_free"

  return null
}

export async function POST(request: Request) {
  const webhookSecret = process.env.BILLING_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing BILLING_WEBHOOK_SECRET." }, { status: 500 })
  }

  const signature = request.headers.get("x-billing-signature") || request.headers.get("x-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 401 })
  }

  const rawBody = await request.text()
  const valid = verifySignature(rawBody, signature, webhookSecret)
  if (!valid) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 })
  }

  let payload: BillingWebhookPayload
  try {
    payload = JSON.parse(rawBody) as BillingWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
  }

  const eventType = payload.type || ""
  const userId = payload.data?.user_id
  if (!eventType || !userId) {
    return NextResponse.json({ error: "Missing required fields: type, data.user_id." }, { status: 400 })
  }

  const planCode = getPlanFromEvent(eventType, payload)
  if (!planCode) {
    return NextResponse.json({ success: true, ignored: true })
  }

  const status =
    planCode === "studio_pro"
      ? "active"
      : (eventType.includes("expired") ? "expired" : "canceled")

  const admin = createAdminClient()
  const { error } = await admin.rpc("apply_plan_to_user", {
    p_user_id: userId,
    p_plan_code: planCode,
    p_status: status,
    p_provider: payload.data?.provider || "webhook",
    p_provider_customer_id: payload.data?.provider_customer_id || null,
    p_provider_subscription_id: payload.data?.provider_subscription_id || null,
    p_current_period_end: payload.data?.current_period_end || null,
    p_cancel_at_period_end: Boolean(payload.data?.cancel_at_period_end),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, planCode })
}


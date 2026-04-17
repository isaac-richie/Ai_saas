"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { ProviderFactory } from "@/infrastructure/ai/factory"
import { decrypt } from "@/core/utils/security/encryption"
import { fastVideoRequestSchema, type FastVideoRequest } from "@/core/validation/fast-video"
import {
  findMotionPreset,
  findStylePreset,
  type FastVideoVariation,
} from "@/core/config/fast-video-presets"
import * as ShotRepo from "@/infrastructure/repositories/shot.repository"
import { normalizeGenerationError } from "@/core/utils/ai/error-normalization"
import { consumeUsageQuota } from "@/core/services/billing"
import { enforcePromptCompliance } from "@/core/utils/ai/prompt-compliance"

const VARIATION_HINTS: Record<FastVideoVariation, string> = {
  strict: "preserve subject identity and scene composition with minimal deviation",
  balanced: "maintain core subject while allowing moderate cinematic interpretation",
  creative: "allow expressive cinematic reinterpretation while preserving primary subject intent",
}

const BASE_QUALITY_TOKENS = [
  "cinematic continuity",
  "clean composition",
  "high production value",
  "coherent lighting direction",
  "subject readability across frames",
]

const BASE_NEGATIVE_TOKENS = [
  "distorted anatomy",
  "broken geometry",
  "unreadable details",
  "flicker",
  "temporal jitter",
  "warped limbs",
  "mushy textures",
  "text artifacts",
  "watermarks",
]

type FastVideoDebugEvent = {
  at: string
  step: string
  details?: Record<string, unknown>
}

const createFastVideoDebug = () => {
  const traceId = crypto.randomUUID()
  const events: FastVideoDebugEvent[] = []

  const push = (step: string, details?: Record<string, unknown>) => {
    const event: FastVideoDebugEvent = { at: new Date().toISOString(), step, details }
    events.push(event)
    if (process.env.NODE_ENV !== "production") {
      console.log(`[FastVideo][${traceId}] ${step}`, details || {})
    }
  }

  return {
    traceId,
    events,
    push,
  }
}

async function ensureSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
}

async function resolveKieConfig(userId?: string | null) {
  const supabase = await createClient()
  const { data: providerRow } = await supabase
    .from("providers")
    .select("id, slug")
    .eq("slug", "kie")
    .eq("is_active", true)
    .maybeSingle()

  let apiKey = process.env.KIE_AI_API_KEY

  if (!apiKey && userId && providerRow?.id) {
    const { data: userKey } = await supabase
      .from("user_api_keys")
      .select("encrypted_key")
      .eq("user_id", userId)
      .eq("provider_id", providerRow.id)
      .maybeSingle()

    if (userKey?.encrypted_key) {
      apiKey = decrypt(userKey.encrypted_key) || undefined
    }
  }

  if (!apiKey) return { error: "Kie.ai API key missing. Add KIE_AI_API_KEY or connect provider key in settings." }

  return { data: { apiKey, providerId: providerRow?.id || null } }
}

function cleanClause(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim()
}

function dedupeClauses(parts: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const part of parts) {
    const normalized = cleanClause(part)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }

  return out
}

function trimPromptBySegments(parts: string[], limit: number): string {
  const kept: string[] = []
  for (const part of parts) {
    const candidate = [...kept, part].join(", ")
    if (candidate.length > limit) break
    kept.push(part)
  }
  const merged = kept.join(", ")
  return merged.length <= limit ? merged : `${merged.slice(0, Math.max(0, limit - 3))}...`
}

function inferSubjectClass(subject: string): "product" | "portrait" | "vehicle" | "environment" | "action" {
  const s = subject.toLowerCase()
  if (/(jacket|shoe|sneaker|dress|watch|perfume|product|bottle|bag|hoodie|fashion)/i.test(s)) return "product"
  if (/(car|bike|motorcycle|vehicle|truck|drift|racing)/i.test(s)) return "vehicle"
  if (/(fight|run|chase|explosion|stunt|parkour|sprint)/i.test(s)) return "action"
  if (/(cityscape|landscape|forest|mountain|ocean|street|architecture|interior)/i.test(s)) return "environment"
  return "portrait"
}

function buildSubjectDirectives(subject: string, variation: FastVideoVariation): string[] {
  const cls = inferSubjectClass(subject)

  if (cls === "product") {
    return [
      "hero product framing with clear silhouette and material texture readability",
      "controlled highlight roll-off and edge separation",
      variation === "creative"
        ? "bold premium ad choreography while preserving product geometry"
        : "stable geometry and logo readability across all frames",
    ]
  }

  if (cls === "vehicle") {
    return [
      "vehicle body lines remain coherent during motion",
      "ground contact and wheel geometry stay physically plausible",
      variation === "strict"
        ? "predictable camera path for clean editorial continuity"
        : "dynamic parallax with controlled motion blur",
    ]
  }

  if (cls === "action") {
    return [
      "strong subject legibility during fast movement",
      "clear action axis and screen direction continuity",
      variation === "strict"
        ? "stabilized framing priority with minimal scene drift"
        : "kinetic camera energy without losing subject clarity",
    ]
  }

  if (cls === "environment") {
    return [
      "depth-rich foreground-midground-background layering",
      "atmospheric perspective and scale readability",
      "clean horizon and architectural line integrity",
    ]
  }

  return [
    "facial and body identity consistency across all frames",
    "natural skin rendering and stable proportions",
    variation === "creative"
      ? "expressive cinematic stylization while preserving subject identity"
      : "subtle cinematic realism with controlled movement",
  ]
}

function buildAspectDirective(aspectRatio: FastVideoRequest["prompt_inputs"]["aspect_ratio"]): string {
  if (aspectRatio === "9:16") return "vertical composition optimized for mobile-safe framing"
  if (aspectRatio === "21:9") return "ultra-wide cinematic composition with strong lateral balance"
  if (aspectRatio === "1:1" || aspectRatio === "4:5") return "center-weighted framing optimized for social crop safety"
  return "landscape cinematic composition with balanced headroom and lead room"
}

function buildVariationNegatives(variation: FastVideoVariation): string[] {
  if (variation === "strict") {
    return ["identity drift", "camera instability", "frame-to-frame inconsistency"]
  }
  if (variation === "creative") {
    return ["over-chaotic motion", "incoherent perspective jumps", "subject obliteration"]
  }
  return ["over-processing", "unnatural sharpening halos", "inconsistent exposure flicker"]
}

function assembleFastVideoPrompt(payload: FastVideoRequest, safeDuration: number) {
  const { prompt_inputs } = payload
  const style = findStylePreset(prompt_inputs.style_preset_id)
  const motion = findMotionPreset(prompt_inputs.motion_preset_id)
  const subject = cleanClause(prompt_inputs.text_subject)
  const subjectDirectives = buildSubjectDirectives(subject, prompt_inputs.variation_setting)
  const aspectDirective = buildAspectDirective(prompt_inputs.aspect_ratio)

  const parts = [subject]
  if (style?.styleTokens) parts.push(style.styleTokens)
  if (motion?.motionTokens) parts.push(motion.motionTokens)
  parts.push(...subjectDirectives)
  parts.push(aspectDirective)
  parts.push(`duration ${safeDuration}s with coherent start-middle-end motion arc`)
  parts.push(VARIATION_HINTS[prompt_inputs.variation_setting])
  parts.push(...BASE_QUALITY_TOKENS)

  const uniquePromptParts = dedupeClauses(parts)
  const prompt = trimPromptBySegments(uniquePromptParts, 1100)

  const negativePrompt = dedupeClauses([
    ...(style?.negativeTokens ? style.negativeTokens.split(",") : []),
    ...BASE_NEGATIVE_TOKENS,
    ...buildVariationNegatives(prompt_inputs.variation_setting),
  ]).join(", ")

  return {
    prompt,
    negativePrompt,
    style,
    motion,
  }
}

const persistRemoteMedia = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    url?: string
    userId: string
    shotId: string
    kind: "image" | "video"
  }
) => {
  if (!input.url) return null
  if (input.url.includes("/storage/v1/object/public/renders/")) return input.url

  try {
    const response = await fetch(input.url)
    if (!response.ok) return input.url

    const contentTypeHeader = response.headers.get("content-type") || ""
    const contentType = contentTypeHeader || (input.kind === "video" ? "video/mp4" : "image/png")
    const ext =
      input.kind === "video"
        ? "mp4"
        : contentType.includes("jpeg") || contentType.includes("jpg")
          ? "jpg"
          : contentType.includes("webp")
            ? "webp"
            : "png"

    const key = `${input.userId}/fast-video/${input.shotId}/${Date.now()}-${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await response.arrayBuffer())

    const { error } = await supabase.storage.from("renders").upload(key, buffer, { contentType, upsert: false })
    if (error) return input.url

    const {
      data: { publicUrl },
    } = supabase.storage.from("renders").getPublicUrl(key)

    return publicUrl || input.url
  } catch {
    return input.url
  }
}

export async function generateFastVideo(input: unknown) {
  const debug = createFastVideoDebug()
  debug.push("request.received")

  const parsed = fastVideoRequestSchema.safeParse(input)
  if (!parsed.success) {
    debug.push("request.invalid", { issue: parsed.error.issues[0]?.message || "Invalid request payload" })
    return { error: parsed.error.issues[0]?.message || "Invalid request payload" }
  }

  const payload = parsed.data
  const safeDuration = Math.max(5, Math.min(15, payload.settings.duration_seconds || 5))
  debug.push("request.validated", {
    hasReference: Boolean(payload.prompt_inputs.reference_image),
    model: payload.settings.model?.trim() || null,
    durationSeconds: safeDuration,
    aspectRatio: payload.prompt_inputs.aspect_ratio,
  })
  const { supabase, user } = await ensureSession()
  if (!user) {
    debug.push("session.missing_user")
    return { error: "Unauthorized" }
  }
  debug.push("session.resolved", { userId: user.id })

  const quota = await consumeUsageQuota(supabase, user.id, "fast_video")
  if (!quota.allowed) {
    debug.push("quota.denied", { feature: "fast_video", message: quota.message || null })
    return { error: quota.message || "Fast Track limit reached for your current plan." }
  }

  const kie = await resolveKieConfig(user.id)
  if (!kie.data) {
    debug.push("provider.missing_key", { message: kie.error || "Kie key missing" })
    return { error: kie.error }
  }
  debug.push("provider.ready", { providerId: kie.data.providerId })

  const composed = assembleFastVideoPrompt(payload, safeDuration)
  const compliance = enforcePromptCompliance({
    prompt: composed.prompt,
    negativePrompt: composed.negativePrompt,
    outputType: "video",
  })
  if (compliance.blocked) {
    debug.push("prompt.blocked", { reason: compliance.reason || "Prompt blocked by compliance guardrails" })
    return { error: compliance.reason || "Prompt blocked by safety guardrails. Revise and retry." }
  }
  debug.push("prompt.assembled", {
    promptLength: compliance.prompt.length,
    negativePromptLength: compliance.negativePrompt.length,
  })

  try {
    const provider = ProviderFactory.create("kie", { apiKey: kie.data.apiKey })
    debug.push("provider.generate.start")
    const result = await provider.generate({
      prompt: compliance.prompt,
      negative_prompt: compliance.negativePrompt,
      image_prompt: payload.prompt_inputs.reference_image || undefined,
      output_type: "video",
      aspect_ratio: payload.prompt_inputs.aspect_ratio,
      duration_seconds: safeDuration,
      model: payload.settings.model?.trim() || undefined,
    })
    debug.push("provider.generate.done", {
      status: result.status,
      taskId: result.provider_check_id || result.id || null,
      url: result.url || null,
      providerDebug: result.debug || null,
    })

    if (result.status === "failed") {
      const normalizedError = normalizeGenerationError(result.error, "Fast video generation failed")
      debug.push("provider.generate.failed", { error: normalizedError, rawError: result.error || null })
      return { error: normalizedError }
    }

    const stableUrl = await persistRemoteMedia(supabase, {
      url: result.url,
      userId: user.id,
      shotId: result.provider_check_id || crypto.randomUUID(),
      kind: "video",
    })
    debug.push("media.persist.complete", {
      hadProviderUrl: Boolean(result.url),
      persistedUrl: stableUrl || null,
    })

    return {
      data: {
        taskId: result.provider_check_id || result.id || null,
        status: result.status,
        url: stableUrl || result.url || null,
        prompt: compliance.prompt,
        negativePrompt: compliance.negativePrompt,
        stylePresetName: composed.style?.name || null,
        motionPresetName: composed.motion?.name || null,
        durationSeconds: safeDuration,
        model: payload.settings.model?.trim() || null,
        debug: {
          traceId: debug.traceId,
          events: debug.events,
        },
      },
    }
  } catch (error: unknown) {
    const message = normalizeGenerationError(
      error instanceof Error ? error.message : undefined,
      "Fast video generation failed"
    )
    debug.push("provider.generate.exception", { message })
    return { error: message }
  }
}

export async function pollFastVideoStatus(taskId: string, traceId?: string) {
  const debug = createFastVideoDebug()
  const activeTraceId = traceId || debug.traceId
  if (!taskId?.trim()) return { error: "Missing task id" }
  debug.push("poll.received", { taskId, traceId: activeTraceId })

  const { user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }
  debug.push("poll.session.resolved", { userId: user.id })

  const kie = await resolveKieConfig(user.id)
  if (!kie.data) return { error: kie.error }
  debug.push("poll.provider.ready")

  try {
    const provider = ProviderFactory.create("kie", { apiKey: kie.data.apiKey })
    if (!provider.checkStatus) return { error: "Provider does not support polling" }

    const result = await provider.checkStatus(taskId)
    debug.push("poll.provider.status", {
      status: result.status,
      url: result.url || null,
      error: result.error || null,
      providerDebug: result.debug || null,
    })
    if (result.status === "failed") {
      const normalizedError = normalizeGenerationError(result.error, "Generation failed")
      return {
        data: {
          status: "failed",
          url: null,
          error: normalizedError,
          debug: { traceId: activeTraceId, events: debug.events },
        },
      }
    }

    if (result.status === "completed" && !result.url) {
      debug.push("poll.waiting_for_url")
      return {
        data: {
          status: "processing",
          url: null,
          message: "Finalizing video file...",
          waitingForUrl: true,
          debug: { traceId: activeTraceId, events: debug.events },
        },
      }
    }

    // Return provider URL immediately for responsive playback.
    // Persisting large remote videos here can block for many seconds and cause overlapping poll calls.
    const stableUrl = result.url || null
    debug.push("poll.media.persist.complete", {
      providerUrl: result.url || null,
      stableUrl,
      persisted: false,
    })

    return {
      data: {
        status: result.status,
        url: stableUrl || result.url || null,
        debug: { traceId: activeTraceId, events: debug.events },
      },
    }
  } catch (error: unknown) {
    const message = normalizeGenerationError(error instanceof Error ? error.message : undefined, "Polling failed")
    debug.push("poll.exception", { message })
    return { error: message }
  }
}

export async function promoteFastVideoToScene(input: {
  sceneId: string
  name?: string
  subject: string
  finalPrompt: string
  outputUrl: string
  aspectRatio: string
  durationSeconds: number
  stylePresetId?: string | null
  motionPresetId?: string | null
  variationSetting: FastVideoVariation
}) {
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const { data: scene } = await supabase
    .from("scenes")
    .select("id, project_id, projects!inner(user_id)")
    .eq("id", input.sceneId)
    .eq("projects.user_id", user.id)
    .maybeSingle()

  if (!scene?.id) {
    return { error: "Scene not found or access denied" }
  }

  const sequenceOrder = await ShotRepo.getNextSequenceOrder(input.sceneId)

  const shotName = input.name?.trim() || `Fast Video: ${input.subject.slice(0, 36)}`
  const settings = {
    aspect_ratio: input.aspectRatio,
    duration_seconds: input.durationSeconds,
    style_preset_id: input.stylePresetId || null,
    motion_preset_id: input.motionPresetId || null,
    variation: input.variationSetting,
    source: "fast_video",
  }

  const { data: shot, error: shotError } = await supabase
    .from("shots")
    .insert({
      scene_id: input.sceneId,
      name: shotName,
      description: input.subject,
      shot_type: "Fast Track Video",
      camera_movement: findMotionPreset(input.motionPresetId)?.name || null,
      estimated_duration: input.durationSeconds,
      generation_settings: settings,
      prompt_text: input.finalPrompt,
      sequence_order: sequenceOrder,
    })
    .select("id")
    .single()

  if (shotError || !shot?.id) {
    return { error: shotError?.message || "Failed to create promoted shot" }
  }

  const kie = await resolveKieConfig(user.id)

  const { error: generationError } = await supabase.from("shot_generations").insert({
    shot_id: shot.id,
    prompt: input.finalPrompt,
    provider_id: kie.data?.providerId || null,
    status: "completed",
    output_url: input.outputUrl,
    parameters: settings,
  })

  if (generationError) {
    return { error: generationError.message }
  }

  revalidatePath(`/dashboard/projects/${scene.project_id}/scenes/${input.sceneId}`)
  revalidatePath(`/dashboard/projects/${scene.project_id}`)
  revalidatePath("/dashboard/gallery")

  return { data: { shotId: shot.id, projectId: scene.project_id } }
}

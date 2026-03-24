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

const VARIATION_HINTS: Record<FastVideoVariation, string> = {
  strict: "preserve subject identity and scene composition with minimal deviation",
  balanced: "maintain core subject while allowing moderate cinematic interpretation",
  creative: "allow expressive cinematic reinterpretation while preserving primary subject intent",
}

async function ensureSession() {
  const supabase = await createClient()
  let {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const { data } = await supabase.auth.signInAnonymously()
    user = data.user
  }

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

function assembleFastVideoPrompt(payload: FastVideoRequest) {
  const { prompt_inputs } = payload
  const style = findStylePreset(prompt_inputs.style_preset_id)
  const motion = findMotionPreset(prompt_inputs.motion_preset_id)

  const parts = [prompt_inputs.text_subject.trim()]
  if (style?.styleTokens) parts.push(style.styleTokens)
  if (motion?.motionTokens) parts.push(motion.motionTokens)
  parts.push(VARIATION_HINTS[prompt_inputs.variation_setting])
  parts.push("cinematic continuity, clean composition, high production value")

  const prompt = parts.filter(Boolean).join(", ")
  const negativePrompt = [style?.negativeTokens, "distorted anatomy, broken geometry, unreadable details"]
    .filter(Boolean)
    .join(", ")

  const trimmedPrompt = prompt.length > 1100 ? `${prompt.slice(0, 1097)}...` : prompt

  return {
    prompt: trimmedPrompt,
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
  const parsed = fastVideoRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid request payload" }
  }

  const payload = parsed.data
  const safeDuration = Math.max(5, Math.min(15, payload.settings.duration_seconds || 5))
  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const kie = await resolveKieConfig(user.id)
  if (!kie.data) return { error: kie.error }

  const composed = assembleFastVideoPrompt(payload)

  try {
    const provider = ProviderFactory.create("kie", { apiKey: kie.data.apiKey })
    const result = await provider.generate({
      prompt: composed.prompt,
      negative_prompt: composed.negativePrompt,
      image_prompt: payload.prompt_inputs.reference_image || undefined,
      output_type: "video",
      aspect_ratio: payload.prompt_inputs.aspect_ratio,
      duration_seconds: safeDuration,
      model: payload.settings.model?.trim() || undefined,
    })

    if (result.status === "failed") {
      return { error: result.error || "Fast video generation failed" }
    }

    const stableUrl = await persistRemoteMedia(supabase, {
      url: result.url,
      userId: user.id,
      shotId: result.provider_check_id || crypto.randomUUID(),
      kind: "video",
    })

    return {
      data: {
        taskId: result.provider_check_id || result.id || null,
        status: result.status,
        url: stableUrl || result.url || null,
        prompt: composed.prompt,
        negativePrompt: composed.negativePrompt,
        stylePresetName: composed.style?.name || null,
        motionPresetName: composed.motion?.name || null,
        durationSeconds: safeDuration,
        model: payload.settings.model?.trim() || null,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Fast video generation failed"
    return { error: message }
  }
}

export async function pollFastVideoStatus(taskId: string) {
  if (!taskId?.trim()) return { error: "Missing task id" }

  const { supabase, user } = await ensureSession()
  if (!user) return { error: "Unauthorized" }

  const kie = await resolveKieConfig(user.id)
  if (!kie.data) return { error: kie.error }

  try {
    const provider = ProviderFactory.create("kie", { apiKey: kie.data.apiKey })
    if (!provider.checkStatus) return { error: "Provider does not support polling" }

    const result = await provider.checkStatus(taskId)
    if (result.status === "failed") {
      return { data: { status: "failed", url: null, error: result.error || "Generation failed" } }
    }

    const stableUrl = await persistRemoteMedia(supabase, {
      url: result.url,
      userId: user.id,
      shotId: taskId,
      kind: "video",
    })

    return {
      data: {
        status: result.status,
        url: stableUrl || result.url || null,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Polling failed"
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

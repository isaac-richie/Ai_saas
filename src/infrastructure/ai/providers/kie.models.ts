export type KieMediaType = "image" | "video";

export interface KieModelDefinition {
  slug: string;
  type: KieMediaType;
  label: string;
  mode: "text-to-image" | "image-to-video" | "text-to-video";
}

// Curated list, re-verified against Kie on 2026-10-17. Any valid Kie Market slug can still be passed directly.
export const KIE_MODEL_CATALOG: KieModelDefinition[] = [
  {
    slug: "kling/v2-5-turbo-text-to-video-pro",
    type: "video",
    label: "Kling 2.5 Turbo (T2V Pro)",
    mode: "text-to-video",
  },
  {
    slug: "kling/v2-5-turbo-image-to-video-pro",
    type: "video",
    label: "Kling 2.5 Turbo (I2V Pro)",
    mode: "image-to-video",
  },
  {
    slug: "kling/v2-1-master-image-to-video",
    type: "video",
    label: "Kling 2.1 Master (I2V)",
    mode: "image-to-video",
  },
  {
    slug: "kling-3.0/video",
    type: "video",
    label: "Kling 3.0 (Video)",
    mode: "image-to-video",
  },
  {
    slug: "bytedance/seedance-2-5",
    type: "video",
    label: "Bytedance Seedance 2.5",
    mode: "text-to-video",
  },
  {
    slug: "bytedance/seedance-2",
    type: "video",
    label: "Bytedance Seedance 2.0",
    mode: "text-to-video",
  },
  {
    slug: "bytedance/seedance-2-fast",
    type: "video",
    label: "Bytedance Seedance 2.0 Fast",
    mode: "text-to-video",
  },
  {
    slug: "hailuo/2-3-image-to-video-pro",
    type: "video",
    label: "Hailuo 2.3 Pro (I2V)",
    mode: "image-to-video",
  },
  {
    slug: "wan/2-2-a14b-text-to-video-turbo",
    type: "video",
    label: "Wan 2.2 A14B (T2V Turbo)",
    mode: "text-to-video",
  },
  {
    slug: "gpt-image/1.5",
    type: "image",
    label: "GPT Image 1.5",
    mode: "text-to-image",
  },
  {
    slug: "nano-banana-pro",
    type: "image",
    label: "Nano Banana Pro",
    mode: "text-to-image",
  },
];

export const DEFAULT_KIE_IMAGE_MODEL =
  process.env.KIE_DEFAULT_IMAGE_MODEL || "gpt-image/1.5";
/** Used when a GPT Image take fails (e.g. rate-limited) so the creator still gets images. */
export const FALLBACK_KIE_IMAGE_MODEL = "nano-banana-pro";
export const DEFAULT_KIE_VIDEO_MODEL_I2V =
  process.env.KIE_DEFAULT_VIDEO_MODEL_I2V
  || process.env.KIE_DEFAULT_VIDEO_MODEL
  || "kling-3.0/video";
export const DEFAULT_KIE_VIDEO_MODEL_T2V =
  process.env.KIE_DEFAULT_VIDEO_MODEL_T2V
  || "kling-3.0/video";

/**
 * Slugs Kie no longer serves (it answers "model name not supported"), mapped to today's equivalent.
 * Shots saved with an old model keep working instead of failing with "model not available".
 */
export const RETIRED_KIE_MODELS: Record<string, string> = {
  "qwen/qwen-image": "nano-banana-pro",
  "seedream/seedream-4.0": "nano-banana-pro",
  "flux/flux-2-0": "nano-banana-pro",
  "black-forest-labs/flux-1-1-pro": "nano-banana-pro",
  "flux-1.1-pro": "nano-banana-pro",
  "nano-banana": "nano-banana-pro",
  "kling-3.0": "kling-3.0/video",
};

/** Today's Kie slug for a requested model: retired slugs and other providers' model names are replaced. */
export function currentKieModel(model: string, fallbackImageModel = "gpt-image/1.5"): string {
  const slug = model.trim();
  const retired = RETIRED_KIE_MODELS[slug.toLowerCase()];
  if (retired) return retired;
  // OpenAI image names (dall-e-3, gpt-image-1.5) are not Kie slugs; Kie's GPT Image is "gpt-image/1.5".
  if (/^(dall-e|gpt-image-\d)/i.test(slug)) return fallbackImageModel;
  return slug;
}

export function inferKieOutputType(model?: string): KieMediaType | null {
  if (!model) return null;
  const normalized = model.toLowerCase();
  if (
    normalized.includes("video") ||
    normalized.includes("veo") ||
    normalized.includes("kling") ||
    normalized.includes("runway") ||
    normalized.includes("seedance")
  ) {
    return "video";
  }
  if (
    normalized.includes("image") ||
    normalized.includes("flux") ||
    normalized.includes("qwen") ||
    normalized.includes("banana") ||
    normalized.includes("seedream")
  ) {
    return "image";
  }
  return null;
}

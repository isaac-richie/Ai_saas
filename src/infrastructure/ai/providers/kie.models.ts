export type KieMediaType = "image" | "video";

export interface KieModelDefinition {
  slug: string;
  type: KieMediaType;
  label: string;
  mode: "text-to-image" | "image-to-video" | "text-to-video";
}

// Curated starter list. Any valid Kie Market model slug can still be passed directly.
export const KIE_MODEL_CATALOG: KieModelDefinition[] = [
  {
    slug: "qwen/qwen-image",
    type: "image",
    label: "Qwen Image",
    mode: "text-to-image",
  },
  {
    slug: "seedream/seedream-4.0",
    type: "image",
    label: "Seedream 4.0",
    mode: "text-to-image",
  },
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
    slug: "runway/gen4_turbo_image",
    type: "video",
    label: "Runway Gen-4 Turbo (I2V)",
    mode: "image-to-video",
  },
];

export const DEFAULT_KIE_IMAGE_MODEL =
  process.env.KIE_DEFAULT_IMAGE_MODEL || "qwen/qwen-image";
export const DEFAULT_KIE_VIDEO_MODEL_I2V =
  process.env.KIE_DEFAULT_VIDEO_MODEL_I2V
  || process.env.KIE_DEFAULT_VIDEO_MODEL
  || "kling/v2-5-turbo-image-to-video-pro";
export const DEFAULT_KIE_VIDEO_MODEL_T2V =
  process.env.KIE_DEFAULT_VIDEO_MODEL_T2V
  || "kling/v2-5-turbo-text-to-video-pro";

export function inferKieOutputType(model?: string): KieMediaType | null {
  if (!model) return null;
  const normalized = model.toLowerCase();
  if (
    normalized.includes("video") ||
    normalized.includes("veo") ||
    normalized.includes("kling") ||
    normalized.includes("runway")
  ) {
    return "video";
  }
  if (normalized.includes("image") || normalized.includes("flux") || normalized.includes("qwen")) {
    return "image";
  }
  return null;
}

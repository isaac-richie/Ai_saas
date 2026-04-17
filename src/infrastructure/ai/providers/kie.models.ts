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
    slug: "kling-3.0/video",
    type: "video",
    label: "Kling 3.0 (Video)",
    mode: "image-to-video",
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
    slug: "sora-2-text-to-video",
    type: "video",
    label: "Sora 2 (T2V)",
    mode: "text-to-video",
  },
  {
    slug: "sora-2-image-to-video",
    type: "video",
    label: "Sora 2 (I2V)",
    mode: "image-to-video",
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
    slug: "flux/flux-2-0",
    type: "image",
    label: "Flux 2.0 Pro",
    mode: "text-to-image",
  },
  {
    slug: "black-forest-labs/flux-1-1-pro",
    type: "image",
    label: "Flux 1.1 Pro (BFL)",
    mode: "text-to-image",
  },
  {
    slug: "flux-1.1-pro",
    type: "image",
    label: "Flux 1.1 Pro (Standard)",
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
  process.env.KIE_DEFAULT_IMAGE_MODEL || "nano-banana-pro";
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

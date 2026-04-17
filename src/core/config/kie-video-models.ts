export type KieVideoModelFamilyId = "kling" | "seedance" | "sora";

export type KieVideoModelFamily = {
  id: KieVideoModelFamilyId;
  label: string;
  description: string;
  t2vModel: string;
  i2vModel: string;
};

export const KIE_VIDEO_MODEL_FAMILIES: KieVideoModelFamily[] = [
  {
    id: "kling",
    label: "Kling 2.5 Turbo",
    description: "Balanced cinematic quality and reliable motion.",
    t2vModel: "kling/v2-5-turbo-text-to-video-pro",
    i2vModel: "kling/v2-5-turbo-image-to-video-pro",
  },
  {
    id: "seedance",
    label: "Bytedance Seedance 2",
    description: "Fast, punchy renders and strong stylization.",
    t2vModel: "bytedance/seedance-2",
    i2vModel: "bytedance/seedance-2",
  },
  {
    id: "sora",
    label: "Sora 2",
    description: "High-end narrative motion and scene coherence.",
    t2vModel: "sora-2-text-to-video",
    i2vModel: "sora-2-image-to-video",
  },
];

export const DEFAULT_KIE_VIDEO_MODEL_FAMILY: KieVideoModelFamilyId = "kling";

export function getKieVideoModelFamily(id?: string | null): KieVideoModelFamily {
  return KIE_VIDEO_MODEL_FAMILIES.find((family) => family.id === id) || KIE_VIDEO_MODEL_FAMILIES[0];
}

export function resolveKieVideoModelByFamily(input: {
  familyId?: string | null;
  useImageToVideo?: boolean;
}) {
  const family = getKieVideoModelFamily(input.familyId);
  return input.useImageToVideo ? family.i2vModel : family.t2vModel;
}


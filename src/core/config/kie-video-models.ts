export type KieVideoModelFamilyId = "kling" | "seedance";

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
    label: "Kling",
    description: "Balanced cinematic quality; supports multiple visual reference sets.",
    t2vModel: "kling/v2-5-turbo-text-to-video-pro",
    i2vModel: "kling-3.0/video",
  },
  {
    id: "seedance",
    label: "Seedance",
    description: "Fast, punchy renders and strong stylization.",
    t2vModel: "bytedance/seedance-2",
    i2vModel: "bytedance/seedance-2",
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

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
    label: "Kling 3.0 Pro",
    description: "Kling's best: steady photoreal motion, native sound, 5 or 10 s, multi-image character sets.",
    t2vModel: "kling-3.0/video",
    i2vModel: "kling-3.0/video",
  },
  {
    id: "seedance",
    label: "Seedance 2.5",
    description: "ByteDance's newest: cinematic, stylised motion with native sound, 4 to 15 s.",
    t2vModel: "bytedance/seedance-2-5",
    i2vModel: "bytedance/seedance-2-5",
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

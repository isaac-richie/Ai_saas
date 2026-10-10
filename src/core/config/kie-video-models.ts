export type KieVideoModelFamilyId = "kling" | "seedance";

export type KieVideoModelFamily = {
  id: KieVideoModelFamilyId;
  label: string;
  description: string;
  t2vModel: string;
  i2vModel: string;
};

/** Every video in the app (Create, Studio, campaigns, longer films) renders on Seedance 2.5 via Kie. */
export const SEEDANCE_25_MODEL = "bytedance/seedance-2-5";

const SEEDANCE_25: KieVideoModelFamily = {
  id: "seedance",
  label: "Seedance 2.5",
  description: "ByteDance's newest video model: cinematic motion, native sound, 4–15 s.",
  t2vModel: SEEDANCE_25_MODEL,
  i2vModel: SEEDANCE_25_MODEL,
};

/** The one family offered in pickers. "kling" stays in the type only so older saved shots still load. */
export const KIE_VIDEO_MODEL_FAMILIES: KieVideoModelFamily[] = [SEEDANCE_25];

export const DEFAULT_KIE_VIDEO_MODEL_FAMILY: KieVideoModelFamilyId = "seedance";

/** Any id, including a legacy "kling" selection, resolves to Seedance 2.5. */
export function getKieVideoModelFamily(id?: string | null): KieVideoModelFamily {
  void id;
  return SEEDANCE_25;
}

export function resolveKieVideoModelByFamily(input: {
  familyId?: string | null;
  useImageToVideo?: boolean;
}) {
  const family = getKieVideoModelFamily(input.familyId);
  return input.useImageToVideo ? family.i2vModel : family.t2vModel;
}

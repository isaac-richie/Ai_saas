export type KieVideoModelFamilyId = "kling" | "seedance";

export type KieVideoModelFamily = {
  id: KieVideoModelFamilyId;
  label: string;
  description: string;
  t2vModel: string;
  i2vModel: string;
  /** Clip length range Kie accepts for this model, in whole seconds. */
  minSeconds: number;
  maxSeconds: number;
};

export const KIE_VIDEO_MODEL_FAMILIES: KieVideoModelFamily[] = [
  {
    id: "kling",
    label: "Kling 3.0 Pro",
    description: "Kling's best: steady photoreal motion, native sound, 3 to 15 s, multi-image character sets.",
    t2vModel: "kling-3.0/video",
    i2vModel: "kling-3.0/video",
    // docs.kie.ai/market/kling/kling-3-0: duration "3" to "15".
    minSeconds: 3,
    maxSeconds: 15,
  },
  {
    id: "seedance",
    label: "Seedance 2.5",
    description: "ByteDance's newest: cinematic, stylised motion with native sound, 4 to 30 s.",
    t2vModel: "bytedance/seedance-2-5",
    i2vModel: "bytedance/seedance-2-5",
    // docs.kie.ai/market/bytedance/seedance-2-5: duration 4 to 30.
    minSeconds: 4,
    maxSeconds: 30,
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

/** Longest clip any Fast Track model can make. */
export const MAX_FAST_TRACK_SECONDS = Math.max(...KIE_VIDEO_MODEL_FAMILIES.map((family) => family.maxSeconds));
export const MIN_FAST_TRACK_SECONDS = Math.min(...KIE_VIDEO_MODEL_FAMILIES.map((family) => family.minSeconds));

/** Finds the family for a Kie model id such as "kling-3.0/video". */
export function getKieVideoModelFamilyByModel(model?: string | null): KieVideoModelFamily | null {
  const normalized = model?.trim().toLowerCase();
  if (!normalized) return null;
  return KIE_VIDEO_MODEL_FAMILIES.find((family) => family.t2vModel === normalized || family.i2vModel === normalized) ?? null;
}

/** Snaps a requested length into the range the family accepts. */
export function clampDurationForFamily(seconds: number | null | undefined, family: KieVideoModelFamily): number {
  const whole = typeof seconds === "number" && Number.isFinite(seconds) ? Math.round(seconds) : 5;
  return Math.max(family.minSeconds, Math.min(family.maxSeconds, whole));
}

/** Seconds of video covered by one Fast Track allowance unit. */
export const FAST_TRACK_SECONDS_PER_UNIT = 10;

/** Fast Track charges one unit per 10 seconds started: 1–10 s is 1, 11–20 s is 2, 21–30 s is 3. */
export function fastTrackUnitsForDuration(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / FAST_TRACK_SECONDS_PER_UNIT));
}

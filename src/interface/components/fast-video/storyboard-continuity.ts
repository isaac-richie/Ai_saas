import type { MediaReference } from "@/core/validation/media-reference"
import type { ShotFrame } from "@/core/validation/shot-frames"
import type { StoryboardItem } from "./StoryboardPanel"

/**
 * Storyboard continuity rules. Kept free of runtime imports so the rules can
 * be tested on their own: the UI stays simple, these keep it honest.
 */
export type ShotReview = "draft" | "generating" | "review" | "approved" | "failed"

export const SHOT_REVIEW_LABELS: Record<ShotReview, string> = {
  draft: "Draft",
  generating: "Generating",
  review: "Ready for review",
  approved: "Approved",
  failed: "Failed",
}

/** Older items carry no review state: a shot with video is ready for review. */
export function shotReview(item: Pick<StoryboardItem, "review" | "url" | "approvedTakeId">): ShotReview {
  if (item.review) return item.review
  if (item.approvedTakeId) return "approved"
  return item.url ? "review" : "draft"
}

export type ReferenceChipKind = "character" | "product" | "location" | "other"
export type ReferenceChip = {
  id: string
  label: string
  role: string
  kind: ReferenceChipKind
  locked: boolean
  /** "sent": the image goes to the video model; "guide": written guidance only; "off": not used. */
  binding: "sent" | "guide" | "off"
}

const CHIP_KINDS: Record<string, ReferenceChipKind> = {
  character: "character", wardrobe: "character",
  product: "product", prop: "product", branding: "product",
  location: "location", lighting: "location",
}
const KIND_ORDER: ReferenceChipKind[] = ["character", "product", "location", "other"]

export function referenceChips(refs: MediaReference[] | undefined): ReferenceChip[] {
  return (refs ?? [])
    .map((ref) => ({
      id: ref.id,
      label: ref.name.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 32) || ref.role,
      role: ref.role,
      kind: CHIP_KINDS[ref.role] ?? "other",
      locked: ref.locked,
      binding: !ref.applied ? "off" as const : ref.target === "provider" ? "sent" as const : "guide" as const,
    }))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
}

export type ContinueResult = { ok: true; item: StoryboardItem } | { ok: false; reason: string }

/**
 * Continue to next shot: a visual continuation. The approved end frame becomes
 * the new shot's start frame, and locked references carry over.
 */
export function continueFromShot(previous: StoryboardItem, ids: { itemId: string; frameId: string }, now: string): ContinueResult {
  if (shotReview(previous) !== "approved") return { ok: false, reason: "Approve this take first, so the next shot knows where to start." }
  if (!previous.endFrame) return { ok: false, reason: "This shot has no saved end frame yet. Approve the take again to capture it." }
  const startFrame: ShotFrame = {
    ...previous.endFrame,
    id: ids.frameId,
    sourceType: "previous_shot",
    sourceShotId: previous.id,
    sourceLabel: previous.subject.slice(0, 120),
  }
  return {
    ok: true,
    item: {
      id: ids.itemId,
      sourceClipId: null,
      url: "",
      subject: "Next shot",
      prompt: "",
      direction: "",
      durationSeconds: previous.durationSeconds,
      modelFamilyId: previous.modelFamilyId,
      sceneGroup: previous.sceneGroup,
      note: "",
      status: "draft",
      review: "draft",
      createdAt: now,
      mediaReferences: (previous.mediaReferences ?? []).filter((ref) => ref.locked),
      startFrame,
      endFrame: null,
      previousItemId: previous.id,
    },
  }
}

/** Insert directly after the shot it continues from, keeping storyboard order meaningful. */
export function insertAfter(items: StoryboardItem[], afterId: string, item: StoryboardItem): StoryboardItem[] {
  const index = items.findIndex((entry) => entry.id === afterId)
  if (index < 0) return [...items, item]
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)]
}

/** Only approved shots render, in storyboard order. */
export function approvedForRender<T extends Pick<StoryboardItem, "review" | "url" | "approvedTakeId" | "sourceClipId">>(items: T[]): T[] {
  return items.filter((item) => shotReview(item) === "approved" && Boolean(item.approvedTakeId || item.sourceClipId))
}

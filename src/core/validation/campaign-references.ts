import { z } from "zod"

/**
 * Optional Character and Product references for the Campaign Director.
 * Additive to the generic UGC workflow: a campaign with neither reference
 * behaves exactly as before.
 */
export const CAMPAIGN_REFERENCE_TYPES = ["character", "product"] as const
export const CHARACTER_ROLES = ["presenter", "customer", "influencer", "actor", "background character"] as const
export const REFERENCE_INFLUENCES = ["low", "medium", "high"] as const

export const CAMPAIGN_STYLES = [
  // Default: lets the planner vary formats across assets, as generic UGC always has.
  { id: "mixed", label: "Mixed formats" },
  { id: "ugc_testimonial", label: "UGC testimonial" },
  { id: "unboxing_reaction", label: "Unboxing & reaction" },
  { id: "demo_tutorial", label: "Demo / how-to" },
  { id: "day_in_life", label: "Day in the life" },
  { id: "problem_solution", label: "Problem → solution" },
  { id: "founder_selfie", label: "Founder selfie" },
] as const

export const PRODUCT_RELATIONSHIPS = [
  { id: "holding", label: "Holding product" },
  { id: "using", label: "Using product" },
  { id: "applying", label: "Applying product" },
  { id: "reacting", label: "Reacting to product" },
  { id: "demonstrating", label: "Demonstrating product" },
  { id: "product_hero", label: "Product-only hero shot" },
  { id: "testimonial_visible", label: "Testimonial with product visible" },
  { id: "intro_then_closeup", label: "Introduces product, then close-up" },
] as const

export const DEFAULT_PRODUCT_FORBIDDEN_CHANGES = ["altered logo", "changed cap or lid", "missing label", "distorted shape"]

const assetPath = z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/, "Reference images must be stored in your private reference library.")
const note = (max: number) => z.string().trim().max(max).nullish()

export const characterLocksSchema = z.object({
  identity: z.boolean().default(true),
  wardrobe: z.boolean().default(true),
  expression: z.boolean().default(false),
  movement: z.boolean().default(false),
})
export const productLocksSchema = z.object({
  shape: z.boolean().default(true),
  logoText: z.boolean().default(true),
  colour: z.boolean().default(true),
  packaging: z.boolean().default(true),
})

export const characterReferenceSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("character"),
  name: z.string().trim().min(1).max(80),
  assetPaths: z.array(assetPath).min(1).max(4),
  role: z.enum(CHARACTER_ROLES).default("presenter"),
  ageRange: note(60),
  appearance: note(300),
  wardrobe: note(300),
  voice: note(200),
  expressionAction: note(200),
  locks: characterLocksSchema.default({ identity: true, wardrobe: true, expression: false, movement: false }),
  influence: z.enum(REFERENCE_INFLUENCES).default("medium"),
  rightsConfirmed: z.boolean(),
})
export type CharacterReference = z.infer<typeof characterReferenceSchema>

export const productReferenceSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("product"),
  name: z.string().trim().min(1).max(80),
  assetPaths: z.array(assetPath).min(1).max(4),
  variant: note(120),
  logoText: note(160),
  colourMaterial: note(200),
  packaging: note(200),
  keyFeatures: note(300),
  forbiddenChanges: z.array(z.string().trim().min(2).max(80)).max(8).default(DEFAULT_PRODUCT_FORBIDDEN_CHANGES),
  locks: productLocksSchema.default({ shape: true, logoText: true, colour: true, packaging: true }),
  influence: z.enum(REFERENCE_INFLUENCES).default("medium"),
  rightsConfirmed: z.boolean(),
})
export type ProductReference = z.infer<typeof productReferenceSchema>

export const campaignReferencesSchema = z.object({
  character: characterReferenceSchema.nullish(),
  product: productReferenceSchema.nullish(),
  style: z.enum(CAMPAIGN_STYLES.map((style) => style.id) as [string, ...string[]]).default("mixed"),
  relationship: z.enum(PRODUCT_RELATIONSHIPS.map((item) => item.id) as [string, ...string[]]).default("testimonial_visible"),
})
export type CampaignReferences = z.infer<typeof campaignReferencesSchema>

export const EMPTY_CAMPAIGN_REFERENCES: CampaignReferences = { character: null, product: null, style: "mixed", relationship: "testimonial_visible" }

export type CampaignMode = "generic" | "character" | "product" | "character_product"

export function campaignMode(refs: CampaignReferences | null | undefined): CampaignMode {
  if (refs?.character && refs?.product) return "character_product"
  if (refs?.character) return "character"
  if (refs?.product) return "product"
  return "generic"
}

export const CAMPAIGN_MODE_LABELS: Record<CampaignMode, string> = {
  generic: "Generic UGC",
  character: "Character-led UGC",
  product: "Product-led UGC",
  character_product: "Character + Product campaign",
}

export type ReferenceCapability = {
  supported: boolean
  characterReference: boolean
  productReference: boolean
  imageReference: boolean
  videoReference: boolean
  maxReferences: number
  maxImageMb: number
  durations: string
  /** How references are delivered, in plain words for the UI. */
  method: string
  maxImagesPerReference: number
  minImagesPerReference: number
  note: string
}

/**
 * Verified against Kie's docs. Seedance 2 accepts up to 9 reference images in
 * multimodal mode. Kling 3.0 "elements" need 2-4 JPG/PNG images each, at most
 * three elements, and require an opening image alongside them.
 */
export const REFERENCE_CAPABILITIES: Record<string, ReferenceCapability> = {
  seedance: {
    supported: true, characterReference: true, productReference: true, imageReference: true, videoReference: true,
    maxReferences: 9, maxImageMb: 30, durations: "4 to 15 s", method: "reference images", minImagesPerReference: 1, maxImagesPerReference: 4,
    note: "Seedance receives every character and product image as a reference.",
  },
  kling: {
    supported: true, characterReference: true, productReference: true, imageReference: true, videoReference: false,
    maxReferences: 3, maxImageMb: 10, durations: "5 or 10 s", method: "identity elements", minImagesPerReference: 2, maxImagesPerReference: 4,
    note: "Kling needs 2 to 4 JPG or PNG images per reference and opens each video on the lead reference's first image.",
  },
}

export function referenceCapability(familyId: string | null | undefined): ReferenceCapability {
  return REFERENCE_CAPABILITIES[familyId ?? ""] ?? {
    supported: false, characterReference: false, productReference: false, imageReference: false, videoReference: false,
    maxReferences: 0, maxImageMb: 0, durations: "", method: "none", minImagesPerReference: 0, maxImagesPerReference: 0,
    note: "This model cannot take character or product references.",
  }
}

/** Problems that must be fixed before planning or spending credits. Never drops references silently. */
export function campaignReferenceIssues(refs: CampaignReferences | null | undefined, familyId: string | null | undefined): string[] {
  const active = [refs?.character, refs?.product].filter((ref): ref is CharacterReference | ProductReference => Boolean(ref))
  if (!active.length) return []
  const issues: string[] = []
  const capability = referenceCapability(familyId)
  for (const ref of active) {
    if (!ref.rightsConfirmed) issues.push(ref.type === "character"
      ? `Confirm you have permission to use ${ref.name}'s likeness.`
      : `Confirm you own or are authorised to use the ${ref.name} images and branding.`)
  }
  if (!capability.supported) {
    issues.push(`${capability.note} Choose Kling or Seedance, or remove the references.`)
    return issues
  }
  for (const ref of active) {
    if (ref.assetPaths.length < capability.minImagesPerReference) {
      issues.push(`${ref.name}: ${capability.note} Add ${capability.minImagesPerReference - ref.assetPaths.length} more image${capability.minImagesPerReference - ref.assetPaths.length === 1 ? "" : "s"} or switch to Seedance.`)
    }
    if (familyId === "kling" && ref.assetPaths.some((path) => path.endsWith(".webp"))) {
      issues.push(`${ref.name}: Kling references must be JPG or PNG. Replace the WebP images or switch to Seedance.`)
    }
  }
  return issues
}

const STYLE_LABEL = Object.fromEntries(CAMPAIGN_STYLES.map((style) => [style.id, style.label]))
const RELATIONSHIP_LABEL = Object.fromEntries(PRODUCT_RELATIONSHIPS.map((item) => [item.id, item.label]))

/** Structured, model-facing statement of the locks. Empty for generic UGC. */
export function campaignLockDirective(refs: CampaignReferences | null | undefined): string {
  const mode = campaignMode(refs)
  if (mode === "generic") return ""
  const parts: string[] = []
  const character = refs?.character
  const product = refs?.product
  if (character) {
    const locked = [character.locks.identity && "identity", character.locks.wardrobe && "wardrobe", character.locks.expression && "expression", character.locks.movement && "movement"].filter(Boolean)
    parts.push(`Character ${character.name} (${character.role}) from the character reference images${locked.length ? `, locked: ${locked.join(", ")}` : ""}`)
  }
  if (product) {
    const locked = [product.locks.shape && "shape", product.locks.logoText && "logo and label text", product.locks.colour && "colour", product.locks.packaging && "packaging"].filter(Boolean)
    parts.push(`Product ${product.name}${product.variant ? ` (${product.variant})` : ""} from the product reference images${locked.length ? `, locked: ${locked.join(", ")}` : ""}`)
  }
  if (character && product) parts.push(`Interaction: ${RELATIONSHIP_LABEL[refs!.relationship] ?? refs!.relationship}`)
  if (refs!.style !== "mixed") parts.push(`Style: ${STYLE_LABEL[refs!.style] ?? refs!.style}`)
  return parts.join(". ")
}

/** Negative constraints implied by the active locks. */
export function campaignLockNegatives(refs: CampaignReferences | null | undefined): string[] {
  const negatives: string[] = []
  if (refs?.character?.locks.identity) negatives.push("face drift", "different person")
  if (refs?.character?.locks.wardrobe) negatives.push("wardrobe change")
  if (refs?.product) {
    if (refs.product.locks.logoText) negatives.push("changed product label", "invented logos", "unreadable text")
    if (refs.product.locks.shape) negatives.push("distorted product shape")
    if (refs.product.locks.colour) negatives.push("wrong product colour")
    if (refs.product.locks.packaging) negatives.push("changed packaging")
    negatives.push("product replaced by another object", "competitor logos", ...refs.product.forbiddenChanges)
  }
  return [...new Set(negatives)]
}

export function validateOwnedCampaignReferences(input: unknown, userId: string): CampaignReferences {
  const refs = campaignReferencesSchema.parse(input ?? EMPTY_CAMPAIGN_REFERENCES)
  for (const ref of [refs.character, refs.product]) {
    if (ref && ref.assetPaths.some((path) => !path.startsWith(`${userId}/`))) throw new Error("A campaign reference belongs to another account. Re-add it from your library.")
  }
  return refs
}

/** Short lock summary for asset cards, e.g. "Character lock · Product lock". */
export function lockSummary(refs: CampaignReferences | null | undefined) {
  return {
    characterLock: Boolean(refs?.character?.locks.identity),
    // Same rule as the card badge: the product is locked only when shape and logo/text both are.
    productLock: Boolean(refs?.product && refs.product.locks.shape && refs.product.locks.logoText),
  }
}

/** The review checklist from the spec; results are recorded per asset by the user. */
export const QUALITY_CHECKS = [
  { id: "character_identity", label: "Character face / identity recognisable", needs: "character" },
  { id: "character_wardrobe", label: "Character wardrobe matches lock", needs: "character" },
  { id: "product_shape", label: "Product shape matches reference", needs: "product" },
  { id: "product_text", label: "Product logo / text not changed or invented", needs: "product" },
  { id: "product_not_replaced", label: "Product not replaced by another object", needs: "product" },
  { id: "hands_clear", label: "Hands do not obscure the product unnecessarily", needs: "product" },
  { id: "product_visible", label: "Product visible for the requested action", needs: "product" },
  { id: "lighting_consistent", label: "Lighting and colour consistent", needs: null },
  { id: "no_competitor_logos", label: "No accidental competitor logos", needs: null },
  { id: "no_unapproved_claims", label: "No unapproved claims or captions", needs: null },
  { id: "style_match", label: "Output matches selected UGC style", needs: null },
] as const

export const qualityFlagsSchema = z.record(z.string(), z.enum(["pass", "flag"]))
export type QualityFlags = z.infer<typeof qualityFlagsSchema>

export function applicableQualityChecks(refs: CampaignReferences | null | undefined) {
  return QUALITY_CHECKS.filter((check) => check.needs === null || (check.needs === "character" ? Boolean(refs?.character) : Boolean(refs?.product)))
}

/**
 * The model a reference campaign uses unless the creator overrides it in
 * Advanced. Seedance is the confirmed default because it works with a single
 * image per reference; Kling needs 2 to 4 JPG/PNG images each.
 */
export function recommendedCampaignModel(refs: CampaignReferences | null | undefined, override?: string | null): string | null {
  if (override === "kling" || override === "seedance") return "seedance"
  return campaignMode(refs) === "generic" ? null : "seedance"
}

const RELATIONSHIP_HINTS: [RegExp, string][] = [
  [/\b(apply|applies|applying|rub|spray|spritz|put on)\b/i, "applying"],
  [/\b(unbox|unboxing|react|reaction|reacting|surprised)\b/i, "reacting"],
  [/\b(demo|demonstrat|show(s|ing)? how|tutorial|how to)\b/i, "demonstrating"],
  [/\b(hold|holds|holding)\b/i, "holding"],
  [/\b(use|uses|using|try|tries|trying)\b/i, "using"],
  [/\b(hero shot|product only|packshot|product shot)\b/i, "product_hero"],
  [/\b(introduc|then (a )?close.?up)\b/i, "intro_then_closeup"],
]

/** Sensible default interaction from the campaign prompt; testimonial otherwise. */
export function inferRelationship(prompt: string): string {
  for (const [pattern, relationship] of RELATIONSHIP_HINTS) if (pattern.test(prompt)) return relationship
  return "testimonial_visible"
}

/** Plain-language plan summary for the default view (no technical metadata). */
export function campaignPlanSummary(input: {
  title: string
  refs: CampaignReferences | null | undefined
  assetCount: number
  aspectRatio: string
}) {
  const orientation = input.aspectRatio === "9:16" ? "vertical" : input.aspectRatio === "1:1" ? "square" : input.aspectRatio === "16:9" ? "widescreen" : input.aspectRatio
  return [
    { label: "Campaign", value: input.title },
    { label: "Character", value: input.refs?.character ? "Attached" : "None" },
    { label: "Product", value: input.refs?.product ? "Attached" : "None" },
    { label: "Assets", value: `${input.assetCount} ${orientation} video${input.assetCount === 1 ? "" : "s"}` },
    { label: "Style", value: CAMPAIGN_STYLES.find((style) => style.id === input.refs?.style)?.label ?? "Mixed formats" },
  ]
}

/** Brand-safety checks that need a human review before an asset is used. */
export const BRAND_SAFETY_CHECKS = ["no_competitor_logos", "no_unapproved_claims"] as const

export function brandSafetyReviewed(flags: QualityFlags | null | undefined) {
  return BRAND_SAFETY_CHECKS.every((id) => flags?.[id] === "pass")
}

/** Campaign metadata carried by assets that leave the campaign (Use / Add / Add All). */
export const campaignProvenanceSchema = z.object({
  campaignId: z.string().max(80).nullish(),
  campaignItemId: z.string().max(80).nullish(),
  characterReferenceId: z.string().uuid().nullish(),
  productReferenceId: z.string().uuid().nullish(),
  style: z.string().max(40).nullish(),
  relationship: z.string().max(40).nullish(),
  model: z.string().max(120).nullish(),
})
export type CampaignProvenance = z.infer<typeof campaignProvenanceSchema>

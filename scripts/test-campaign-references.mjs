import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const transpile = (code) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const refsModule = { exports: {} }
vm.runInNewContext(transpile(read("../src/core/validation/campaign-references.ts")), { module: refsModule, exports: refsModule.exports, require: createRequire(import.meta.url) })
const {
  campaignReferencesSchema, campaignMode, campaignReferenceIssues, campaignLockDirective, campaignLockNegatives,
  validateOwnedCampaignReferences, applicableQualityChecks, referenceCapability, EMPTY_CAMPAIGN_REFERENCES, lockSummary,
} = refsModule.exports

const user = "123e4567-e89b-42d3-a456-426614174000"
const path = (n, ext = "jpg") => `${user}/123e4567-e89b-42d3-a456-4266141745${String(n).padStart(2, "0")}.${ext}`
const character = (extra = {}) => ({
  id: "123e4567-e89b-42d3-a456-426614174601", type: "character", name: "Maya", assetPaths: [path(1), path(2)], role: "presenter",
  locks: { identity: true, wardrobe: true, expression: false, movement: false }, influence: "high", rightsConfirmed: true, ...extra,
})
const product = (extra = {}) => ({
  id: "123e4567-e89b-42d3-a456-426614174602", type: "product", name: "Glow Serum", variant: "30 ml", assetPaths: [path(3), path(4)],
  forbiddenChanges: ["altered logo", "changed cap"], locks: { shape: true, logoText: true, colour: true, packaging: true },
  influence: "high", rightsConfirmed: true, ...extra,
})
const refs = (extra = {}) => campaignReferencesSchema.parse({ character: null, product: null, ...extra })

// ─── Generic UGC stays exactly as before ──────────────────────────────────
test("generic UGC has no references, no directive, no extra negatives and no blocking issues", () => {
  const generic = refs()
  assert.equal(campaignMode(generic), "generic")
  assert.equal(campaignLockDirective(generic), "")
  assert.equal(campaignLockNegatives(generic).length, 0)
  for (const family of ["kling", "seedance", "unknown"]) assert.equal(campaignReferenceIssues(generic, family).length, 0)
  assert.equal(campaignMode(EMPTY_CAMPAIGN_REFERENCES), "generic")
  assert.equal(campaignMode(null), "generic")
})

test("the four campaign modes follow which references are present", () => {
  assert.equal(campaignMode(refs({ character: character() })), "character")
  assert.equal(campaignMode(refs({ product: product() })), "product")
  assert.equal(campaignMode(refs({ character: character(), product: product() })), "character_product")
})

// ─── Rights, ownership and model capability ───────────────────────────────
test("unconfirmed rights block planning and generation for each reference", () => {
  const issues = campaignReferenceIssues(refs({ character: character({ rightsConfirmed: false }), product: product({ rightsConfirmed: false }) }), "seedance")
  assert.ok(issues.some((issue) => /permission to use Maya's likeness/.test(issue)))
  assert.ok(issues.some((issue) => /authorised to use the Glow Serum images and branding/.test(issue)))
})

test("references from another account are refused", () => {
  const other = "923e4567-e89b-42d3-a456-426614174000"
  assert.throws(() => validateOwnedCampaignReferences(refs({ product: product({ assetPaths: [`${other}/123e4567-e89b-42d3-a456-426614174599.jpg`] }) }), user), /another account/)
  assert.equal(validateOwnedCampaignReferences(refs({ character: character() }), user).character.name, "Maya")
})

test("Seedance accepts single-image references; Kling explains its 2-image and JPG/PNG rules instead of dropping them", () => {
  const single = refs({ character: character({ assetPaths: [path(1)] }) })
  assert.equal(campaignReferenceIssues(single, "seedance").length, 0)
  const kling = campaignReferenceIssues(single, "kling")
  assert.equal(kling.length, 1)
  assert.match(kling[0], /Add 1 more image or switch to Seedance/)
  const webp = campaignReferenceIssues(refs({ product: product({ assetPaths: [path(3, "webp"), path(4)] }) }), "kling")
  assert.ok(webp.some((issue) => /must be JPG or PNG/.test(issue)))
  assert.equal(campaignReferenceIssues(refs({ character: character(), product: product() }), "kling").length, 0)
})

test("an unsupported model gives a clear warning rather than silently removing references", () => {
  const issues = campaignReferenceIssues(refs({ product: product() }), "veo")
  assert.ok(issues.some((issue) => /cannot take character or product references/.test(issue)))
  assert.equal(referenceCapability("veo").supported, false)
})

test("schema rejects oversized or malformed references", () => {
  assert.equal(campaignReferencesSchema.safeParse({ character: character({ assetPaths: [path(1), path(2), path(3), path(4), path(5)] }) }).success, false)
  assert.equal(campaignReferencesSchema.safeParse({ character: character({ assetPaths: [] }) }).success, false)
  assert.equal(campaignReferencesSchema.safeParse({ product: product({ assetPaths: ["https://evil.example/a.jpg"] }) }).success, false)
  assert.equal(campaignReferencesSchema.safeParse({ character: character({ role: "villain" }) }).success, false)
  assert.equal(campaignReferencesSchema.safeParse({ character: character(), relationship: "juggling" }).success, false)
})

// ─── Locks reach the model ────────────────────────────────────────────────
test("the lock directive names locks, interaction and style", () => {
  const directive = campaignLockDirective(refs({ character: character(), product: product(), relationship: "demonstrating", style: "demo_tutorial" }))
  assert.match(directive, /Character Maya \(presenter\) from the character reference images, locked: identity, wardrobe/)
  assert.match(directive, /Product Glow Serum \(30 ml\) from the product reference images, locked: shape, logo and label text, colour, packaging/)
  assert.match(directive, /Interaction: Demonstrating product/)
  assert.match(directive, /Style: Demo \/ how-to/)
  assert.doesNotMatch(campaignLockDirective(refs({ product: product() })), /Interaction/, "interaction only applies with both references")
})

test("locked products carry protective negatives; removing the lock removes those guarantees", () => {
  const locked = campaignLockNegatives(refs({ character: character(), product: product() }))
  for (const term of ["face drift", "changed product label", "distorted product shape", "competitor logos", "altered logo", "changed cap"]) assert.ok(locked.includes(term), term)
  const unlocked = campaignLockNegatives(refs({ product: product({ locks: { shape: false, logoText: false, colour: false, packaging: false } }) }))
  assert.ok(!unlocked.includes("changed product label"))
  assert.equal(lockSummary(refs({ product: product({ locks: { shape: false, logoText: true, colour: true, packaging: true } }) })).productLock, false)
  assert.equal(lockSummary(refs({ character: character(), product: product() })).characterLock, true)
})

test("the review checklist only asks about references that exist", () => {
  const generic = applicableQualityChecks(refs()).map((check) => check.id)
  assert.ok(generic.includes("no_unapproved_claims") && !generic.includes("product_shape") && !generic.includes("character_identity"))
  const both = applicableQualityChecks(refs({ character: character(), product: product() }))
  assert.equal(both.length, 11, "the spec's full checklist")
})

// ─── Provider mapping ────────────────────────────────────────────────────
const kieModule = { exports: {} }
vm.runInNewContext(transpile(read("../src/infrastructure/ai/providers/kie.provider.ts")), {
  module: kieModule, exports: kieModule.exports,
  require: (id) => {
    if (id === "../base.provider") return { BaseProvider: class { constructor(config) { this.config = config } } }
    if (id === "./kie.models") return { DEFAULT_KIE_IMAGE_MODEL: "x", DEFAULT_KIE_VIDEO_MODEL_I2V: "kling-3.0/video", DEFAULT_KIE_VIDEO_MODEL_T2V: "t2v", inferKieOutputType: () => "video" }
    if (id === "@/core/utils/ai/error-normalization") return { normalizeGenerationError: (message) => message }
    throw new Error(`Unexpected import: ${id}`)
  },
})
const provider = new kieModule.exports.KieProvider({ apiKey: "test" })

test("Seedance receives every reference image, capped at its documented 9", () => {
  const urls = Array.from({ length: 11 }, (_, index) => `https://s/${index}.jpg`)
  const input = provider.buildMarketInput({ prompt: "A UGC ad", output_type: "video", duration_seconds: 5, reference_image_urls: urls }, "bytedance/seedance-2")
  assert.equal(input.reference_image_urls.length, 9)
  assert.equal(input.first_frame_url, undefined)
})

test("Seedance references are never mixed with a first frame", () => {
  const input = provider.buildMarketInput({ prompt: "A UGC ad", output_type: "video", duration_seconds: 5, image_prompt: "https://s/start.jpg", reference_image_urls: ["https://s/a.jpg"] }, "bytedance/seedance-2")
  assert.equal(input.first_frame_url, "https://s/start.jpg")
  assert.equal(input.reference_image_urls, undefined)
  assert.equal(provider.buildMarketInput({ prompt: "x", output_type: "video", reference_image_urls: ["https://s/a.jpg"] }, "kling-3.0/video").reference_image_urls, undefined, "Kling uses elements, not reference_image_urls")
})

// ─── Generation request, credits and persistence ─────────────────────────
const action = read("../src/core/actions/fast-video.ts")
const generate = action.slice(action.indexOf("export async function generateFastVideo"), action.indexOf("export async function pollFastVideoStatus"))

test("references are validated, rights-checked and signed before credits are reserved", () => {
  const reserve = generate.indexOf("reserveUsageQuota(")
  for (const step of ["validateOwnedCampaignReferences(", "campaignReferenceIssues(campaign, family?.id)", "signReference", "Seedance cannot combine character / product references"]) {
    const at = generate.indexOf(step)
    assert.ok(at > 0 && at < reserve, `${step} must run before credits are reserved`)
  }
  assert.match(generate, /Nothing was charged/)
})

test("both references go into every request, by model", () => {
  assert.match(generate, /for \(const ref of ordered\) for \(const path of ref\.assetPaths\) referenceImageUrls\.push/)
  assert.match(generate, /reference_elements = await Promise\.all\(ordered\.map/)
  assert.match(generate, /payload\.prompt_inputs\.reference_image = payload\.prompt_inputs\.reference_elements\[0\]\.image_urls\[0\]/, "Kling opens on the lead reference")
  assert.match(generate, /reference_image_urls: referenceImageUrls/)
  assert.match(generate, /campaignLockDirective\(campaign\)/)
  assert.match(generate, /campaignLockNegatives\(campaignRefs\)/)
  assert.match(generate, /characterReferenceId: campaignRefs\?\.character\?\.id \|\| null/)
  assert.match(generate, /productReferenceId: campaignRefs\?\.product\?\.id \|\| null/)
})

test("planning sees reference details but never image paths, and rights are checked first", () => {
  const service = read("../src/core/services/studio-ad/studio-ad.service.ts")
  assert.match(service, /input: \{ \.\.\.input, references: undefined \}/)
  assert.doesNotMatch(service.slice(service.indexOf("function campaignReferenceBrief"), service.indexOf("function buildCampaignUserPrompt")), /assetPaths/)
  assert.match(service, /Fill productInteraction, shotSequence and callToAction/)
  const route = read("../src/app/api/ad/direct-campaign/route.ts")
  assert.match(route, /before planning/)
})

test("campaign item updates never wipe a finished clip's URL or task", () => {
  const source = read("../src/core/actions/studio-ad-campaigns.ts")
  const tree = ts.createSourceFile("c.ts", source, ts.ScriptTarget.Latest, true)
  const fn = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "updateStudioAdCampaignItem").getText(tree)
  const writes = []
  const db = { from: () => {
    const query = { update: (value) => { writes.push(value); return query }, eq: () => query, select: () => query, single: async () => ({ data: { campaign_id: null }, error: null }), then: (resolve) => resolve({ error: null }) }
    return query
  } }
  const loaded = { exports: {} }
  vm.runInNewContext(transpile(`${fn}\nmodule.exports = { updateStudioAdCampaignItem }`), {
    module: loaded, exports: loaded.exports, revalidatePath: () => {}, refreshCampaignStatus: async () => {},
    ensureSession: async () => ({ supabase: db, error: null }), MISSING_COLUMN: [],
    qualityFlagsSchema: { safeParse: (value) => ({ success: true, data: value }) },
  })
  return loaded.exports.updateStudioAdCampaignItem({ itemId: "i", status: "completed", taskId: undefined, traceId: undefined, outputUrl: undefined, error: undefined, qualityFlags: { product_shape: "pass" } }).then(() => {
    const main = writes.find((value) => "status" in value)
    assert.ok(main, "the main update ran")
    for (const value of writes) {
      assert.equal("output_url" in value, false, "an undefined URL must not be written as null")
      assert.equal("task_id" in value, false)
    }
    assert.equal(main.status, "completed")
    assert.ok(writes.some((value) => value.quality_flags?.product_shape === "pass"), "review flags are saved")
  })
})

test("references, plan fields and review flags persist; a missing migration degrades gracefully", () => {
  const actions = read("../src/core/actions/studio-ad-campaigns.ts")
  assert.match(actions, /await recordCampaignReferences\(supabase, user\.id, campaign\.id, withReferences, input\.plan, createdItems \|\| \[\]\)/)
  assert.match(actions, /apply migration 0035/)
  const model = read("../src/interface/components/fast-video/fast-video-studio.model.ts")
  assert.match(model, /export function campaignRowReferences/)
  assert.match(model, /characterReferenceId: item\.character_reference_id \?\? null/)
  const sql = read("../src/infrastructure/supabase/migrations/0035_campaign_references.sql")
  assert.match(sql, /create table if not exists public\.campaign_references/)
  assert.match(sql, /rights_confirmed boolean not null check \(rights_confirmed\)/)
  for (const column of ["character_reference_id", "product_reference_id", "quality_flags", "product_interaction", "call_to_action"]) assert.match(sql, new RegExp(`add column if not exists ${column}`))
  assert.doesNotMatch(sql, /\bdrop table\b|\bdrop column\b|delete from/i)
})

// ─── UI is additive ──────────────────────────────────────────────────────
test("Campaign References sits between the brief and the asset controls; actions keep references", () => {
  const studio = read("../src/interface/components/fast-video/FastVideoStudio.tsx")
  const brief = studio.indexOf('placeholder="Create 3 UGC videos for..."')
  const panel = studio.indexOf("<CampaignReferencesPanel")
  const assets = studio.indexOf("[2, 3, 4, 5].map((count)")
  assert.ok(brief > 0 && brief < panel && panel < assets)
  assert.match(studio, /\.\.\.\(activeReferences \? \{ campaign_references: activeReferences \} : \{\}\)/, "Generate and Retry send the references")
  assert.match(studio, /\.\.\.\(activeReferences \? \{ references: activeReferences \} : \{\}\)/, "Plan sends the references")
  assert.match(studio, /references: activeReferences,\n\s+\}\)/, "the saved campaign records the references")
  assert.match(studio, /setCampaignReferences\(campaignRowReferences\(campaign\)\)/, "reopening restores references")
  assert.match(studio, /Prompt and campaign settings copied/)
  assert.match(studio, /Review likeness, product details and any claims before publishing/)
  const panelSource = read("../src/interface/components/fast-video/CampaignReferencesPanel.tsx")
  assert.match(panelSource, /Product lock is off: product shape and label consistency are no longer guaranteed/)
  assert.match(panelSource, /I have permission to use this person's likeness/)
  assert.match(panelSource, /I own or am authorised to use these product images and branding/)
})

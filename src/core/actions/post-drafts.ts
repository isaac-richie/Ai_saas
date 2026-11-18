"use server"

import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import { createClient } from "@/infrastructure/supabase/server"
import { resolveProductionModel } from "@/core/config/production-model-routing"
import { hasBetaAccess, BETA_LOCKED_MESSAGE } from "@/core/services/beta-access"
import { checkStudioAdRateLimit } from "@/core/services/studio-ad/rate-limit"
import { isOwnRenderKey, renderKeyFromUrl } from "@/core/services/export-download"
import { readWords, transcriptView } from "@/core/services/transcript"
import type { TimelineClip } from "@/core/types/timeline"
import {
  POST_GOALS, POST_PLATFORMS, POST_WRITER_INSTRUCTIONS, buildPostContext, captionIssues, parseRenderKey, postWriterSchema, variantsFromWriter,
  type BusinessProfile, type PostGoal, type PostPlatform, type PostVariants,
} from "@/core/services/post-draft"

/**
 * Prepare a post (Growth Hub thin slice). Drafts a hook and Instagram, TikTok and LinkedIn captions for
 * a finished export, saves them, and lets the creator edit, copy and mark them as posted by hand.
 * Nothing is published, scheduled or connected to a social account.
 */

export type PostDraft = {
  id: string
  goal: PostGoal
  hooks: { family: string; text: string; why: string }[]
  variants: PostVariants
  sources: string
  claimsToCheck: string[]
  rightsConfirmedAt: string | null
  updatedAt: string
}

type Session = Awaited<ReturnType<typeof createClient>>
const NOT_READY = "Prepare a post needs a database update (migration 0059). Your video is unaffected."
const isMissingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /post_(drafts|business_profiles)/.test(error.message ?? "")))

type DraftRow = { id: string; goal: PostGoal; hooks: unknown; variants: unknown; sources: string; claims_to_check: unknown; rights_confirmed_at: string | null; updated_at: string }
const toDraft = (row: DraftRow): PostDraft => ({
  id: row.id, goal: row.goal, hooks: Array.isArray(row.hooks) ? row.hooks as PostDraft["hooks"] : [],
  variants: row.variants && typeof row.variants === "object" ? row.variants as PostVariants : {},
  sources: row.sources, claimsToCheck: Array.isArray(row.claims_to_check) ? row.claims_to_check as string[] : [],
  rightsConfirmedAt: row.rights_confirmed_at, updatedAt: row.updated_at,
})

async function signedIn() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  return { db, user }
}

/** The export's storage key, only when it is the signed-in creator's own export. */
function ownExport(url: string, userId: string) {
  const key = renderKeyFromUrl(url, process.env.NEXT_PUBLIC_SUPABASE_URL)
  return key && isOwnRenderKey(key, userId) ? key : null
}

async function loadProfile(db: Session, userId: string): Promise<{ profile: BusinessProfile | null; missing: boolean }> {
  const { data, error } = await db.from("post_business_profiles").select("business,audience,tone").eq("user_id", userId).maybeSingle()
  if (isMissingTable(error)) return { profile: null, missing: true }
  return { profile: data ? { business: data.business, audience: data.audience, tone: data.tone } : null, missing: false }
}

/** The saved draft for this export (if any) and the creator's business details. */
export async function getPostDraft(url: string): Promise<{ data?: { draft: PostDraft | null; profile: BusinessProfile | null }; error?: string }> {
  const { db, user } = await signedIn()
  if (!user) return { error: "Please sign in again." }
  const key = ownExport(url, user.id)
  if (!key) return { error: "Export this video from the editor first." }
  const [{ profile, missing }, draft] = await Promise.all([
    loadProfile(db, user.id),
    db.from("post_drafts").select("*").eq("user_id", user.id).eq("render_key", key).maybeSingle(),
  ])
  if (missing || isMissingTable(draft.error)) return { error: NOT_READY }
  if (draft.error) return { error: "Couldn't load your post draft. Try again." }
  return { data: { draft: draft.data ? toDraft(draft.data as DraftRow) : null, profile } }
}

const profileSchema = z.object({
  business: z.string().trim().max(400).default(""),
  audience: z.string().trim().max(300).default(""),
  tone: z.string().trim().max(200).default(""),
})

/** "Your business & brand": three short answers the writer uses for every post. */
export async function saveBusinessProfile(input: unknown): Promise<{ data?: BusinessProfile; error?: string }> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { error: "Keep each answer short (a sentence or two)." }
  const { db, user } = await signedIn()
  if (!user) return { error: "Please sign in again." }
  const { error } = await db.from("post_business_profiles").upsert({ user_id: user.id, ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (isMissingTable(error)) return { error: NOT_READY }
  if (error) return { error: "Couldn't save your business details. Try again." }
  return { data: parsed.data }
}

const writeSchema = z.object({ url: z.string().url(), goal: z.enum(POST_GOALS) })

/**
 * Writes (or rewrites) the hook and captions for an export, from what the edit says and shows in text.
 * The writer never watches the video, and the draft says so. Rewriting keeps any "posted" marks.
 */
export async function writePostDraft(input: unknown): Promise<{ data?: PostDraft; error?: string }> {
  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) return { error: "Choose what this post is for." }
  const { db, user } = await signedIn()
  if (!user) return { error: "Please sign in again." }
  if (!(await hasBetaAccess(user.email))) return { error: BETA_LOCKED_MESSAGE }
  const key = ownExport(parsed.data.url, user.id)
  const parts = key ? parseRenderKey(key) : null
  if (!key || !parts) return { error: "Export this video from the editor first." }
  if (!checkStudioAdRateLimit(`post-writer:${user.id}`).allowed) return { error: "Please wait a moment before writing another draft." }
  if (!process.env.OPENAI_API_KEY) return { error: "The writing assistant isn't set up on this server yet." }

  const { profile, missing } = await loadProfile(db, user.id)
  if (missing) return { error: NOT_READY }
  const { data: existing, error: existingError } = await db.from("post_drafts").select("*").eq("user_id", user.id).eq("render_key", key).maybeSingle()
  if (isMissingTable(existingError)) return { error: NOT_READY }

  // What the edit says and shows, as text: its speech, shot notes and on-screen text.
  const [{ data: timeline }, { data: project }, { data: tracks }, { data: transcripts }] = await Promise.all([
    db.from("timeline_projects").select("id,name").eq("id", parts.timelineId).maybeSingle(),
    db.from("projects").select("name").eq("id", parts.projectId).eq("user_id", user.id).maybeSingle(),
    db.from("timeline_tracks").select("id,track_type").eq("timeline_id", parts.timelineId),
    db.from("timeline_transcripts").select("source_key,language,words").eq("timeline_id", parts.timelineId),
  ])
  if (!timeline) return { error: "This export's edit is no longer available." }
  const trackIds = (tracks ?? []).map((t) => t.id as string)
  const { data: clips } = trackIds.length ? await db.from("timeline_clips").select("*").in("track_id", trackIds) : { data: [] }
  const typeOf = new Map((tracks ?? []).map((t) => [t.id as string, t.track_type as string]))
  const all = (clips ?? []) as TimelineClip[]
  const video = all.filter((c) => typeOf.get(c.track_id) === "video")
  const spoken = transcriptView(video, (transcripts ?? []).map((t) => ({ source_key: t.source_key as string, language: (t.language as string | null) ?? null, words: readWords(t.words) })))
    .flatMap((item) => (item.kind === "word" ? [item.word.text] : []))
  const meta = (c: TimelineClip) => (c.metadata ?? {}) as { shot?: { subject?: unknown; prompt?: unknown }; text?: unknown }
  const shotNotes = video.sort((a, b) => a.start_ms - b.start_ms).map((c) => {
    const shot = meta(c).shot
    return [shot?.subject, shot?.prompt].filter((v): v is string => typeof v === "string").join(": ")
  })
  const onScreen = all.filter((c) => typeOf.get(c.track_id) === "caption").map((c) => meta(c).text).filter((t): t is string => typeof t === "string")
  const { context, sources } = buildPostContext({
    title: (project?.name as string | undefined) || (timeline.name as string | undefined) || "Untitled video",
    goal: parsed.data.goal, profile, spokenWords: spoken, shotNotes, onScreenText: onScreen,
  })

  let output
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1 })
    const result = await client.responses.parse({
      model: resolveProductionModel("post-writer").model,
      store: false,
      max_output_tokens: 4000,
      instructions: POST_WRITER_INSTRUCTIONS,
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(context) }] }],
      text: { format: zodTextFormat(postWriterSchema, "post_draft") },
    }, { signal: AbortSignal.timeout(60_000) })
    output = postWriterSchema.parse(result.output_parsed)
  } catch (cause) {
    console.error("Post writer failed", { userId: user.id, error: cause instanceof Error ? cause.message.slice(0, 300) : "unknown" })
    return { error: "The writing assistant couldn't finish this time. Nothing was saved; try again." }
  }

  const previous = existing ? toDraft(existing as DraftRow) : null
  const row = {
    user_id: user.id, render_key: key, timeline_id: parts.timelineId, goal: parsed.data.goal,
    hooks: output.hooks, variants: variantsFromWriter(output, previous?.variants), sources, claims_to_check: output.claimsToCheck,
    updated_at: new Date().toISOString(),
  }
  const { data: saved, error } = await db.from("post_drafts").upsert(row, { onConflict: "user_id,render_key" }).select("*").single()
  if (error || !saved) return { error: "The draft was written but couldn't be saved. Try again." }
  return { data: toDraft(saved as DraftRow) }
}

const saveSchema = z.object({
  id: z.string().uuid(),
  variants: z.record(z.enum(POST_PLATFORMS), z.object({ caption: z.string().max(3000), postedAt: z.string().datetime().nullable().optional() })),
  rightsConfirmed: z.boolean(),
})

/** Saves the creator's edits and their rights confirmation. Captions over a platform's limit are refused. */
export async function savePostDraft(input: unknown): Promise<{ data?: PostDraft; error?: string }> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { error: "Couldn't save these captions. Check them and try again." }
  const issues = POST_PLATFORMS.flatMap((p) => (parsed.data.variants[p] ? captionIssues(p, parsed.data.variants[p]!.caption).filter((i) => !i.endsWith("is empty.")) : []))
  if (issues.length) return { error: issues[0] }
  const { db, user } = await signedIn()
  if (!user) return { error: "Please sign in again." }
  const { data, error } = await db.from("post_drafts").update({
    variants: parsed.data.variants,
    rights_confirmed_at: parsed.data.rightsConfirmed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.id).eq("user_id", user.id).select("*").maybeSingle()
  if (error || !data) return { error: "Couldn't save your draft. Your text is still here; try again." }
  return { data: toDraft(data as DraftRow) }
}

const postedSchema = z.object({ id: z.string().uuid(), platform: z.enum(POST_PLATFORMS), posted: z.boolean() })

/** "I posted it": the creator's own confirmation. It is never shown as confirmed by the platform. */
export async function markPosted(input: unknown): Promise<{ data?: PostDraft; error?: string }> {
  const parsed = postedSchema.safeParse(input)
  if (!parsed.success) return { error: "Choose a platform." }
  const { db, user } = await signedIn()
  if (!user) return { error: "Please sign in again." }
  const { data: row } = await db.from("post_drafts").select("*").eq("id", parsed.data.id).eq("user_id", user.id).maybeSingle()
  if (!row) return { error: "That draft is no longer available." }
  const draft = toDraft(row as DraftRow)
  if (!draft.rightsConfirmedAt && parsed.data.posted) return { error: "Confirm you have the rights to post this video first." }
  const platform: PostPlatform = parsed.data.platform
  const variants = { ...draft.variants, [platform]: { caption: draft.variants[platform]?.caption ?? "", postedAt: parsed.data.posted ? new Date().toISOString() : null } }
  const { data, error } = await db.from("post_drafts").update({ variants, updated_at: new Date().toISOString() }).eq("id", draft.id).eq("user_id", user.id).select("*").maybeSingle()
  if (error || !data) return { error: "Couldn't update this post. Try again." }
  return { data: toDraft(data as DraftRow) }
}

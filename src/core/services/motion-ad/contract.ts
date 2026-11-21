/**
 * The Motion Ad Director's plan contract (brief: "Agent contract"). The planning AI returns this JSON;
 * the app validates it before saving and the templates render it. Nothing the AI writes is executed:
 * it chooses from fixed moves and transitions, and the Remotion templates do the rest.
 */
import { z } from "zod"

/** How the camera moves within a shot. Every shot keeps moving; lateral moves all travel the same way. */
export const MOVES = ["drift", "push", "rise", "slide", "orbit", "settle"] as const
/** How a shot turns into the next one. No cross-dissolves. */
export const TRANSITIONS = ["zoom_through", "light_sweep", "whip", "match_cut"] as const

export const MIN_SHOTS = 5
export const MAX_SHOTS = 10
export const MIN_SHOT_S = 1.2
export const MAX_TOTAL_S = 20
export const MAX_LINE_CHARS = 42

const time = z.number().min(0).max(MAX_TOTAL_S + 5)

export const shotSchema = z.object({
  idx: z.number().int().min(1).max(MAX_SHOTS),
  name: z.string().trim().min(2).max(40),
  start_s: time,
  end_s: time,
  on_screen: z.string().trim().max(MAX_LINE_CHARS),
  motion: z.string().trim().min(3).max(160),
  move: z.enum(MOVES),
  transition: z.enum(TRANSITIONS).nullable(),
  turns_into: z.number().int().min(2).max(MAX_SHOTS).nullable(),
  image_tag: z.string().regex(/^@image([1-9]|10)$/).nullable(),
})
export type Shot = z.infer<typeof shotSchema>

export const planSchema = z.object({
  ad_id: z.string().min(1).max(64),
  total_s: z.number().min(5).max(MAX_TOTAL_S + 5),
  shots: z.array(shotSchema).min(MIN_SHOTS).max(MAX_SHOTS),
  images_needed: z.array(z.object({ shot: z.number().int().min(1).max(MAX_SHOTS), prompt: z.string().trim().min(20).max(600) })).max(MAX_SHOTS),
  voiceover: z.object({ script: z.string().trim().min(3).max(600), words: z.number().int().min(1).max(120), delivery: z.string().trim().max(200) }),
  end_card: z.object({ brand: z.string().trim().min(1).max(40), line: z.string().trim().max(60).default(""), url: z.string().trim().max(60).default("") }),
  warnings: z.array(z.string().max(300)).max(10),
})
export type Plan = z.infer<typeof planSchema>

/** Sentence case: starts with a capital (or isn't a letter), and isn't Title Case Every Word. ALL CAPS is fine for an end card. */
function sentenceCase(s: string) {
  if (!s || s === s.toUpperCase()) return true
  if (/^[a-z]/.test(s)) return false
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w))
  return !(words.length >= 4 && words.every((w) => /^[^A-Za-z]*[A-Z]/.test(w)))
}
const CLAIMS = /\b(\d+\s?%|guarantee[ds]?|#\s?1|number one|best[- ]selling|award[- ]winning|clinically|proven|\d+(\.\d+)?\s?(stars?|★)|reviews?)\b/i

/**
 * The rules the brief puts on a plan, beyond its shape. Returns plain-language problems (empty when
 * the plan is fine). `voiceS` is the uploaded voice length, when there is one.
 */
export function planProblems(plan: Plan, opts: { voiceS?: number; claimsAllowed?: string[]; fps?: number } = {}): string[] {
  const p: string[] = []
  const fps = opts.fps ?? 25
  const frame = 1 / fps
  const shots = plan.shots
  shots.forEach((s, i) => {
    if (s.idx !== i + 1) p.push(`Shot ${i + 1} is numbered ${s.idx}; shots must be numbered 1 to ${shots.length} in order.`)
    if (s.end_s - s.start_s < MIN_SHOT_S - frame) p.push(`Shot ${s.idx} lasts ${(s.end_s - s.start_s).toFixed(2)} s; each shot needs at least ${MIN_SHOT_S} s.`)
    if (i === 0 && Math.abs(s.start_s) > frame) p.push("The first shot must start at 0 s.")
    if (i > 0 && Math.abs(s.start_s - shots[i - 1].end_s) > frame) p.push(`Shot ${s.idx} starts at ${s.start_s} s but shot ${s.idx - 1} ends at ${shots[i - 1].end_s} s; times must be contiguous.`)
    const last = i === shots.length - 1
    if (!last && s.turns_into !== s.idx + 1) p.push(`Shot ${s.idx} must turn into shot ${s.idx + 1}.`)
    if (!last && !s.transition) p.push(`Shot ${s.idx} needs a transition into shot ${s.idx + 1}.`)
    if (last && (s.turns_into !== null || s.transition !== null)) p.push("The last shot is the end card; it doesn't turn into anything.")
    if (!sentenceCase(s.on_screen)) p.push(`Shot ${s.idx}'s line "${s.on_screen}" should be in sentence case.`)
    const claim = s.on_screen.match(CLAIMS)
    if (claim && !(opts.claimsAllowed ?? []).some((c) => s.on_screen.toLowerCase().includes(c.toLowerCase()))) p.push(`Shot ${s.idx}'s line makes a claim ("${claim[0]}") the brief didn't supply.`)
  })
  const end = shots.at(-1)?.end_s ?? 0
  if (Math.abs(end - plan.total_s) > frame) p.push(`The shots end at ${end} s but total_s is ${plan.total_s} s.`)
  if (opts.voiceS !== undefined && Math.abs(plan.total_s - opts.voiceS) > frame) p.push(`The ad is ${plan.total_s} s but the voice is ${opts.voiceS} s; the voice length wins.`)
  const vClaim = plan.voiceover.script.match(CLAIMS)
  if (vClaim && !(opts.claimsAllowed ?? []).some((c) => plan.voiceover.script.toLowerCase().includes(c.toLowerCase()))) p.push(`The voiceover makes a claim ("${vClaim[0]}") the brief didn't supply.`)
  for (const need of plan.images_needed) {
    if (!shots.some((s) => s.idx === need.shot)) p.push(`An image prompt is for shot ${need.shot}, which doesn't exist.`)
    if (!/no text/i.test(need.prompt)) p.push(`The image prompt for shot ${need.shot} must ask for no text (AI text comes out garbled).`)
  }
  return p
}

/** Parse and check an AI reply: the shape first, then the rules. One message per problem. */
export function validatePlan(raw: unknown, opts: Parameters<typeof planProblems>[1] = {}): { ok: true; plan: Plan } | { ok: false; errors: string[] } {
  const parsed = planSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "plan"}: ${i.message}`) }
  const problems = planProblems(parsed.data, opts)
  return problems.length ? { ok: false, errors: problems } : { ok: true, plan: parsed.data }
}

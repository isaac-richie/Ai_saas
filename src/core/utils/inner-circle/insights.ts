import { INNER_CIRCLE_ANSWER_SEPARATOR, INNER_CIRCLE_PROBLEMS } from "@/core/config/inner-circle"

export type WaitlistRow = {
  id: string
  full_name: string | null
  instagram_handle: string | null
  social_handle: string | null
  feedback_text: string | null
  status: string | null
  email: string
  referral_code: string
  referred_by_code: string | null
  referral_count: number | null
  created_at: string
}

export type Member = {
  id: string
  name: string
  email: string
  handle: string | null
  code: string
  answer: string | null
  hasAccess: boolean
  joinedAt: string
  invitedBy: { id: string; name: string } | null
  /** Code from an invite link that matches no member (mistyped or shared outside the list). */
  unknownInviteCode: string | null
  invitees: { id: string; name: string; joinedAt: string; hasAccess: boolean }[]
}

const NOT_PROVIDED = "not-provided"

/** Older rows hold Instagram plus "x: @a | tiktok: @b"; newer rows hold one "@handle". */
function primaryHandle(row: WaitlistRow): string | null {
  const social = row.social_handle && row.social_handle !== NOT_PROVIDED ? row.social_handle : null
  if (social?.startsWith("@")) return social
  if (row.instagram_handle && row.instagram_handle !== NOT_PROVIDED) return `@${row.instagram_handle}`
  const legacyX = social?.match(/x: (@[a-z0-9._]+)/i)?.[1]
  return legacyX ?? (social ? `@${social}` : null)
}

function displayName(row: WaitlistRow): string {
  return primaryHandle(row) ?? row.email.split("@")[0]
}

export function buildInsights(rows: WaitlistRow[]) {
  const byCode = new Map(rows.map((row) => [row.referral_code.toUpperCase(), row]))
  const members: Member[] = rows.map((row) => {
    const inviter = row.referred_by_code ? byCode.get(row.referred_by_code.toUpperCase()) : undefined
    return {
      id: row.id,
      name: displayName(row),
      email: row.email,
      handle: primaryHandle(row),
      code: row.referral_code,
      answer: row.feedback_text?.trim() || null,
      hasAccess: row.status === "active",
      joinedAt: row.created_at,
      invitedBy: inviter && inviter.id !== row.id ? { id: inviter.id, name: displayName(inviter) } : null,
      unknownInviteCode: row.referred_by_code && !inviter ? row.referred_by_code : null,
      invitees: [],
    }
  })

  const byId = new Map(members.map((member) => [member.id, member]))
  for (const member of members) {
    if (member.invitedBy) byId.get(member.invitedBy.id)?.invitees.push({
      id: member.id, name: member.name, joinedAt: member.joinedAt, hasAccess: member.hasAccess,
    })
  }
  for (const member of members) member.invitees.sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))

  // Ranked by the people we can actually see they brought in, earliest member first on ties.
  const leaderboard = members
    .filter((member) => member.invitees.length > 0)
    .sort((a, b) => b.invitees.length - a.invitees.length || a.joinedAt.localeCompare(b.joinedAt))
    .slice(0, 10)

  const answers = members.map((member) => member.answer).filter((answer): answer is string => Boolean(answer))
  const problems = INNER_CIRCLE_PROBLEMS
    .map((label) => ({ label, count: answers.filter((answer) => answer.split(INNER_CIRCLE_ANSWER_SEPARATOR).includes(label)).length }))
    .sort((a, b) => b.count - a.count)
  // What people wrote in their own words, with the chips removed.
  const quotes = members
    .map((member) => ({
      id: member.id,
      name: member.name,
      text: (member.answer ?? "")
        .split(INNER_CIRCLE_ANSWER_SEPARATOR)
        .filter((part) => !(INNER_CIRCLE_PROBLEMS as readonly string[]).includes(part))
        .join(INNER_CIRCLE_ANSWER_SEPARATOR)
        .trim(),
      joinedAt: member.joinedAt,
    }))
    .filter((quote) => quote.text.length > 0)
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))

  const invited = members.filter((member) => member.invitedBy).length
  return {
    members: [...members].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)),
    leaderboard,
    problems,
    quotes,
    stats: {
      total: members.length,
      invited,
      withAccess: members.filter((member) => member.hasAccess).length,
      answered: answers.length,
    },
  }
}

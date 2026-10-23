"use client"

import { useMemo, useState } from "react"
import { Check, Copy, Search, Sparkles } from "lucide-react"
import { setInnerCircleAccess } from "@/core/actions/inner-circle"
import type { Member } from "@/core/utils/inner-circle/insights"

export type MemberRow = Member & { joinedLabel: string }

const FILTERS = [
  { id: "all", label: "All" },
  { id: "invited", label: "Invited" },
  { id: "waiting", label: "Waiting" },
  { id: "access", label: "Has access" },
] as const
type Filter = (typeof FILTERS)[number]["id"]

export function CopyButton({ value, label = "Copy", className = "" }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch {
          /* Clipboard blocked; the text stays visible to copy by hand. */
        }
      }}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gold-400/20 px-3 text-[12.5px] text-[#ece6d6] transition hover:border-gold-300/60 ${className}`}
    >
      {copied ? <Check className="size-3.5 text-gold-300" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  )
}

export function Monogram({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const letter = name.replace(/^@/, "").charAt(0).toUpperCase() || "•"
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full border border-gold-400/25 bg-[radial-gradient(circle_at_30%_25%,rgba(243,229,192,0.22),rgba(217,192,138,0.05))] font-medium text-gold-100 ${size === "sm" ? "size-7 text-[11px]" : "size-10 text-[14px]"}`}
    >
      {letter}
    </span>
  )
}

export function AccessButton({ id, hasAccess }: { id: string; hasAccess: boolean }) {
  return (
    <form action={setInnerCircleAccess}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={hasAccess ? "pending" : "active"} />
      <button
        type="submit"
        className={hasAccess
          ? "h-9 rounded-full border border-white/15 px-3.5 text-[12.5px] text-white/70 transition hover:border-white/35 hover:text-white"
          : "h-9 rounded-full bg-[linear-gradient(100deg,#f3e5c0,#d9c08a_45%,#b08d52)] px-3.5 text-[12.5px] font-semibold text-[#14110b] shadow-[0_8px_20px_-10px_rgba(217,192,138,0.8)] transition hover:opacity-90"}
      >
        {hasAccess ? "Remove access" : "Grant access"}
      </button>
    </form>
  )
}

export function MembersPanel({ members }: { members: MemberRow[] }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const counts = useMemo(() => ({
    all: members.length,
    invited: members.filter((member) => member.invitedBy).length,
    waiting: members.filter((member) => !member.hasAccess).length,
    access: members.filter((member) => member.hasAccess).length,
  }), [members])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return members.filter((member) => {
      if (filter === "invited" && !member.invitedBy) return false
      if (filter === "waiting" && member.hasAccess) return false
      if (filter === "access" && !member.hasAccess) return false
      if (!needle) return true
      return [member.name, member.email, member.handle, member.answer, member.invitedBy?.name]
        .some((value) => value?.toLowerCase().includes(needle))
    })
  }, [members, query, filter])

  return (
    <section aria-labelledby="members-title" className="rounded-[28px] border border-gold-400/[0.12] bg-[#111210] p-4 sm:p-6">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <h2 id="members-title" className="text-[18px] font-medium text-[#f1ece0]">Members</h2>
          <p className="mt-1 text-[13px] text-[#b0b8c4]">Grant studio access to the people you want in the beta.</p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div role="tablist" aria-label="Filter members" className="flex gap-1 overflow-x-auto rounded-full border border-white/[0.08] bg-black/30 p-1">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`h-8 shrink-0 rounded-full px-3 text-[12.5px] transition ${filter === id ? "bg-gold-300/15 text-gold-100" : "text-[#b0b8c4] hover:text-white"}`}
              >
                {label} <span className="ml-1 tabular-nums opacity-70">{counts[id]}</span>
              </button>
            ))}
          </div>
          <label className="relative block">
            <span className="sr-only">Search members</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, answer"
              className="h-10 w-full rounded-full border border-white/[0.1] bg-black/30 pl-9 pr-4 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-gold-300/60 md:w-60"
            />
          </label>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-white/[0.06]">
        {visible.length === 0 ? (
          <li className="py-10 text-center text-[14px] text-[#b0b8c4]">No members match.</li>
        ) : visible.map((member) => (
          <li key={member.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex min-w-0 flex-1 gap-3">
              <Monogram name={member.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-[15px] font-medium text-[#f1ece0]">{member.name}</span>
                  {member.hasAccess ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#b6ddd3]/10 px-2 py-0.5 text-[11.5px] text-[#b6ddd3]">
                      <span className="size-1.5 rounded-full bg-[#b6ddd3]" aria-hidden="true" /> Has access
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11.5px] text-[#b0b8c4]">Waiting</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-[#b0b8c4]">
                  {member.email}
                  {member.handle && member.handle !== member.name ? ` · ${member.handle}` : ""}
                  {" · "}
                  <time dateTime={member.joinedAt}>{member.joinedLabel}</time>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {member.invitedBy ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/25 bg-gold-300/[0.07] px-2.5 py-1 text-[12px] text-gold-100">
                      <Sparkles className="size-3" aria-hidden="true" /> Invited by {member.invitedBy.name}
                    </span>
                  ) : member.unknownInviteCode ? (
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-[#b0b8c4]" title="This invite code matches no member">
                      Invite code {member.unknownInviteCode} (no match)
                    </span>
                  ) : null}
                  {member.invitees.length > 0 ? (
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-[#d6d0c0]">
                      Brought {member.invitees.length} {member.invitees.length === 1 ? "person" : "people"}
                    </span>
                  ) : null}
                </div>
                {member.answer ? (
                  <p className="mt-2 border-l border-gold-400/30 pl-3 text-[13.5px] leading-relaxed text-[#d6d0c0]">{member.answer}</p>
                ) : null}
              </div>
            </div>
            <div className="sm:pt-1">
              <AccessButton id={member.id} hasAccess={member.hasAccess} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

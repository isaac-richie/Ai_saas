import { ArrowUpRight, ChevronDown, KeyRound, MessageSquareQuote, Sparkles, Users } from 'lucide-react';
import { buildInsights, type WaitlistRow } from '@/core/utils/inner-circle/insights';
import { AccessButton, CopyButton, MembersPanel, Monogram, type MemberRow } from '@/interface/components/admin/InnerCircleAdmin';

/** "just now", "3h ago", "2d ago", then a date. Rendered on the server so it never shifts on hydration. */
function joinedLabel(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const MEDALS = [
  'border-[#e3cf9f] bg-[radial-gradient(circle_at_30%_25%,#f6eedc,#c8a76a)] text-[#2a2112]',
  'border-[#cfd3d8] bg-[radial-gradient(circle_at_30%_25%,#f2f4f6,#9aa1ab)] text-[#1d2024]',
  'border-[#c99673] bg-[radial-gradient(circle_at_30%_25%,#f1d2bc,#9a6440)] text-[#241509]',
];

/** The admin waitlist view. The page loads the rows and checks the viewer is an admin. */
export function InnerCircleAdminView({ rows: waitlist, now, siteBaseUrl }: { rows: WaitlistRow[]; now: number; siteBaseUrl: string }) {
  const { members, leaderboard, problems, quotes, stats } = buildInsights(waitlist);
  const rows: MemberRow[] = members.map((member) => ({ ...member, joinedLabel: joinedLabel(member.joinedAt, now) }));
  const publicLink = `${siteBaseUrl}/inner-circle`;
  const topProblemCount = Math.max(1, ...problems.map((problem) => problem.count));
  const percent = (part: number) => (stats.total ? Math.round((part / stats.total) * 100) : 0);

  const tiles = [
    { label: 'Members', value: stats.total, note: 'on the waitlist', icon: Users },
    { label: 'Joined by invite', value: stats.invited, note: `${percent(stats.invited)}% of members`, icon: Sparkles },
    { label: 'Studio access', value: stats.withAccess, note: `${stats.total - stats.withAccess} waiting`, icon: KeyRound },
    { label: 'Shared a problem', value: stats.answered, note: `${percent(stats.answered)}% answered`, icon: MessageSquareQuote },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <header className="relative overflow-hidden rounded-[28px] border border-gold-400/[0.14] bg-[radial-gradient(ellipse_80%_120%_at_100%_0%,rgba(217,192,138,0.14),transparent_60%),linear-gradient(180deg,#151512,#0e0f0d)] p-5 sm:p-8">
        <div aria-hidden="true" className="absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(243,229,192,0.55),transparent)]" />
        <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-gold-400">Inner Circle · Admin</p>
            <h1 className="mt-3 text-[34px] font-medium leading-none tracking-[-0.02em] text-[#f1ece0] sm:text-[44px]">
              Your <span className="lux-serif text-gold-200">waitlist.</span>
            </h1>
            <p className="mt-3 max-w-lg text-[14.5px] leading-relaxed text-[#b0b8c4]">
              See who&apos;s joining, who brought them, and what they want from AI video. Nobody gets into the studio until you grant access.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 truncate rounded-full border border-white/10 bg-black/30 px-4 py-2 text-[12.5px] text-gold-100">{publicLink.replace(/^https?:\/\//, '')}</code>
            <div className="flex gap-2">
              <CopyButton value={publicLink} label="Copy link" />
              <a
                href="/inner-circle"
                target="_blank"
                rel="noopener"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-gold-400/20 px-3 text-[12.5px] text-[#ece6d6] transition hover:border-gold-300/60"
              >
                Open page <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles.map(({ label, value, note, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
              <dt className="flex items-start justify-between gap-2 text-[12.5px] leading-snug text-[#b0b8c4]">
                {label}
                <Icon className="size-4 shrink-0 text-gold-400/70" aria-hidden="true" />
              </dt>
              <dd className="mt-3 text-[32px] font-medium leading-none tabular-nums tracking-[-0.02em] text-[#f6eedc]">{value.toLocaleString('en')}</dd>
              <dd className="mt-2 text-[12.5px] text-white/50">{note}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <section aria-labelledby="inviters-title" className="min-w-0 rounded-[28px] border border-gold-400/[0.12] bg-[#111210] p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="inviters-title" className="text-[18px] font-medium text-[#f1ece0]">Top inviters</h2>
            <span className="text-[12.5px] text-[#b0b8c4]">People who joined through their link</span>
          </div>
          {leaderboard.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-[14.5px] text-[#d6d0c0]">No one has joined through an invite yet.</p>
              <p className="mt-1 text-[13px] text-[#b0b8c4]">Every member gets a personal link on the success screen. Their friends show up here.</p>
            </div>
          ) : (
            <ol className="mt-5 space-y-3">
              {leaderboard.map((member, index) => (
                <li key={member.id}>
                  <details className="group rounded-2xl border border-white/[0.07] bg-black/20 open:border-gold-400/25 open:bg-gold-300/[0.03]">
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-3 sm:p-4 [&::-webkit-details-marker]:hidden">
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-full border text-[12px] font-semibold tabular-nums ${MEDALS[index] ?? 'border-white/15 bg-white/[0.04] text-[#d6d0c0]'}`}
                        aria-label={`Rank ${index + 1}`}
                      >
                        {index + 1}
                      </span>
                      <Monogram name={member.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-[#f1ece0]">{member.name}</span>
                        <span className="block truncate text-[12.5px] text-[#b0b8c4]">{member.email}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[22px] font-medium leading-none tabular-nums text-gold-100">{member.invitees.length}</span>
                        <span className="text-[11.5px] text-[#b0b8c4]">{member.invitees.length === 1 ? 'person' : 'people'}</span>
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-white/40 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="border-t border-white/[0.06] px-3 pb-4 pt-3 sm:px-4">
                      <ul className="space-y-2">
                        {member.invitees.map((invitee) => (
                          <li key={invitee.id} className="flex items-center gap-2.5 text-[13.5px]">
                            <Monogram name={invitee.name} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-[#ece6d6]">{invitee.name}</span>
                            <time dateTime={invitee.joinedAt} className="text-[12px] text-[#b0b8c4]">{joinedLabel(invitee.joinedAt, now)}</time>
                            <span className={`text-[12px] ${invitee.hasAccess ? 'text-[#b6ddd3]' : 'text-white/45'}`}>{invitee.hasAccess ? 'Has access' : 'Waiting'}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-gold-100">
                          {`${siteBaseUrl.replace(/^https?:\/\//, '')}/inner-circle?ref=${member.code}`}
                        </code>
                        <CopyButton value={`${siteBaseUrl}/inner-circle?ref=${member.code}`} label="Copy their link" />
                        <AccessButton id={member.id} hasAccess={member.hasAccess} />
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="wants-title" className="min-w-0 rounded-[28px] border border-gold-400/[0.12] bg-[#111210] p-4 sm:p-6">
          <h2 id="wants-title" className="text-[18px] font-medium text-[#f1ece0]">What creators want fixed</h2>
          <p className="mt-1 text-[12.5px] text-[#b0b8c4]">
            Members who picked each problem · {stats.answered} of {stats.total} answered
          </p>
          <ul className="mt-5 space-y-3.5">
            {problems.map((problem) => (
              <li key={problem.label} title={`${problem.label}: ${problem.count} ${problem.count === 1 ? 'member' : 'members'}`}>
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="text-[#ece6d6]">{problem.label}</span>
                  <span className="tabular-nums text-[#d6d0c0]">{problem.count}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-white/[0.05]">
                  <div
                    className="h-2 rounded-full bg-[#ad8b51]"
                    style={{ width: problem.count ? `${Math.max(3, (problem.count / topProblemCount) * 100)}%` : '0%' }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <h3 className="mt-8 text-[13px] uppercase tracking-[0.18em] text-gold-400">In their own words</h3>
          {quotes.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-[#b0b8c4]">Written answers will appear here.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {quotes.slice(0, 4).map((quote) => (
                <li key={quote.id} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                  <p className="lux-serif text-[15.5px] leading-relaxed text-[#ece6d6]">&ldquo;{quote.text}&rdquo;</p>
                  <p className="mt-2 text-[12px] text-[#b0b8c4]">{quote.name} · {joinedLabel(quote.joinedAt, now)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <MembersPanel members={rows} />
    </div>
  );
}

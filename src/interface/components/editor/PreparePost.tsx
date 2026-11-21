'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Sparkles } from '@/interface/components/ui/icons';
import { getPostDraft, markPosted, savePostDraft, saveBusinessProfile, writePostDraft, type PostDraft } from '@/core/actions/post-drafts';
import {
  GOAL_LABELS, HOOK_LABELS, PLATFORM_RULES, POST_GOALS, POST_PLATFORMS, captionIssues,
  type BusinessProfile, type PostGoal, type PostPlatform, type PostVariants,
} from '@/core/services/post-draft';

export type PostActions = {
  load: typeof getPostDraft;
  write: typeof writePostDraft;
  save: typeof savePostDraft;
  saveProfile: typeof saveBusinessProfile;
  markPosted: typeof markPosted;
};
const DEFAULT_ACTIONS: PostActions = { load: getPostDraft, write: writePostDraft, save: savePostDraft, saveProfile: saveBusinessProfile, markPosted };

/**
 * Prepare a post: after exporting, write a hook and an Instagram, TikTok and LinkedIn version, edit
 * them, then copy the caption and post the downloaded video yourself. Nothing is posted from here.
 */
export function PreparePost({ url, actions = DEFAULT_ACTIONS }: { url: string; actions?: PostActions }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [profile, setProfile] = useState<BusinessProfile>({ business: '', audience: '', tone: '' });
  const [goal, setGoal] = useState<PostGoal | null>(null);
  const [platform, setPlatform] = useState<PostPlatform>('instagram');
  const [variants, setVariants] = useState<PostVariants>({});
  const [rights, setRights] = useState(false);
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<PostPlatform | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (d: PostDraft) => {
    setDraft(d);
    setGoal(d.goal);
    setVariants(d.variants);
    setRights(Boolean(d.rightsConfirmedAt));
  };

  useEffect(() => {
    if (!open || loaded) return;
    let live = true;
    actions.load(url).then((res) => {
      if (!live) return;
      setLoaded(true);
      if (res.error || !res.data) return setError(res.error || "Couldn't load your post draft.");
      if (res.data.profile) setProfile(res.data.profile);
      if (res.data.draft) show(res.data.draft);
    }).catch(() => { if (live) { setLoaded(true); setError("Couldn't reach Visiowave. Check your connection and try again."); } });
    return () => { live = false; };
  }, [open, loaded, url, actions]);

  const persist = useCallback(async (next: { variants: PostVariants; rights: boolean }) => {
    if (!draft) return;
    setSaving('saving');
    try {
      const res = await actions.save({ id: draft.id, variants: next.variants, rightsConfirmed: next.rights });
      if (res.error || !res.data) { setSaving('failed'); setError(res.error || "Couldn't save your draft."); return; }
      setDraft(res.data);
      setSaving('saved');
      setError(null);
    } catch {
      setSaving('failed');
      setError("Couldn't save your draft. Your text is still here; try again.");
    }
  }, [draft, actions]);

  // Edits save on their own a moment after typing stops.
  const edit = (p: PostPlatform, caption: string) => {
    const next = { ...variants, [p]: { ...variants[p], caption } };
    setVariants(next);
    setSaving('idle');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist({ variants: next, rights }), 900);
  };
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const write = async () => {
    if (!goal || writing) return;
    setWriting(true);
    setError(null);
    try {
      if (profile.business || profile.audience || profile.tone) {
        const saved = await actions.saveProfile(profile);
        if (saved.error) { setError(saved.error); return; }
      }
      const res = await actions.write({ url, goal });
      if (res.error || !res.data) { setError(res.error || "Couldn't write the post."); return; }
      show(res.data);
      setSaving('saved');
    } catch {
      setError("Couldn't reach Visiowave. Check your connection and try again.");
    } finally {
      setWriting(false);
    }
  };

  const applyHook = (text: string) => {
    const caption = variants[platform]?.caption ?? '';
    const [first, ...rest] = caption.split('\n');
    edit(platform, first !== undefined && rest.length ? [text, ...rest].join('\n') : `${text}\n\n${caption}`.trim());
  };

  const copy = async (p: PostPlatform) => {
    try {
      await navigator.clipboard.writeText(variants[p]?.caption ?? '');
      setCopied(p);
      setTimeout(() => setCopied((c) => (c === p ? null : c)), 2000);
    } catch {
      setError("Couldn't copy. Select the caption and copy it yourself.");
    }
  };

  const togglePosted = async (p: PostPlatform) => {
    if (!draft) return;
    const res = await actions.markPosted({ id: draft.id, platform: p, posted: !variants[p]?.postedAt });
    if (res.error || !res.data) return setError(res.error || "Couldn't update this post.");
    show(res.data);
  };

  const current = variants[platform]?.caption ?? '';
  const issues = draft ? captionIssues(platform, current) : [];
  const postedAt = variants[platform]?.postedAt;
  const status = !draft ? 'Not written yet' : saving === 'saving' ? 'Saving…' : saving === 'failed' ? 'Not saved' : 'Draft saved';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-white/[0.02] p-4 text-left hover:border-gold-300/40">
        <span>
          <span className="block text-sm font-medium text-white">Prepare a post</span>
          <span className="mt-0.5 block text-sm text-[#b0b8c4]">A hook and captions for Instagram, TikTok and LinkedIn. You post it yourself.</span>
        </span>
        <Sparkles size={18} className="shrink-0 text-gold-200" />
      </button>
    );
  }

  return (
    <section aria-label="Prepare a post" className="space-y-4 rounded-2xl border border-line bg-white/[0.02] p-4" data-testid="prepare-post">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Prepare a post</p>
          <p className="mt-0.5 text-[13px] text-[#b0b8c4]" role="status" aria-live="polite">{status} · Not posted from Visiowave</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-[#9aa3ad] hover:text-white">Close</button>
      </div>

      {!loaded ? (
        <div className="grid place-items-center py-6 text-[#9aa3ad]"><Loader2 className="animate-spin" /><span className="sr-only">Loading your draft</span></div>
      ) : (
        <>
          <fieldset>
            <legend className="text-[13px] text-white/80">What is this post for?</legend>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="What is this post for?">
              {POST_GOALS.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={goal === g} onClick={() => setGoal(g)} className={`rounded-full border px-3 py-1.5 text-[13px] ${goal === g ? 'border-gold-300/70 bg-gold-400/10 text-gold-50' : 'border-white/15 text-[#ece6d6] hover:border-white/30'}`}>{GOAL_LABELS[g]}</button>
              ))}
            </div>
          </fieldset>

          <details className="rounded-xl border border-white/[0.08] p-3 text-[13px]" open={!draft && !profile.business}>
            <summary className="cursor-pointer text-white/80">Your business &amp; brand <span className="text-[#9aa3ad]">(optional, used for every post)</span></summary>
            <div className="mt-3 grid gap-2">
              {([['business', 'What do you do or sell?', 'e.g. Handmade loose-leaf tea, shipped across the UK', 400], ['audience', 'Who is it for?', 'e.g. Busy professionals who want a calmer morning', 300], ['tone', 'How should it sound?', 'e.g. Warm, simple, a little playful', 200]] as const).map(([field, label, hint, max]) => (
                <label key={field} className="grid gap-1">
                  <span className="text-white/70">{label}</span>
                  <input value={profile[field]} maxLength={max} onChange={(e) => setProfile((p) => ({ ...p, [field]: e.target.value }))} placeholder={hint} className="rounded-lg border border-line bg-black/30 px-3 py-2 text-white placeholder:text-white/30" />
                </label>
              ))}
              <p className="text-[12px] text-[#9aa3ad]">Posts only state what you write here or what is said in the video. Anything else is flagged for you to check.</p>
            </div>
          </details>

          <button type="button" onClick={() => void write()} disabled={!goal || writing} className={draft
            ? 'flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 text-[13.5px] font-medium text-[#ece6d6] hover:border-gold-300/50 disabled:opacity-50'
            : 'ed-gold flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold disabled:opacity-50'}>
            {writing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {writing ? 'Writing your post…' : draft ? 'Write it again' : 'Write my post'}
          </button>
          {!goal && <p className="text-[12px] text-[#9aa3ad]">Choose what the post is for first.</p>}

          {draft && (
            <>
              <p className="text-[12px] text-[#9aa3ad]">{draft.sources}</p>

              {draft.hooks.length > 0 && (
                <div>
                  <p className="text-[13px] text-white/80">Opening lines</p>
                  <ul className="mt-2 space-y-2">
                    {draft.hooks.map((hook, i) => (
                      <li key={i} className="rounded-xl border border-white/[0.08] p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-gold-300/80">{HOOK_LABELS[hook.family as keyof typeof HOOK_LABELS] ?? 'Hook'}</p>
                        <p className="mt-1 text-sm text-white">{hook.text}</p>
                        <p className="mt-1 text-[12px] text-[#9aa3ad]">{hook.why}</p>
                        <button type="button" onClick={() => applyHook(hook.text)} className="mt-2 text-[12px] text-gold-200 underline decoration-gold-400/40 underline-offset-4">Use as the first line of the {PLATFORM_RULES[platform].label}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div role="tablist" aria-label="Platform" className="flex flex-wrap gap-1 rounded-xl border border-line p-1 text-[13px]">
                  {POST_PLATFORMS.map((p) => (
                    <button key={p} type="button" role="tab" aria-selected={platform === p} onClick={() => setPlatform(p)} className={`rounded-lg px-3 py-1.5 ${platform === p ? 'bg-white/10 text-white' : 'text-[#9aa3ad] hover:text-white'}`}>
                      {PLATFORM_RULES[p].label}{variants[p]?.postedAt ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
                <textarea
                  aria-label={PLATFORM_RULES[platform].label}
                  value={current}
                  onChange={(e) => edit(platform, e.target.value)}
                  className="mt-2 min-h-40 w-full rounded-xl border border-line bg-black/30 p-3 text-sm leading-relaxed text-white"
                />
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-[12px]">
                  <span className={issues.length ? 'text-amber-200' : 'text-[#9aa3ad]'}>{issues[0] ?? 'Ready to paste.'}</span>
                  <span className={`tabular-nums ${[...current].length > PLATFORM_RULES[platform].maxChars ? 'text-amber-200' : 'text-[#9aa3ad]'}`}>{[...current].length} / {PLATFORM_RULES[platform].maxChars}</span>
                </div>
              </div>

              {draft.claimsToCheck.length > 0 && (
                <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-[13px] text-amber-100">
                  <p className="font-medium">Check before posting</p>
                  <ul className="mt-1 list-inside list-disc text-amber-100/90">{draft.claimsToCheck.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-white/[0.08] p-3">
                <label className="flex items-start gap-2 text-[13px] text-white/85">
                  <input type="checkbox" checked={rights} onChange={(e) => { setRights(e.target.checked); void persist({ variants, rights: e.target.checked }); }} className="mt-0.5" />
                  I have the rights to post this video, its music and everyone in it.
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!rights || issues.length > 0} onClick={() => void copy(platform)} className="inline-flex items-center gap-2 rounded-xl border border-gold-400/50 px-3.5 py-2 text-sm text-gold-100 hover:bg-gold-500/10 disabled:opacity-40">
                    {copied === platform ? <Check size={15} /> : <Copy size={15} />} {copied === platform ? 'Copied' : 'Copy caption'}
                  </button>
                  <button type="button" disabled={!rights} onClick={() => void togglePosted(platform)} aria-pressed={Boolean(postedAt)} className="rounded-xl border border-white/15 px-3.5 py-2 text-sm text-[#ece6d6] hover:border-white/30 disabled:opacity-40">
                    {postedAt ? 'Marked as posted · undo' : 'I posted it'}
                  </button>
                </div>
                {!rights && <p className="text-[12px] text-[#9aa3ad]">Tick the box above to copy the caption or mark it as posted.</p>}
                <p className="text-[12px] text-[#9aa3ad]">
                  {postedAt
                    ? `You marked this as posted on ${PLATFORM_RULES[platform].label.replace(' version', '')} (${new Date(postedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}). Visiowave can't see the platform, so this is your note, not a confirmation.`
                    : `To post: download the video above, open ${PLATFORM_RULES[platform].label.replace(' version', '')}, and paste the caption. Visiowave doesn't post for you yet.`}
                </p>
              </div>
            </>
          )}
          {error && <p role="alert" className="text-[13px] text-amber-200">{error}</p>}
        </>
      )}
    </section>
  );
}

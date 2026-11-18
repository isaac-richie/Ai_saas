'use client';

import { PreparePost, type PostActions } from '@/interface/components/editor/PreparePost';
import type { PostDraft } from '@/core/actions/post-drafts';

let draft: PostDraft | null = null;
const sample = (goal: PostDraft['goal']): PostDraft => ({
  id: '00000000-0000-4000-8000-000000000001', goal, updatedAt: new Date().toISOString(), rightsConfirmedAt: null,
  sources: 'We read what is said in it and its shot notes, but did not watch the video itself.',
  hooks: [
    { family: 'problem', text: 'Mornings shouldn’t feel like a race.', why: 'Names the feeling your audience wants to fix.' },
    { family: 'demonstration', text: 'Watch the leaves open in 30 seconds.', why: 'The video shows the brew, so lead with it.' },
    { family: 'tutorial', text: 'The one step most people skip when brewing tea.', why: 'Teaches something quick and useful.' },
  ],
  variants: {
    instagram: { caption: 'Mornings shouldn’t feel like a race.\n\nOur loose-leaf blend is made for slow starts. Brew, breathe, begin.\n\nTap the link in bio to try it.\n\n#loosetea #slowmorning #teatime', postedAt: null },
    tiktok: { caption: 'Watch the leaves open ☕ #tea #morningroutine', postedAt: null },
    linkedin: { caption: 'Most of us start the day already behind.\n\nWe built our tea for the ten quiet minutes before the inbox. Small ritual, calmer day.\n\n#wellbeing #smallbusiness', postedAt: null },
  },
  claimsToCheck: ['“Shipped in 24 hours” isn’t in your business details. Check it before posting.'],
});

const actions: PostActions = {
  load: async () => ({ data: { draft, profile: null } }),
  write: async (input) => { await new Promise((r) => setTimeout(r, 600)); draft = sample((input as { goal: PostDraft['goal'] }).goal); return { data: draft }; },
  save: async (input) => { const i = input as { variants: PostDraft['variants']; rightsConfirmed: boolean }; draft = { ...draft!, variants: i.variants, rightsConfirmedAt: i.rightsConfirmed ? new Date().toISOString() : null }; return { data: draft }; },
  saveProfile: async (input) => ({ data: input as { business: string; audience: string; tone: string } }),
  markPosted: async (input) => {
    const i = input as { platform: 'instagram' | 'tiktok' | 'linkedin'; posted: boolean };
    if (!draft?.rightsConfirmedAt && i.posted) return { error: 'Confirm you have the rights to post this video first.' };
    draft = { ...draft!, variants: { ...draft!.variants, [i.platform]: { ...draft!.variants[i.platform]!, postedAt: i.posted ? new Date().toISOString() : null } } };
    return { data: draft };
  },
};

export function DevPost() {
  return (
    <main className="mx-auto max-w-[30rem] space-y-4 p-6 text-white">
      <h1 className="text-lg">Prepare a post preview</h1>
      <PreparePost url="https://example.supabase.co/storage/v1/object/public/renders/sample.mp4" actions={actions} />
    </main>
  );
}

-- Prepare a post (Growth Hub thin slice): after exporting a video, draft a hook and captions for
-- Instagram, TikTok and LinkedIn, edit them, then copy the caption and download the video to post by
-- hand. Nothing here publishes anything: there are no social connections, schedules or jobs.
--
-- 1. A short business profile, so drafts sound like the business and claim nothing it didn't say.
-- 2. One saved post draft per exported video, so the draft is there when the creator comes back.
-- Owner-only rows (RLS). Idempotent: safe to run more than once.

create table if not exists public.post_business_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business text not null default '' check (char_length(business) <= 400),
  audience text not null default '' check (char_length(audience) <= 300),
  tone text not null default '' check (char_length(tone) <= 200),
  updated_at timestamptz not null default now()
);

alter table public.post_business_profiles enable row level security;
drop policy if exists post_business_profiles_owner on public.post_business_profiles;
create policy post_business_profiles_owner on public.post_business_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.post_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The exported file this post is for: `<user>/timeline/<project>/<timeline>/render-<time>.mp4`.
  render_key text not null check (char_length(render_key) between 1 and 400),
  timeline_id uuid references public.timeline_projects(id) on delete set null,
  goal text not null default 'something_else' check (goal in ('introduce', 'product', 'teach', 'enquiries', 'something_else')),
  -- Suggested openers: [{ family, text, why }].
  hooks jsonb not null default '[]'::jsonb check (jsonb_typeof(hooks) = 'array'),
  -- One version per platform: { instagram: { caption, posted_at? }, tiktok: {...}, linkedin: {...} }.
  variants jsonb not null default '{}'::jsonb check (jsonb_typeof(variants) = 'object'),
  -- What the writer could read (for example "transcript and shot notes; the video itself was not watched").
  sources text not null default '' check (char_length(sources) <= 300),
  -- Statements in the draft the writer could not back up from the profile or the edit.
  claims_to_check jsonb not null default '[]'::jsonb check (jsonb_typeof(claims_to_check) = 'array'),
  rights_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, render_key)
);

create index if not exists post_drafts_user_updated on public.post_drafts(user_id, updated_at desc);

alter table public.post_drafts enable row level security;
drop policy if exists post_drafts_owner on public.post_drafts;
create policy post_drafts_owner on public.post_drafts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and render_key like auth.uid()::text || '/timeline/%');

notify pgrst, 'reload schema';

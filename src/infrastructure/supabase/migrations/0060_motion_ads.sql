-- Motion Ad Director (Phase 1). One ad is one record that moves through the brief's states; its
-- uploads, a version per render round (never overwritten) and its render jobs hang off it.
-- Owner-only rows (RLS). The render worker uses the service role and claims jobs one at a time.
-- Idempotent: safe to run more than once.

create table if not exists public.motion_ads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'draft' check (state in (
    'draft', 'planning', 'awaiting_assets', 'awaiting_approval', 'approved',
    'building', 'preview_ready', 'final_rendering', 'done', 'failed')),
  -- The state a failed job came from, so Retry can return to it.
  failed_from text check (failed_from is null or failed_from in ('planning', 'building', 'final_rendering')),
  brief text not null default '' check (char_length(brief) <= 2000),
  length_s integer not null default 15 check (length_s in (10, 15, 20)),
  aspect text not null default '16:9' check (aspect in ('16:9', '9:16')),
  resolution text not null default '1080p' check (resolution in ('1080p', '4k')),
  -- The storyboard (the planning AI's validated JSON, re-timed from the voice when there is one).
  plan jsonb check (plan is null or jsonb_typeof(plan) = 'object'),
  -- A plain message for the user when the voice changed the length, or a job failed.
  notice text check (notice is null or char_length(notice) <= 400),
  rights_accepted_at timestamptz,
  current_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists motion_ads_user_updated on public.motion_ads(user_id, updated_at desc);

create table if not exists public.motion_ad_assets (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.motion_ads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image', 'voice', 'logo', 'music')),
  -- @image1 … @image10 for images; null for the rest.
  tag text check ((kind = 'image') = (tag is not null) and (tag is null or tag ~ '^@image([1-9]|10)$')),
  storage_path text not null check (char_length(storage_path) between 1 and 400),
  mime text not null check (char_length(mime) <= 60),
  byte_size integer not null check (byte_size > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_s numeric check (duration_s is null or duration_s > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
-- One image per tag, and one voice, logo and music file per ad (a new upload replaces the old one).
create unique index if not exists motion_ad_assets_tag on public.motion_ad_assets(ad_id, tag) where tag is not null;
create unique index if not exists motion_ad_assets_single on public.motion_ad_assets(ad_id, kind) where kind in ('voice', 'logo', 'music');

create table if not exists public.motion_ad_versions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.motion_ads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  n integer not null check (n > 0),
  -- The exact storyboard and files this version was built from.
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  aspect text not null check (aspect in ('16:9', '9:16')),
  preview_path text,
  final_path text,
  silent_path text,
  stem_path text,
  final_resolution text check (final_resolution is null or final_resolution in ('1080p', '4k')),
  watermark boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ad_id, n)
);

create table if not exists public.motion_ad_jobs (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.motion_ads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid references public.motion_ad_versions(id) on delete cascade,
  type text not null check (type in ('preview', 'final')),
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed')),
  attempt integer not null default 0 check (attempt between 0 and 5),
  -- The same click sent twice never runs or charges twice.
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  resolution text check (resolution is null or resolution in ('1080p', '4k')),
  -- Credits held for a final render: charged on success, refunded on failure.
  reservation_id text,
  units integer not null default 0 check (units >= 0),
  claimed_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  compute_seconds numeric,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists motion_ad_jobs_queue on public.motion_ad_jobs(state, created_at) where state in ('queued', 'running');

alter table public.motion_ads enable row level security;
alter table public.motion_ad_assets enable row level security;
alter table public.motion_ad_versions enable row level security;
alter table public.motion_ad_jobs enable row level security;

drop policy if exists motion_ads_owner on public.motion_ads;
create policy motion_ads_owner on public.motion_ads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists motion_ad_assets_owner on public.motion_ad_assets;
create policy motion_ad_assets_owner on public.motion_ad_assets for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.motion_ads a where a.id = ad_id and a.user_id = auth.uid())
    and storage_path like auth.uid()::text || '/motion-ads/%'
  );

-- Versions and jobs are written by the app's server actions as the owner, and by the worker (service role).
drop policy if exists motion_ad_versions_owner on public.motion_ad_versions;
create policy motion_ad_versions_owner on public.motion_ad_versions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.motion_ads a where a.id = ad_id and a.user_id = auth.uid()));

drop policy if exists motion_ad_jobs_owner on public.motion_ad_jobs;
create policy motion_ad_jobs_owner on public.motion_ad_jobs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.motion_ads a where a.id = ad_id and a.user_id = auth.uid()));

-- The worker takes the oldest waiting job (or one whose claim expired), one at a time, so two workers never
-- render the same job. Service role only.
create or replace function public.claim_motion_ad_job(p_lease_seconds integer default 900)
returns setof public.motion_ad_jobs
language sql
security definer
set search_path = ''
as $$
  update public.motion_ad_jobs j set
    state = 'running', attempt = j.attempt + 1, started_at = coalesce(j.started_at, now()),
    claimed_until = now() + make_interval(secs => p_lease_seconds)
  where j.id = (
    select id from public.motion_ad_jobs
    where (state = 'queued') or (state = 'running' and claimed_until < now())
    order by created_at
    for update skip locked
    limit 1
  )
  returning j.*;
$$;
revoke all on function public.claim_motion_ad_job(integer) from public, anon, authenticated;

notify pgrst, 'reload schema';

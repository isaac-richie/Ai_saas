-- Campaign Director character / product references. Additive only: generic
-- UGC campaigns and their items keep working unchanged.

-- 1) Reference records (character or product) attached to a campaign.
create table if not exists public.campaign_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_id uuid not null,
  campaign_id uuid not null references public.studio_ad_campaigns(id) on delete cascade,
  reference_type text not null check (reference_type in ('character', 'product')),
  asset_paths text[] not null check (cardinality(asset_paths) between 1 and 4),
  name text not null check (char_length(name) between 1 and 80),
  description jsonb not null default '{}'::jsonb,
  lock_identity boolean not null default true,
  lock_appearance boolean not null default true,
  locks jsonb not null default '{}'::jsonb,
  influence_strength text not null default 'high' check (influence_strength in ('low', 'medium', 'high')),
  rights_confirmed boolean not null check (rights_confirmed),
  created_at timestamptz not null default now(),
  unique (campaign_id, reference_type)
);
create index if not exists campaign_references_user on public.campaign_references(user_id, created_at desc);

alter table public.campaign_references enable row level security;
drop policy if exists "Own campaign references" on public.campaign_references;
create policy "Own campaign references" on public.campaign_references
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.campaign_references from anon;
grant select, insert, update, delete on public.campaign_references to authenticated;

-- 2) Campaign-level snapshot so a reopened campaign restores its references.
alter table public.studio_ad_campaigns
  add column if not exists campaign_references jsonb,
  add column if not exists campaign_style text,
  add column if not exists relationship_type text,
  add column if not exists platform text;

-- 3) Per-asset reference IDs, interaction fields and review flags.
alter table public.studio_ad_campaign_items
  add column if not exists character_reference_id uuid,
  add column if not exists product_reference_id uuid,
  add column if not exists generation_model text,
  add column if not exists relationship_type text,
  add column if not exists product_interaction text,
  add column if not exists shot_sequence text,
  add column if not exists call_to_action text,
  add column if not exists quality_flags jsonb not null default '{}'::jsonb;

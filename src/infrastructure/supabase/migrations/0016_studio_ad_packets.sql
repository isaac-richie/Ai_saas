create table if not exists public.studio_ad_packets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  scene_id uuid null references public.scenes(id) on delete set null,
  shot_id uuid null references public.shots(id) on delete set null,
  user_intent text not null,
  mode text not null,
  provider_target text not null,
  output_type text not null check (output_type in ('image', 'video')),
  project_bible jsonb not null default '{}'::jsonb,
  packet jsonb not null,
  production_readiness integer not null check (production_readiness between 0 and 100),
  continuity_confidence integer not null check (continuity_confidence between 0 and 100),
  technical_clarity integer not null check (technical_clarity between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists idx_studio_ad_packets_user_created
  on public.studio_ad_packets(user_id, created_at desc);

create index if not exists idx_studio_ad_packets_project
  on public.studio_ad_packets(project_id, created_at desc);

create index if not exists idx_studio_ad_packets_scene
  on public.studio_ad_packets(scene_id, created_at desc);

create index if not exists idx_studio_ad_packets_shot
  on public.studio_ad_packets(shot_id, created_at desc);

alter table public.studio_ad_packets enable row level security;

drop policy if exists "Users can read own studio ad packets" on public.studio_ad_packets;
create policy "Users can read own studio ad packets"
  on public.studio_ad_packets
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own studio ad packets" on public.studio_ad_packets;
create policy "Users can insert own studio ad packets"
  on public.studio_ad_packets
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own studio ad packets" on public.studio_ad_packets;
create policy "Users can delete own studio ad packets"
  on public.studio_ad_packets
  for delete
  using (auth.uid() = user_id);


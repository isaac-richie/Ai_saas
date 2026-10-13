-- Start / End Frame support. Additive only: existing media references,
-- reference libraries and generations keep working unchanged.

-- 1) Frame records, separate from general Image / Video / Audio references.
create table if not exists public.shot_frame_refs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  frame_id uuid not null,
  shot_id uuid references public.shots(id) on delete cascade,
  frame_type text not null check (frame_type in ('start', 'end')),
  asset_path text not null check (asset_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$'),
  source_type text not null check (source_type in ('upload', 'gallery', 'capture', 'previous_shot')),
  source_shot_id text,
  source_timestamp_ms integer check (source_timestamp_ms is null or source_timestamp_ms >= 0),
  influence_strength text not null default 'medium' check (influence_strength in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);
create index if not exists shot_frame_refs_shot on public.shot_frame_refs(shot_id);
create index if not exists shot_frame_refs_user on public.shot_frame_refs(user_id, created_at desc);

alter table public.shot_frame_refs enable row level security;
drop policy if exists "Own shot frame refs" on public.shot_frame_refs;
create policy "Own shot frame refs" on public.shot_frame_refs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.shot_frame_refs from anon;
grant select, insert, delete on public.shot_frame_refs to authenticated;

-- 2) Generation log additions. The media_references parameters stay as they are.
alter table public.shot_generations
  add column if not exists start_frame_ref_id uuid references public.shot_frame_refs(id) on delete set null,
  add column if not exists end_frame_ref_id uuid references public.shot_frame_refs(id) on delete set null,
  add column if not exists transition_direction text check (transition_direction is null or char_length(transition_direction) <= 300),
  add column if not exists capability_snapshot jsonb,
  add column if not exists cost_estimate numeric,
  add column if not exists actual_cost numeric;

-- 3) Save / Load setup carries frames next to the existing reference list.
alter table public.fast_video_reference_libraries
  add column if not exists shot_frames jsonb not null default '{}'::jsonb;
alter table public.fast_video_reference_libraries
  drop constraint if exists reference_library_frames_bounds;
alter table public.fast_video_reference_libraries
  add constraint reference_library_frames_bounds check (
    jsonb_typeof(shot_frames) = 'object' and octet_length(shot_frames::text) <= 20000
  );

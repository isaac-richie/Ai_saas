-- Long Form video references. Builds on 0052 (image locks) and 0053 (shared revision).
--
-- One row per binding: a clip cut from one of the film's library videos, bound to the whole film (scene)
-- or one shot, with what it is there to guide. The clip is the pinned version: a silent MP4 of exactly
-- the selected range, with its checksum, so what was approved is what is sent.
-- Binding existence means the clip is a required input of the video request. It guides generation; it is
-- never placed on the export timeline.

do $$
begin
  if to_regclass('public.long_form_reference_bindings') is null or to_regclass('public.long_form_binding_revisions') is null then
    raise exception 'Run migration 0052_long_form_image_locks.sql first, then run this one (0054).';
  end if;
  if to_regprocedure('public.bump_long_form_revision(uuid, integer)') is null then
    raise exception 'Run migration 0053_long_form_locked_media.sql first, then run this one (0054).';
  end if;
end;
$$;

create table if not exists public.long_form_video_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  production_root_id uuid not null references public.production_jobs(id) on delete cascade,
  scope_type text not null check (scope_type in ('scene', 'shot')),
  shot_number integer check (shot_number is null or (shot_number between 1 and 24)),
  -- The library video the clip was cut from.
  asset_id uuid not null,
  source_url text not null check (char_length(source_url) <= 2000),
  asset_name text not null check (char_length(asset_name) between 1 and 160),
  source_duration_ms integer not null check (source_duration_ms > 0),
  -- The selected range of the source.
  trim_start_ms integer not null check (trim_start_ms >= 0),
  trim_end_ms integer not null,
  -- The pinned clip: silent MP4 of the range, immutable, with its checksum.
  clip_url text not null check (char_length(clip_url) <= 2000),
  clip_sha256 text not null check (clip_sha256 ~ '^[a-f0-9]{64}$'),
  clip_bytes integer not null check (clip_bytes > 0),
  clip_duration_ms integer not null check (clip_duration_ms > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  guidance_purpose text not null check (guidance_purpose in ('camera_movement', 'subject_movement', 'composition', 'visual_style', 'continuity')),
  guidance_text text not null default '' check (char_length(guidance_text) <= 300),
  -- The shot's title when the binding was saved, so a reordered or rewritten plan is caught.
  anchor_title text not null default '' check (char_length(anchor_title) <= 200),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint long_form_video_scope_shape check (
    (scope_type = 'scene' and shot_number is null) or (scope_type = 'shot' and shot_number is not null)
  ),
  constraint long_form_video_trim_range check (trim_start_ms < trim_end_ms and trim_end_ms <= source_duration_ms)
);

-- One binding per scope + source video + range.
create unique index if not exists long_form_video_bindings_unique
  on public.long_form_video_bindings (production_root_id, scope_type, coalesce(shot_number, 0), source_url, trim_start_ms, trim_end_ms);
create index if not exists long_form_video_bindings_lookup
  on public.long_form_video_bindings (production_root_id, scope_type, shot_number);

alter table public.long_form_video_bindings enable row level security;

drop policy if exists long_form_video_bindings_owner on public.long_form_video_bindings;
create policy long_form_video_bindings_owner on public.long_form_video_bindings
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and created_by = auth.uid()
    and exists (select 1 from public.production_jobs p where p.id = production_root_id and p.user_id = auth.uid())
  );

-- Replace one scope's video references atomically and bump the film's shared revision.
create or replace function public.save_long_form_video_bindings(
  p_root uuid, p_scope text, p_shot integer, p_expected_revision integer, p_bindings jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_revision integer;
begin
  next_revision := bump_long_form_revision(p_root, p_expected_revision);
  delete from long_form_video_bindings
    where production_root_id = p_root and scope_type = p_scope
      and coalesce(shot_number, 0) = coalesce(p_shot, 0);
  insert into long_form_video_bindings (
    user_id, production_root_id, scope_type, shot_number, asset_id, source_url, asset_name, source_duration_ms,
    trim_start_ms, trim_end_ms, clip_url, clip_sha256, clip_bytes, clip_duration_ms, width, height,
    guidance_purpose, guidance_text, anchor_title, created_by
  )
  select auth.uid(), p_root, p_scope, p_shot, (b->>'asset_id')::uuid, b->>'source_url', b->>'asset_name', (b->>'source_duration_ms')::integer,
    (b->>'trim_start_ms')::integer, (b->>'trim_end_ms')::integer, b->>'clip_url', b->>'clip_sha256', (b->>'clip_bytes')::integer,
    (b->>'clip_duration_ms')::integer, (b->>'width')::integer, (b->>'height')::integer,
    b->>'guidance_purpose', coalesce(b->>'guidance_text', ''), coalesce(b->>'anchor_title', ''), auth.uid()
  from jsonb_array_elements(p_bindings) as b;
  return next_revision;
end;
$$;

grant execute on function public.save_long_form_video_bindings(uuid, text, integer, integer, jsonb) to authenticated;

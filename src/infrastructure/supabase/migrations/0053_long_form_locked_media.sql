-- Long Form Locked media + audio (spec v2.0). Builds on 0052 (image locks).
--
-- Audio is two things kept apart:
--   long_form_audio_assets    the film's recordings: uploaded files and AI-created takes. A take is a
--                             candidate until the creator chooses "Use and lock"; its file, checksum and
--                             duration never change once it is ready.
--   long_form_audio_bindings  where an approved recording plays: this shot or the whole scene, which part
--                             of the file, when, how loud, and what happens to the shot's own sound.
--                             Each placement is its own row: the same file can play twice on purpose.
-- Images stay in long_form_reference_bindings. Both share the film's revision in
-- long_form_binding_revisions, so a stale editor can't overwrite newer locks.

-- Requires 0052 (image locks): stop with a clear message instead of a missing-table error.
do $$
begin
  if to_regclass('public.long_form_reference_bindings') is null or to_regclass('public.long_form_binding_revisions') is null then
    raise exception 'Run migration 0052_long_form_image_locks.sql first, then run this one (0053).';
  end if;
  if to_regclass('public.timeline_render_jobs') is null then
    raise exception 'Run migration 0046_timeline_render_jobs.sql first, then run this one (0053).';
  end if;
end;
$$;

create table if not exists public.long_form_audio_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  production_root_id uuid not null references public.production_jobs(id) on delete cascade,
  origin text not null check (origin in ('uploaded', 'ai_generated')),
  purpose text not null check (purpose in ('dialogue', 'music', 'sound_effect', 'ambience')),
  name text not null check (char_length(name) between 1 and 160),
  -- generating: submitted to the provider; unknown: the submission timed out and must be reconciled
  -- before anything is retried; ready: file saved and checked; failed: nothing usable.
  status text not null default 'ready' check (status in ('generating', 'unknown', 'ready', 'failed')),
  -- The original file and the canonical playable version (the same object unless transcoded).
  storage_path text check (storage_path is null or char_length(storage_path) <= 400),
  playback_path text check (playback_path is null or char_length(playback_path) <= 400),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text check (mime_type is null or char_length(mime_type) <= 80),
  byte_size integer check (byte_size is null or byte_size > 0),
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  -- AI provenance: provider, model, type, text or description, voice, settings, task id, cost units.
  generation jsonb check (generation is null or octet_length(generation::text) <= 20000),
  provider_task_id text check (provider_task_id is null or char_length(provider_task_id) <= 200),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint long_form_audio_ready_shape check (
    status <> 'ready' or (storage_path is not null and playback_path is not null and sha256 is not null and duration_ms is not null and byte_size is not null)
  )
);
create index if not exists long_form_audio_assets_root on public.long_form_audio_assets (production_root_id, created_at);
-- One provider task becomes one asset at most, so a repeated check can't save a take twice.
create unique index if not exists long_form_audio_assets_task
  on public.long_form_audio_assets (provider_task_id, (coalesce(generation->>'track_index', '0')))
  where provider_task_id is not null;

-- A ready recording is immutable: replacing a file means a new asset, never a silent change.
create or replace function public.freeze_ready_audio()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'ready' and (
    new.storage_path is distinct from old.storage_path or new.playback_path is distinct from old.playback_path
    or new.sha256 is distinct from old.sha256 or new.duration_ms is distinct from old.duration_ms
    or new.byte_size is distinct from old.byte_size or new.status is distinct from old.status
    or new.production_root_id is distinct from old.production_root_id or new.user_id is distinct from old.user_id
  ) then
    raise exception 'A saved recording cannot be changed. Create a new take instead.';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists long_form_audio_immutable on public.long_form_audio_assets;
create trigger long_form_audio_immutable before update on public.long_form_audio_assets
for each row execute function public.freeze_ready_audio();

create table if not exists public.long_form_audio_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  production_root_id uuid not null references public.production_jobs(id) on delete cascade,
  scope_type text not null check (scope_type in ('scene', 'shot')),
  shot_number integer check (shot_number is null or (shot_number between 1 and 24)),
  -- NO ACTION (checked at the end of the statement): a locked recording can't be deleted while a
  -- placement uses it, but deleting the whole film still removes both.
  audio_asset_id uuid not null references public.long_form_audio_assets(id),
  asset_sha256 text not null check (asset_sha256 ~ '^[a-f0-9]{64}$'),
  purpose text not null check (purpose in ('dialogue', 'music', 'sound_effect', 'ambience')),
  source_in_ms integer not null default 0 check (source_in_ms >= 0),
  -- null = to the end of the recording.
  source_out_ms integer check (source_out_ms is null or source_out_ms > source_in_ms),
  -- Offset from the start of the shot (shot scope) or of the scene (scene scope).
  timeline_offset_ms integer not null default 0 check (timeline_offset_ms between 0 and 3600000),
  playback text not null default 'once' check (playback in ('once', 'continuous', 'repeat_per_shot')),
  gain numeric(4, 3) not null default 1 check (gain between 0 and 2),
  fade_in_ms integer not null default 0 check (fade_in_ms between 0 and 10000),
  fade_out_ms integer not null default 0 check (fade_out_ms between 0 and 10000),
  -- Looping only when chosen; never to fill a gap silently.
  loop boolean not null default false,
  -- What happens when the recording runs past its shot or scene: block, or end it there (explicit trim).
  overflow text not null default 'block' check (overflow in ('block', 'cut_at_end')),
  -- The shot's own (generated) sound under this placement. null = not decided yet.
  native_audio text check (native_audio is null or native_audio in ('keep', 'mute')),
  dialogue_display text not null default 'voice_over' check (dialogue_display in ('voice_over', 'match_speech')),
  -- The shot's title when the placement was saved, so a reordered or rewritten plan is caught.
  anchor_title text not null default '' check (char_length(anchor_title) <= 200),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint long_form_audio_scope_shape check (
    (scope_type = 'scene' and shot_number is null) or (scope_type = 'shot' and shot_number is not null)
  ),
  -- Continuous and per-shot playback only make sense across a scene.
  constraint long_form_audio_playback_scope check (scope_type = 'scene' or playback = 'once')
);
create index if not exists long_form_audio_bindings_root on public.long_form_audio_bindings (production_root_id, scope_type, shot_number);

-- Image placements remember their shot's title too.
alter table public.long_form_reference_bindings
  add column if not exists anchor_title text not null default '' check (char_length(anchor_title) <= 200);

-- Render manifest: exactly which takes, recordings and decisions a render used.
alter table public.timeline_render_jobs add column if not exists manifest jsonb
  check (manifest is null or octet_length(manifest::text) <= 200000);

alter table public.long_form_audio_assets enable row level security;
alter table public.long_form_audio_bindings enable row level security;

drop policy if exists long_form_audio_assets_owner on public.long_form_audio_assets;
create policy long_form_audio_assets_owner on public.long_form_audio_assets
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.production_jobs p where p.id = production_root_id and p.user_id = auth.uid())
  );

drop policy if exists long_form_audio_bindings_owner on public.long_form_audio_bindings;
create policy long_form_audio_bindings_owner on public.long_form_audio_bindings
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and created_by = auth.uid()
    and exists (select 1 from public.production_jobs p where p.id = production_root_id and p.user_id = auth.uid())
    and exists (
      select 1 from public.long_form_audio_assets a
      where a.id = audio_asset_id and a.user_id = auth.uid() and a.production_root_id = long_form_audio_bindings.production_root_id
        and a.status = 'ready' and a.sha256 = asset_sha256
    )
  );

-- Bumps the film's shared revision, rejecting a stale one. Used by every locked-media save.
create or replace function public.bump_long_form_revision(p_root uuid, p_expected_revision integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_revision integer;
begin
  if not exists (select 1 from production_jobs where id = p_root and user_id = auth.uid()) then
    raise exception 'production not found' using errcode = 'P0002';
  end if;
  insert into long_form_binding_revisions (production_root_id, user_id, revision)
    values (p_root, auth.uid(), 0)
    on conflict (production_root_id) do nothing;
  select revision into current_revision from long_form_binding_revisions where production_root_id = p_root for update;
  if current_revision <> p_expected_revision then
    raise exception 'stale revision' using errcode = '40001';
  end if;
  update long_form_binding_revisions set revision = revision + 1, updated_at = now() where production_root_id = p_root;
  return current_revision + 1;
end;
$$;

-- Image scope save, now keeping each binding's anchor title.
create or replace function public.save_long_form_bindings(
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
  delete from long_form_reference_bindings
    where production_root_id = p_root and scope_type = p_scope
      and coalesce(shot_number, 0) = coalesce(p_shot, 0);
  insert into long_form_reference_bindings (
    user_id, production_root_id, scope_type, shot_number, asset_id, asset_url, asset_sha256, asset_name,
    content_type, byte_size, width, height, role, entity_label, view_label, anchor_title, created_by
  )
  select auth.uid(), p_root, p_scope, p_shot, (b->>'asset_id')::uuid, b->>'asset_url', b->>'asset_sha256', b->>'asset_name',
    b->>'content_type', (b->>'byte_size')::integer, (b->>'width')::integer, (b->>'height')::integer,
    b->>'role', coalesce(b->>'entity_label', ''), coalesce(b->>'view_label', ''), coalesce(b->>'anchor_title', ''), auth.uid()
  from jsonb_array_elements(p_bindings) as b
  on conflict do nothing;
  return next_revision;
end;
$$;

-- Adds or changes one audio placement (p_id null = add). Returns the new revision.
create or replace function public.save_long_form_audio_binding(
  p_root uuid, p_expected_revision integer, p_id uuid, p_binding jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_revision integer;
begin
  next_revision := bump_long_form_revision(p_root, p_expected_revision);
  if p_id is null then
    insert into long_form_audio_bindings (
      user_id, production_root_id, scope_type, shot_number, audio_asset_id, asset_sha256, purpose,
      source_in_ms, source_out_ms, timeline_offset_ms, playback, gain, fade_in_ms, fade_out_ms, loop,
      overflow, native_audio, dialogue_display, anchor_title, created_by
    ) values (
      auth.uid(), p_root, p_binding->>'scope_type', (p_binding->>'shot_number')::integer, (p_binding->>'audio_asset_id')::uuid,
      p_binding->>'asset_sha256', p_binding->>'purpose', coalesce((p_binding->>'source_in_ms')::integer, 0),
      (p_binding->>'source_out_ms')::integer, coalesce((p_binding->>'timeline_offset_ms')::integer, 0),
      coalesce(p_binding->>'playback', 'once'), coalesce((p_binding->>'gain')::numeric, 1),
      coalesce((p_binding->>'fade_in_ms')::integer, 0), coalesce((p_binding->>'fade_out_ms')::integer, 0),
      coalesce((p_binding->>'loop')::boolean, false), coalesce(p_binding->>'overflow', 'block'),
      p_binding->>'native_audio', coalesce(p_binding->>'dialogue_display', 'voice_over'),
      coalesce(p_binding->>'anchor_title', ''), auth.uid()
    );
  else
    -- The recording, its checksum and its scope are fixed; only placement and mix choices change.
    update long_form_audio_bindings set
      source_in_ms = coalesce((p_binding->>'source_in_ms')::integer, 0),
      source_out_ms = (p_binding->>'source_out_ms')::integer,
      timeline_offset_ms = coalesce((p_binding->>'timeline_offset_ms')::integer, 0),
      playback = coalesce(p_binding->>'playback', 'once'),
      gain = coalesce((p_binding->>'gain')::numeric, 1),
      fade_in_ms = coalesce((p_binding->>'fade_in_ms')::integer, 0),
      fade_out_ms = coalesce((p_binding->>'fade_out_ms')::integer, 0),
      loop = coalesce((p_binding->>'loop')::boolean, false),
      overflow = coalesce(p_binding->>'overflow', 'block'),
      native_audio = p_binding->>'native_audio',
      dialogue_display = coalesce(p_binding->>'dialogue_display', 'voice_over'),
      anchor_title = coalesce(p_binding->>'anchor_title', anchor_title),
      updated_at = now()
    where id = p_id and production_root_id = p_root;
    if not found then
      raise exception 'binding not found' using errcode = 'P0002';
    end if;
  end if;
  return next_revision;
end;
$$;

create or replace function public.delete_long_form_audio_binding(p_root uuid, p_expected_revision integer, p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_revision integer;
begin
  next_revision := bump_long_form_revision(p_root, p_expected_revision);
  delete from long_form_audio_bindings where id = p_id and production_root_id = p_root;
  if not found then
    raise exception 'binding not found' using errcode = 'P0002';
  end if;
  return next_revision;
end;
$$;

grant execute on function public.bump_long_form_revision(uuid, integer) to authenticated;
grant execute on function public.save_long_form_bindings(uuid, text, integer, integer, jsonb) to authenticated;
grant execute on function public.save_long_form_audio_binding(uuid, integer, uuid, jsonb) to authenticated;
grant execute on function public.delete_long_form_audio_binding(uuid, integer, uuid) to authenticated;

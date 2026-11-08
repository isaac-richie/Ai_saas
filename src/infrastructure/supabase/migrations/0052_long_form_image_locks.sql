-- Long Form mandatory image locks (spec v1.2).
-- One row per binding: a pinned image version bound to a whole film (scene) or one shot, in a role.
-- There are no image_1..image_N columns and no fixed count: a shot or scene can hold five or more.
-- Binding existence means the image is a mandatory input of the video request.
--
-- A Long Form film is one production lineage (the root production_jobs row plus its revisions) that
-- materialises into one scene. Shots are addressed by their 1-based number in the film, which is what
-- the plan cards show before the shots exist as rows.

create table if not exists public.long_form_reference_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  production_root_id uuid not null references public.production_jobs(id) on delete cascade,
  scope_type text not null check (scope_type in ('scene', 'shot')),
  -- null for scene scope; the shot's 1-based number for shot scope.
  shot_number integer check (shot_number is null or (shot_number between 1 and 24)),
  -- The library asset the image came from (stable id, not the @image display alias).
  asset_id uuid not null,
  -- The pinned version: an immutable storage object and its checksum, taken when it was bound.
  asset_url text not null check (char_length(asset_url) <= 2000),
  asset_sha256 text not null check (asset_sha256 ~ '^[a-f0-9]{64}$'),
  asset_name text not null check (char_length(asset_name) between 1 and 160),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  role text not null check (role in ('character', 'wardrobe', 'location', 'prop', 'start_frame', 'end_frame')),
  -- Optional labels; '' rather than null so the uniqueness key treats "no label" as one value.
  entity_label text not null default '' check (char_length(entity_label) <= 60),
  view_label text not null default '' check (char_length(view_label) <= 60),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint long_form_scope_shape check (
    (scope_type = 'scene' and shot_number is null) or (scope_type = 'shot' and shot_number is not null)
  )
);

-- Unique per scope + asset version + role + entity (nulls normalised).
create unique index if not exists long_form_bindings_unique
  on public.long_form_reference_bindings (production_root_id, scope_type, coalesce(shot_number, 0), asset_url, role, entity_label);
create index if not exists long_form_bindings_lookup
  on public.long_form_reference_bindings (production_root_id, scope_type, shot_number);

-- Every save bumps the film's binding revision, so a stale editor or a queued request can tell.
create table if not exists public.long_form_binding_revisions (
  production_root_id uuid primary key references public.production_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.long_form_reference_bindings enable row level security;
alter table public.long_form_binding_revisions enable row level security;

drop policy if exists long_form_bindings_owner on public.long_form_reference_bindings;
create policy long_form_bindings_owner on public.long_form_reference_bindings
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and created_by = auth.uid()
    and exists (select 1 from public.production_jobs p where p.id = production_root_id and p.user_id = auth.uid())
  );

drop policy if exists long_form_revisions_owner on public.long_form_binding_revisions;
create policy long_form_revisions_owner on public.long_form_binding_revisions
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.production_jobs p where p.id = production_root_id and p.user_id = auth.uid())
  );

-- Replace one scope's bindings atomically and bump the revision, rejecting a stale expected revision.
create or replace function public.save_long_form_bindings(
  p_root uuid, p_scope text, p_shot integer, p_expected_revision integer, p_bindings jsonb
) returns integer
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

  delete from long_form_reference_bindings
    where production_root_id = p_root and scope_type = p_scope
      and coalesce(shot_number, 0) = coalesce(p_shot, 0);

  insert into long_form_reference_bindings (
    user_id, production_root_id, scope_type, shot_number, asset_id, asset_url, asset_sha256, asset_name,
    content_type, byte_size, width, height, role, entity_label, view_label, created_by
  )
  select auth.uid(), p_root, p_scope, p_shot, (b->>'asset_id')::uuid, b->>'asset_url', b->>'asset_sha256', b->>'asset_name',
    b->>'content_type', (b->>'byte_size')::integer, (b->>'width')::integer, (b->>'height')::integer,
    b->>'role', coalesce(b->>'entity_label', ''), coalesce(b->>'view_label', ''), auth.uid()
  from jsonb_array_elements(p_bindings) as b
  on conflict do nothing;

  update long_form_binding_revisions set revision = revision + 1, updated_at = now() where production_root_id = p_root;
  return current_revision + 1;
end;
$$;

grant execute on function public.save_long_form_bindings(uuid, text, integer, integer, jsonb) to authenticated;

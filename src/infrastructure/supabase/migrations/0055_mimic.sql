-- Mimic (beta): record or upload a performance, say who or what changes, and generate a transformed take.
--
-- One row per take. The source recording, the settings, what was submitted and the result are kept apart:
-- the source is never changed, and a regeneration is a new row that points at the one it came from.
-- Assignments are a list from the start (one person or object each), so several changes stay separate
-- across saving, reopening and generation.

create table if not exists public.mimic_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- ready: source prepared, editable. queued: claimed for submission. generating: the provider has it.
  -- unknown: the submission could not be confirmed and must not be retried blindly.
  status text not null default 'ready' check (status in ('ready', 'queued', 'generating', 'completed', 'failed', 'unknown')),
  title text not null default 'Mimic take' check (char_length(title) between 1 and 160),
  -- The source performance, prepared as an MP4 the provider accepts. Never modified after it is saved.
  source_origin text not null check (source_origin in ('recorded', 'uploaded', 'library')),
  source_path text not null check (char_length(source_path) <= 400),
  source_url text not null check (char_length(source_url) <= 2000),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_duration_ms integer not null check (source_duration_ms > 0),
  source_width integer not null check (source_width > 0),
  source_height integer not null check (source_height > 0),
  source_has_audio boolean not null default false,
  -- The part of the source that is transformed.
  trim_start_ms integer not null default 0 check (trim_start_ms >= 0),
  trim_end_ms integer not null,
  -- [{ id, label, targetType, target, referenceUrls[], instructions }]
  assignments jsonb not null default '[]'::jsonb check (jsonb_typeof(assignments) = 'array' and octet_length(assignments::text) <= 40000),
  instructions text not null default '' check (char_length(instructions) <= 1500),
  audio_policy text not null default 'keep_source' check (audio_policy in ('keep_source', 'mute')),
  resolution text not null default '720p' check (resolution in ('720p', '1080p')),
  -- Submission: what was sent, what it cost in allowance units, and the key that makes a retry safe.
  provider text,
  model text,
  provider_task_id text check (provider_task_id is null or char_length(provider_task_id) <= 200),
  reservation_id text check (reservation_id is null or char_length(reservation_id) <= 100),
  cost_units integer check (cost_units is null or cost_units between 1 and 20),
  manifest jsonb check (manifest is null or octet_length(manifest::text) <= 60000),
  sent_path text check (sent_path is null or char_length(sent_path) <= 400),
  result_path text check (result_path is null or char_length(result_path) <= 400),
  result_url text check (result_url is null or char_length(result_url) <= 2000),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  -- Version lineage: the take this one was regenerated from.
  parent_task_id uuid references public.mimic_tasks(id) on delete set null,
  rights_confirmed_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mimic_trim_range check (trim_start_ms < trim_end_ms and trim_end_ms <= source_duration_ms),
  constraint mimic_completed_shape check (status <> 'completed' or (result_url is not null and result_path is not null))
);

create index if not exists mimic_tasks_user on public.mimic_tasks (user_id, created_at desc);
-- One provider job becomes one take at most.
create unique index if not exists mimic_tasks_provider_task on public.mimic_tasks (provider_task_id) where provider_task_id is not null;

alter table public.mimic_tasks enable row level security;

drop policy if exists mimic_tasks_owner on public.mimic_tasks;
create policy mimic_tasks_owner on public.mimic_tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

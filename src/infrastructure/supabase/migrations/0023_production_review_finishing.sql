-- Measurable take review, editorial intent, finishing settings, and user evaluations.
alter table public.shot_generations
  add column if not exists media_inspection jsonb,
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending', 'pass', 'warning', 'rejected')),
  add column if not exists review_notes text;

alter table public.video_sequences
  add column if not exists finishing_settings jsonb not null default
    '{"color":"cinematic-neutral","audio":"preserve","loudnessTarget":-14,"captions":"none","delivery":"1080p"}'::jsonb,
  add column if not exists edit_version integer not null default 1;

alter table public.sequence_shots
  add column if not exists trim_start_seconds numeric not null default 0 check (trim_start_seconds >= 0),
  add column if not exists transition_type text not null default 'cut' check (transition_type in ('cut', 'dissolve', 'fade')),
  add column if not exists transition_seconds numeric not null default 0 check (transition_seconds between 0 and 2);

create table if not exists public.production_evaluations (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  story_score integer not null check (story_score between 1 and 5),
  continuity_score integer not null check (continuity_score between 1 and 5),
  visual_score integer not null check (visual_score between 1 and 5),
  editability_score integer not null check (editability_score between 1 and 5),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.production_evaluations enable row level security;
create policy production_evaluation_owner on public.production_evaluations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (
    select 1 from public.production_jobs j where j.id = production_job_id and j.user_id = auth.uid()
  ));
grant select, insert on public.production_evaluations to authenticated;
create index if not exists production_evaluations_job on public.production_evaluations(production_job_id, created_at desc);

-- Auditable production revisions and human-approved prompt corrections.
alter table public.production_jobs
  add column if not exists parent_job_id uuid references public.production_jobs(id) on delete set null,
  add column if not exists revision_number integer not null default 1 check (revision_number > 0);

create table if not exists public.shot_prompt_revisions (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null references public.shots(id) on delete cascade,
  take_id uuid references public.shot_generations(id) on delete set null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  previous_prompt text not null,
  proposed_prompt text not null,
  reviewer_note text,
  rationale jsonb not null default '[]'::jsonb,
  retained_anchors jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'discarded')),
  model text not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table public.shot_prompt_revisions enable row level security;
create policy shot_prompt_revision_owner on public.shot_prompt_revisions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.shots s
    join public.scenes sc on sc.id = s.scene_id
    join public.projects p on p.id = sc.project_id
    where s.id = shot_id and p.user_id = auth.uid()
  ));

grant select, insert, update on public.shot_prompt_revisions to authenticated;
create index if not exists shot_prompt_revisions_shot on public.shot_prompt_revisions(shot_id, created_at desc);
create index if not exists production_jobs_parent on public.production_jobs(parent_job_id, revision_number);
create unique index if not exists production_jobs_revision_unique
  on public.production_jobs(parent_job_id, revision_number) where parent_job_id is not null;

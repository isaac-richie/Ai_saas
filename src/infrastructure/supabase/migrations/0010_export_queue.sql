-- Export queue scaffold for batch media exports
create table if not exists public.export_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  profile text not null,
  target_format text not null,
  status text not null default 'queued', -- queued | processing | completed | failed
  progress integer not null default 0,
  output_url text,
  error_message text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.export_job_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references public.export_jobs(id) on delete cascade not null,
  shot_generation_id uuid references public.shot_generations(id) on delete cascade,
  source_url text,
  output_url text,
  order_index integer not null default 0,
  status text not null default 'queued', -- queued | processing | completed | failed
  error_message text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists idx_export_jobs_user_id on public.export_jobs(user_id);
create index if not exists idx_export_jobs_project_id on public.export_jobs(project_id);
create index if not exists idx_export_job_items_job_id on public.export_job_items(job_id);

alter table public.export_jobs enable row level security;
alter table public.export_job_items enable row level security;

create policy if not exists "Users manage export jobs" on public.export_jobs
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "Users manage export items via job" on public.export_job_items
  for all using (
    exists (
      select 1
      from public.export_jobs
      where export_jobs.id = export_job_items.job_id
        and export_jobs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.export_jobs
      where export_jobs.id = export_job_items.job_id
        and export_jobs.user_id = auth.uid()
    )
  );

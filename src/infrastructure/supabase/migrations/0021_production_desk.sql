-- Planning foundation. No video generation or quota consumption is triggered here.
create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brief text not null check (length(brief) between 8 and 4000),
  status text not null default 'brief' check (status in ('brief', 'awaiting_approval', 'approved')),
  plan jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'brief' and plan is null) or (status <> 'brief' and plan is not null and jsonb_typeof(plan) = 'object'))
);
create index production_jobs_owner on public.production_jobs(user_id, created_at desc);
create table public.production_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.production_jobs(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);
create index production_events_job on public.production_job_events(job_id, created_at);
alter table public.production_jobs enable row level security;
alter table public.production_job_events enable row level security;
create policy production_owner_read on public.production_jobs for select to authenticated using (user_id = auth.uid());
create policy production_owner_create on public.production_jobs for insert to authenticated with check (user_id = auth.uid() and status = 'brief' and plan is null);
create policy production_owner_update on public.production_jobs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy production_events_read on public.production_job_events for select to authenticated using (exists (select 1 from public.production_jobs j where j.id = job_id and j.user_id = auth.uid()));
grant select, insert, update on public.production_jobs to authenticated;
grant select on public.production_job_events to authenticated;

create function public.validate_production_transition() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.brief <> old.brief or new.id <> old.id then
    raise exception 'Production identity and brief are immutable';
  end if;
  if not ((old.status = 'brief' and new.status = 'awaiting_approval') or
          (old.status = 'awaiting_approval' and new.status = 'approved' and new.plan = old.plan)) then
    raise exception 'Invalid production transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger production_transition before update on public.production_jobs for each row execute function public.validate_production_transition();

create function public.record_production_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.production_job_events(job_id, status) values (new.id, new.status);
  return new;
end;
$$;
revoke all on function public.record_production_event() from public;
create trigger production_event after insert or update on public.production_jobs for each row execute function public.record_production_event();

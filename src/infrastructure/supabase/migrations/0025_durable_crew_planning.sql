-- Resumable, lease-protected production planning checkpoints.
alter table public.production_jobs
  add column if not exists planning_stage text not null default 'brief'
    check (planning_stage in ('brief', 'story', 'departments', 'shots', 'complete')),
  add column if not exists planning_context jsonb not null default '{}'::jsonb,
  add column if not exists planning_error text,
  add column if not exists planning_claimed_until timestamptz,
  add column if not exists planning_updated_at timestamptz;

create index if not exists production_jobs_planning_stage
  on public.production_jobs(user_id, planning_stage, planning_updated_at desc);

create or replace function public.validate_production_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.brief <> old.brief or new.id <> old.id then
    raise exception 'Production identity and brief are immutable';
  end if;
  if old.status = 'brief' and new.status = 'brief' and new.plan is not distinct from old.plan then
    new.updated_at := now();
    return new;
  end if;
  if (old.status = 'brief' and new.status = 'awaiting_approval') or
     (old.status = 'awaiting_approval' and new.status = 'approved' and new.plan = old.plan) then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'approved' and new.status = 'approved' and new.plan = old.plan and
     old.project_id is null and new.project_id is not null and
     new.scene_id is not null and new.sequence_id is not null then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'Invalid production transition';
end;
$$;

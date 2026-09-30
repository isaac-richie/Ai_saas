-- Repeated clicks for the same in-flight selection share one export job.
alter table public.export_jobs add column if not exists request_hash text;

create unique index if not exists idx_export_jobs_active_request
  on public.export_jobs(user_id, project_id, request_hash)
  where request_hash is not null and status in ('preparing', 'queued', 'processing');

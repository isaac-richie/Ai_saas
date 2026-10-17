-- Long film briefs: the app accepts up to 50,000 characters (pasted scripts or JSON breakdowns);
-- the crew reads the whole brief. 0021 capped the column at 4,000.
alter table public.production_jobs drop constraint if exists production_jobs_brief_check;
alter table public.production_jobs
  add constraint production_jobs_brief_check check (length(brief) between 8 and 50000);

-- Account-level reference setups, with optimistic revisions to avoid lost updates.
create table if not exists public.fast_video_reference_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reference_assets jsonb not null default '[]'::jsonb,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint reference_library_bounds check (
    jsonb_typeof(reference_assets) = 'array'
    and jsonb_array_length(reference_assets) <= 120
    and octet_length(reference_assets::text) <= 1000000
  )
);
alter table public.fast_video_reference_libraries enable row level security;
drop policy if exists "Own reference library" on public.fast_video_reference_libraries;
create policy "Own reference library" on public.fast_video_reference_libraries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.fast_video_reference_libraries from anon;
grant select, insert, update on public.fast_video_reference_libraries to authenticated;

-- Shared analysis limits across serverless instances. Only this function can consume.
create table if not exists public.reference_analysis_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null,
  minute_count integer not null,
  day_start date not null,
  day_count integer not null
);
alter table public.reference_analysis_usage enable row level security;
revoke all on public.reference_analysis_usage from anon, authenticated;

create or replace function public.consume_reference_analysis()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_user_id uuid := auth.uid();
  consumed uuid;
  current_minute timestamptz := date_trunc('minute', now());
  current_day date := (now() at time zone 'UTC')::date;
begin
  if current_user_id is null then return false; end if;
  insert into public.reference_analysis_usage(user_id, minute_start, minute_count, day_start, day_count)
  values(current_user_id, current_minute, 1, current_day, 1)
  on conflict (user_id) do update set
    minute_start = current_minute,
    minute_count = case when reference_analysis_usage.minute_start = current_minute then reference_analysis_usage.minute_count + 1 else 1 end,
    day_start = current_day,
    day_count = case when reference_analysis_usage.day_start = current_day then reference_analysis_usage.day_count + 1 else 1 end
  where (reference_analysis_usage.minute_start <> current_minute or reference_analysis_usage.minute_count < 6)
    and (reference_analysis_usage.day_start <> current_day or reference_analysis_usage.day_count < 60)
  returning user_id into consumed;
  return consumed is not null;
end;
$$;
revoke all on function public.consume_reference_analysis() from public, anon;
grant execute on function public.consume_reference_analysis() to authenticated;

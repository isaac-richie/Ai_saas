-- Raise the free plan's Fast Track allowance from 5 to 10 generations.
-- Idempotent: safe to run more than once.

-- 1) Plan definition used when entitlements are provisioned.
update public.plans
set
  features_json = jsonb_set(features_json, '{max_fast_video_generations}', '10'::jsonb, true),
  updated_at = now()
where code = 'creator_free';

-- 2) Existing free users.
update public.entitlements
set
  max_fast_video_generations = 10,
  updated_at = now()
where plan_code = 'creator_free'
  and (max_fast_video_generations is null or max_fast_video_generations < 10);

-- 3) Older plan-assignment code still writes a literal 5 for free users.
--    Enforce the new floor on every free-plan entitlement write instead of
--    rewriting that function. Paid plans (null = unlimited) are untouched.
create or replace function public.enforce_free_fast_track_floor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan_code = 'creator_free'
    and new.max_fast_video_generations is not null
    and new.max_fast_video_generations < 10 then
    new.max_fast_video_generations := 10;
  end if;
  return new;
end;
$$;

drop trigger if exists entitlements_free_fast_track_floor on public.entitlements;
create trigger entitlements_free_fast_track_floor
  before insert or update on public.entitlements
  for each row execute function public.enforce_free_fast_track_floor();

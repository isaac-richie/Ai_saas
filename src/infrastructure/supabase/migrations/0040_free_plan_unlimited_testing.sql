-- Public test period: remove the free plan's generation and project limits.
-- null means unlimited everywhere (reserve_usage_quota, canCreateProject).
-- Usage is still counted, so limits can be restored later without losing history.
-- Idempotent: safe to run more than once.

-- 1) Plan definition used when entitlements are provisioned.
update public.plans
set
  features_json = features_json
    || jsonb_build_object('max_projects', null, 'max_studio_generations', null, 'max_fast_video_generations', null),
  updated_at = now()
where code = 'creator_free';

-- 2) Existing free users.
update public.entitlements
set
  max_projects = null,
  max_studio_generations = null,
  max_fast_video_generations = null,
  updated_at = now()
where plan_code = 'creator_free';

-- 3) Older plan-assignment code still writes numeric free limits. While testing,
--    keep every free-plan entitlement write unlimited. (Replaces the 0033/0037 floor.)
create or replace function public.enforce_free_fast_track_floor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan_code = 'creator_free' then
    new.max_projects := null;
    new.max_studio_generations := null;
    new.max_fast_video_generations := null;
  end if;
  return new;
end;
$$;

drop trigger if exists entitlements_free_fast_track_floor on public.entitlements;
create trigger entitlements_free_fast_track_floor
  before insert or update on public.entitlements
  for each row execute function public.enforce_free_fast_track_floor();

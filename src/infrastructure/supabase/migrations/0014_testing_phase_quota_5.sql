-- Testing phase override:
-- keep billing system in place, but allow free users up to 5 Studio + 5 Fast Track uses.

update public.plans
set
  features_json = jsonb_set(
    jsonb_set(features_json, '{max_studio_generations}', '5'::jsonb, true),
    '{max_fast_video_generations}',
    '5'::jsonb,
    true
  ),
  updated_at = now()
where code = 'creator_free';

update public.entitlements
set
  max_studio_generations = 5,
  max_fast_video_generations = 5,
  updated_at = now()
where plan_code = 'creator_free';

create or replace function public.consume_usage_quota(p_user_id uuid, p_feature text)
returns table(
  allowed boolean,
  used_count integer,
  max_count integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_used integer;
  v_fast_video_used integer;
  v_studio_max integer;
  v_fast_video_max integer;
  v_effective_studio_max integer;
  v_effective_fast_video_max integer;
begin
  perform public.ensure_user_billing_state(p_user_id);

  select
    uc.studio_generations_used,
    uc.fast_video_generations_used,
    e.max_studio_generations,
    e.max_fast_video_generations
  into
    v_studio_used,
    v_fast_video_used,
    v_studio_max,
    v_fast_video_max
  from public.usage_counters uc
  join public.entitlements e on e.user_id = uc.user_id
  where uc.user_id = p_user_id;

  -- Testing override: minimum of 5 uses for capped plans.
  v_effective_studio_max := case
    when v_studio_max is null then null
    else greatest(v_studio_max, 5)
  end;

  v_effective_fast_video_max := case
    when v_fast_video_max is null then null
    else greatest(v_fast_video_max, 5)
  end;

  if p_feature = 'studio' then
    if v_effective_studio_max is not null and v_studio_used >= v_effective_studio_max then
      return query select false, v_studio_used, v_effective_studio_max, greatest(v_effective_studio_max - v_studio_used, 0);
      return;
    end if;

    update public.usage_counters
    set studio_generations_used = studio_generations_used + 1, updated_at = now()
    where user_id = p_user_id;

    v_studio_used := v_studio_used + 1;
    return query select true, v_studio_used, v_effective_studio_max, case when v_effective_studio_max is null then null else greatest(v_effective_studio_max - v_studio_used, 0) end;
    return;
  elsif p_feature = 'fast_video' then
    if v_effective_fast_video_max is not null and v_fast_video_used >= v_effective_fast_video_max then
      return query select false, v_fast_video_used, v_effective_fast_video_max, greatest(v_effective_fast_video_max - v_fast_video_used, 0);
      return;
    end if;

    update public.usage_counters
    set fast_video_generations_used = fast_video_generations_used + 1, updated_at = now()
    where user_id = p_user_id;

    v_fast_video_used := v_fast_video_used + 1;
    return query select true, v_fast_video_used, v_effective_fast_video_max, case when v_effective_fast_video_max is null then null else greatest(v_effective_fast_video_max - v_fast_video_used, 0) end;
    return;
  else
    return query select false, 0, 0, 0;
    return;
  end if;
end;
$$;


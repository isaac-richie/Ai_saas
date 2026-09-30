-- Serialize quota decisions per user. The previous function read a counter
-- without locking it, allowing simultaneous submissions past the cap.
create or replace function public.consume_usage_quota(p_user_id uuid, p_feature text)
returns table(allowed boolean, used_count integer, max_count integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_max integer;
begin
  if auth.uid() is distinct from p_user_id
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Not authorized to consume another user quota';
  end if;

  if p_feature not in ('studio', 'fast_video') then
    return query select false, 0, 0, 0;
    return;
  end if;

  perform public.ensure_user_billing_state(p_user_id);

  -- Lock the same counter row for both features before checking or updating.
  -- The second concurrent request waits and reads the first request's result.
  select
    case when p_feature = 'studio' then uc.studio_generations_used else uc.fast_video_generations_used end,
    case when p_feature = 'studio' then e.max_studio_generations else e.max_fast_video_generations end
  into v_used, v_max
  from public.usage_counters uc
  join public.entitlements e on e.user_id = uc.user_id
  where uc.user_id = p_user_id
  for update of uc;

  if not found then
    raise exception 'Usage quota is not configured for this user';
  end if;

  -- Preserve migration 0014's five-use minimum for capped test plans.
  if v_max is not null then
    v_max := greatest(v_max, 5);
  end if;

  if v_max is not null and v_used >= v_max then
    return query select false, v_used, v_max, greatest(v_max - v_used, 0);
    return;
  end if;

  if p_feature = 'studio' then
    update public.usage_counters
    set studio_generations_used = studio_generations_used + 1, updated_at = now()
    where user_id = p_user_id;
  else
    update public.usage_counters
    set fast_video_generations_used = fast_video_generations_used + 1, updated_at = now()
    where user_id = p_user_id;
  end if;

  v_used := v_used + 1;
  return query select true, v_used, v_max,
    case when v_max is null then null else greatest(v_max - v_used, 0) end;
end;
$$;

-- These are generation allowance units, not provider-billed Kie credits.
-- The reservation ID makes release idempotent after a definite rejection.
create table if not exists public.usage_reservations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('studio', 'fast_video')),
  status text not null check (status in ('reserved', 'committed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_usage_reservations_user on public.usage_reservations(user_id, created_at desc);
alter table public.usage_reservations enable row level security;
create policy usage_reservations_owner_read on public.usage_reservations
  for select to authenticated using (user_id = auth.uid());

create or replace function public.reserve_usage_quota(
  p_user_id uuid, p_feature text, p_reservation_id uuid
)
returns table(allowed boolean, used_count integer, max_count integer, remaining integer, reservation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_max integer;
  v_existing public.usage_reservations%rowtype;
begin
  if auth.uid() is distinct from p_user_id
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Not authorized to reserve another user quota';
  end if;
  if p_feature not in ('studio', 'fast_video') or p_reservation_id is null then
    raise exception 'Invalid quota reservation';
  end if;

  perform public.ensure_user_billing_state(p_user_id);
  select
    case when p_feature = 'studio' then uc.studio_generations_used else uc.fast_video_generations_used end,
    case when p_feature = 'studio' then e.max_studio_generations else e.max_fast_video_generations end
  into v_used, v_max
  from public.usage_counters uc
  join public.entitlements e on e.user_id = uc.user_id
  where uc.user_id = p_user_id
  for update of uc;
  if not found then raise exception 'Usage quota is not configured for this user'; end if;
  if v_max is not null then v_max := greatest(v_max, 5); end if;

  select * into v_existing from public.usage_reservations where id = p_reservation_id for update;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.feature <> p_feature then
      raise exception 'Reservation does not match this request';
    end if;
    return query select v_existing.status <> 'released', v_used, v_max,
      case when v_max is null then null else greatest(v_max - v_used, 0) end,
      p_reservation_id;
    return;
  end if;

  if v_max is not null and v_used >= v_max then
    return query select false, v_used, v_max, 0, null::uuid;
    return;
  end if;

  insert into public.usage_reservations(id, user_id, feature, status)
  values (p_reservation_id, p_user_id, p_feature, 'reserved');
  if p_feature = 'studio' then
    update public.usage_counters set studio_generations_used = studio_generations_used + 1, updated_at = now()
    where user_id = p_user_id;
  else
    update public.usage_counters set fast_video_generations_used = fast_video_generations_used + 1, updated_at = now()
    where user_id = p_user_id;
  end if;
  v_used := v_used + 1;
  return query select true, v_used, v_max,
    case when v_max is null then null else greatest(v_max - v_used, 0) end,
    p_reservation_id;
end;
$$;

create or replace function public.settle_usage_quota(
  p_user_id uuid, p_reservation_id uuid, p_commit boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.usage_reservations%rowtype;
begin
  if auth.uid() is distinct from p_user_id
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Not authorized to settle another user quota';
  end if;

  -- Match the lock order used by reserve_usage_quota.
  perform 1 from public.usage_counters where user_id = p_user_id for update;
  select * into v_reservation from public.usage_reservations
  where id = p_reservation_id and user_id = p_user_id for update;
  if not found then return false; end if;
  if v_reservation.status <> 'reserved' then return true; end if;

  if p_commit then
    update public.usage_reservations set status = 'committed', updated_at = now()
    where id = p_reservation_id;
  else
    if v_reservation.feature = 'studio' then
      update public.usage_counters
      set studio_generations_used = greatest(studio_generations_used - 1, 0), updated_at = now()
      where user_id = p_user_id;
    else
      update public.usage_counters
      set fast_video_generations_used = greatest(fast_video_generations_used - 1, 0), updated_at = now()
      where user_id = p_user_id;
    end if;
    update public.usage_reservations set status = 'released', updated_at = now()
    where id = p_reservation_id;
  end if;
  return true;
end;
$$;

revoke all on function public.reserve_usage_quota(uuid, text, uuid) from public;
revoke all on function public.settle_usage_quota(uuid, uuid, boolean) from public;
revoke all on function public.settle_usage_quota(uuid, uuid, boolean) from authenticated;
grant execute on function public.reserve_usage_quota(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.settle_usage_quota(uuid, uuid, boolean) to service_role;

create table if not exists public.plans (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  price_cents integer not null default 0,
  billing_type text not null check (billing_type in ('free', 'one_time', 'monthly')),
  features_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code),
  status text not null default 'active',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code) default 'creator_free',
  max_projects integer,
  max_storage_gb integer,
  max_studio_generations integer,
  max_fast_video_generations integer,
  can_batch_generate boolean not null default false,
  can_team boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  studio_generations_used integer not null default 0,
  fast_video_generations_used integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_plan_code on public.subscriptions(plan_code);

insert into public.plans (code, name, price_cents, billing_type, features_json, is_active)
values
  (
    'creator_free',
    'Creator Free',
    0,
    'free',
    '{"max_projects":5,"max_studio_generations":5,"max_fast_video_generations":5,"can_batch_generate":false,"can_team":false}'::jsonb,
    true
  ),
  (
    'studio_pro',
    'Studio Pro',
    3900,
    'one_time',
    '{"max_projects":null,"max_studio_generations":null,"max_fast_video_generations":null,"can_batch_generate":true,"can_team":true}'::jsonb,
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  price_cents = excluded.price_cents,
  billing_type = excluded.billing_type,
  features_json = excluded.features_json,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.usage_counters enable row level security;

drop policy if exists "Public read plans" on public.plans;
create policy "Public read plans" on public.plans
for select
using (true);

drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions" on public.subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own entitlements" on public.entitlements;
create policy "Users can read own entitlements" on public.entitlements
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own usage counters" on public.usage_counters;
create policy "Users can read own usage counters" on public.usage_counters
for select
using (auth.uid() = user_id);

create or replace function public.apply_plan_to_user(
  p_user_id uuid,
  p_plan_code text,
  p_status text default 'active',
  p_provider text default null,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_current_period_end timestamptz default null,
  p_cancel_at_period_end boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (
    user_id,
    plan_code,
    status,
    provider,
    provider_customer_id,
    provider_subscription_id,
    current_period_end,
    cancel_at_period_end,
    updated_at
  )
  values (
    p_user_id,
    p_plan_code,
    coalesce(p_status, 'active'),
    p_provider,
    p_provider_customer_id,
    p_provider_subscription_id,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    now()
  )
  on conflict (user_id) do update
  set
    plan_code = excluded.plan_code,
    status = excluded.status,
    provider = excluded.provider,
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = now();

  if p_plan_code = 'studio_pro' then
    insert into public.entitlements (
      user_id,
      plan_code,
      max_projects,
      max_storage_gb,
      max_studio_generations,
      max_fast_video_generations,
      can_batch_generate,
      can_team,
      updated_at
    )
    values (
      p_user_id,
      'studio_pro',
      null,
      100,
      null,
      null,
      true,
      true,
      now()
    )
    on conflict (user_id) do update
    set
      plan_code = 'studio_pro',
      max_projects = null,
      max_storage_gb = 100,
      max_studio_generations = null,
      max_fast_video_generations = null,
      can_batch_generate = true,
      can_team = true,
      updated_at = now();
  else
    insert into public.entitlements (
      user_id,
      plan_code,
      max_projects,
      max_storage_gb,
      max_studio_generations,
      max_fast_video_generations,
      can_batch_generate,
      can_team,
      updated_at
    )
    values (
      p_user_id,
      'creator_free',
      5,
      5,
      5,
      5,
      false,
      false,
      now()
    )
    on conflict (user_id) do update
    set
      plan_code = 'creator_free',
      max_projects = 5,
      max_storage_gb = 5,
      max_studio_generations = 5,
      max_fast_video_generations = 5,
      can_batch_generate = false,
      can_team = false,
      updated_at = now();
  end if;

  insert into public.usage_counters (user_id, studio_generations_used, fast_video_generations_used, updated_at)
  values (p_user_id, 0, 0, now())
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.ensure_user_billing_state(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  perform public.apply_plan_to_user(
    p_user_id,
    coalesce((select plan_code from public.subscriptions where user_id = p_user_id), 'creator_free'),
    coalesce((select status from public.subscriptions where user_id = p_user_id), 'active'),
    coalesce((select provider from public.subscriptions where user_id = p_user_id), 'system'),
    (select provider_customer_id from public.subscriptions where user_id = p_user_id),
    (select provider_subscription_id from public.subscriptions where user_id = p_user_id),
    (select current_period_end from public.subscriptions where user_id = p_user_id),
    coalesce((select cancel_at_period_end from public.subscriptions where user_id = p_user_id), false)
  );
end;
$$;

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

  if p_feature = 'studio' then
    if v_studio_max is not null and v_studio_used >= v_studio_max then
      return query select false, v_studio_used, v_studio_max, greatest(v_studio_max - v_studio_used, 0);
      return;
    end if;

    update public.usage_counters
    set studio_generations_used = studio_generations_used + 1, updated_at = now()
    where user_id = p_user_id;

    v_studio_used := v_studio_used + 1;
    return query select true, v_studio_used, v_studio_max, case when v_studio_max is null then null else greatest(v_studio_max - v_studio_used, 0) end;
    return;
  elsif p_feature = 'fast_video' then
    if v_fast_video_max is not null and v_fast_video_used >= v_fast_video_max then
      return query select false, v_fast_video_used, v_fast_video_max, greatest(v_fast_video_max - v_fast_video_used, 0);
      return;
    end if;

    update public.usage_counters
    set fast_video_generations_used = fast_video_generations_used + 1, updated_at = now()
    where user_id = p_user_id;

    v_fast_video_used := v_fast_video_used + 1;
    return query select true, v_fast_video_used, v_fast_video_max, case when v_fast_video_max is null then null else greatest(v_fast_video_max - v_fast_video_used, 0) end;
    return;
  else
    return query select false, 0, 0, 0;
    return;
  end if;
end;
$$;

create or replace function public.handle_new_user_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_plan_to_user(new.id, 'creator_free', 'active', 'system');
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.triggers
    where event_object_schema = 'auth'
      and event_object_table = 'users'
      and trigger_name = 'on_auth_user_billing_created'
  ) then
    execute 'drop trigger on_auth_user_billing_created on auth.users';
  end if;
end $$;

create trigger on_auth_user_billing_created
after insert on auth.users
for each row
execute function public.handle_new_user_billing();

do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.ensure_user_billing_state(u.id);
  end loop;
end $$;

revoke all on function public.apply_plan_to_user(uuid, text, text, text, text, text, timestamptz, boolean) from public;
revoke all on function public.ensure_user_billing_state(uuid) from public;
revoke all on function public.consume_usage_quota(uuid, text) from public;

grant execute on function public.ensure_user_billing_state(uuid) to authenticated, service_role;
grant execute on function public.consume_usage_quota(uuid, text) to authenticated, service_role;
grant execute on function public.apply_plan_to_user(uuid, text, text, text, text, text, timestamptz, boolean) to service_role;

create table if not exists public.inner_circle_waitlist (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  instagram_handle text not null,
  social_handle text not null,
  email text not null,
  referral_code text not null unique,
  referred_by_code text null,
  referral_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inner_circle_waitlist_email_key unique (email)
);

create index if not exists idx_inner_circle_waitlist_referral_code
  on public.inner_circle_waitlist(referral_code);

create index if not exists idx_inner_circle_waitlist_referred_by
  on public.inner_circle_waitlist(referred_by_code);

create or replace function public.increment_referral_count_inner_circle(code_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inner_circle_waitlist
  set referral_count = referral_count + 1
  where referral_code = upper(trim(code_input));
end;
$$;

create or replace function public.set_inner_circle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inner_circle_waitlist_updated_at on public.inner_circle_waitlist;
create trigger trg_inner_circle_waitlist_updated_at
before update on public.inner_circle_waitlist
for each row
execute function public.set_inner_circle_updated_at();

alter table public.inner_circle_waitlist enable row level security;

-- Public reads/writes should only happen via server routes using service role.
drop policy if exists "No direct select" on public.inner_circle_waitlist;
create policy "No direct select"
  on public.inner_circle_waitlist
  for select
  using (false);

drop policy if exists "No direct insert" on public.inner_circle_waitlist;
create policy "No direct insert"
  on public.inner_circle_waitlist
  for insert
  with check (false);

drop policy if exists "No direct update" on public.inner_circle_waitlist;
create policy "No direct update"
  on public.inner_circle_waitlist
  for update
  using (false);

drop policy if exists "No direct delete" on public.inner_circle_waitlist;
create policy "No direct delete"
  on public.inner_circle_waitlist
  for delete
  using (false);

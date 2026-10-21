-- Inner Circle beta form v2: email first, one optional social handle, an optional
-- "#1 problem with AI video tools" answer. Extends the existing waitlist table so
-- earlier sign-ups and the admin page keep working.
-- Idempotent: safe to run more than once.

alter table public.inner_circle_waitlist
  add column if not exists feedback_text text check (feedback_text is null or length(feedback_text) <= 1000),
  add column if not exists ip_address text,
  add column if not exists cohort text not null default 'Beta Waitlist',
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inner_circle_waitlist_status_check') then
    alter table public.inner_circle_waitlist
      add constraint inner_circle_waitlist_status_check check (status in ('pending', 'invited', 'active', 'declined'));
  end if;
end $$;

-- Handles are optional now; only email is required.
alter table public.inner_circle_waitlist alter column instagram_handle drop not null;
alter table public.inner_circle_waitlist alter column social_handle drop not null;

create index if not exists idx_inner_circle_waitlist_status on public.inner_circle_waitlist(status, created_at desc);

notify pgrst, 'reload schema';

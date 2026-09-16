alter table public.production_jobs
  add column if not exists reference_assets jsonb not null default '[]'::jsonb
  check (jsonb_typeof(reference_assets) = 'array' and jsonb_array_length(reference_assets) <= 6);

create or replace function public.freeze_production_references()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.reference_assets is distinct from old.reference_assets then
    raise exception 'Create a revised production to change saved references';
  end if;
  return new;
end;
$$;
drop trigger if exists production_references_immutable on public.production_jobs;
create trigger production_references_immutable before update on public.production_jobs
for each row execute function public.freeze_production_references();

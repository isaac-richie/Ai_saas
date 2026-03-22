-- Required storage buckets for uploads and generated media
insert into storage.buckets (id, name, public)
values
  ('elements', 'elements', true),
  ('renders', 'renders', true)
on conflict (id) do nothing;

-- ELEMENTS bucket policies
drop policy if exists "Elements read access" on storage.objects;
create policy "Elements read access"
on storage.objects for select
using (bucket_id = 'elements');

drop policy if exists "Elements upload own folder" on storage.objects;
create policy "Elements upload own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'elements'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Elements update own folder" on storage.objects;
create policy "Elements update own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'elements'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Elements delete own folder" on storage.objects;
create policy "Elements delete own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'elements'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- RENDERS bucket policies
drop policy if exists "Renders read access" on storage.objects;
create policy "Renders read access"
on storage.objects for select
using (bucket_id = 'renders');

drop policy if exists "Renders upload own folder" on storage.objects;
create policy "Renders upload own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'renders'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Renders update own folder" on storage.objects;
create policy "Renders update own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'renders'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Renders delete own folder" on storage.objects;
create policy "Renders delete own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'renders'
  and (storage.foldername(name))[1] = auth.uid()::text
);

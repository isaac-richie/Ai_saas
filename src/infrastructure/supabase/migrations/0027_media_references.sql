-- Private, immutable reference uploads. Files remain when detached from a shot.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media-references', 'media-references', false, 26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime',
        'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Own reference uploads" on storage.objects;
create policy "Own reference uploads" on storage.objects for insert to authenticated
with check (bucket_id = 'media-references' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Own reference reads" on storage.objects;
create policy "Own reference reads" on storage.objects for select to authenticated
using (bucket_id = 'media-references' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.fast_video_storyboard_items
  add column if not exists media_references jsonb not null default '[]'::jsonb;
alter table public.fast_video_storyboard_items drop constraint if exists storyboard_media_references_array;
alter table public.fast_video_storyboard_items add constraint storyboard_media_references_array
  check (jsonb_typeof(media_references) = 'array' and jsonb_array_length(media_references) <= 6);

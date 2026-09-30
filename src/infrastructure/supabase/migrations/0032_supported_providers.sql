-- Only list adapters that this application can instantiate.
insert into public.providers (name, slug, base_url, is_active)
values ('Kie.ai', 'kie', 'https://api.kie.ai/api/v1', true)
on conflict (slug) do update set base_url = excluded.base_url, is_active = true;

update public.providers set is_active = false where slug in ('midjourney', 'pika');

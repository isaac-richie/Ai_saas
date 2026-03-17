-- WARNING: Prototype reset. This rebuilds shot_options as the preset library.

drop table if exists shot_options cascade;

create table public.shot_generations (
  id            uuid primary key default gen_random_uuid(),
  shot_id       uuid not null references public.shots(id) on delete cascade,
  provider_id   uuid references public.providers(id),
  prompt        text not null,
  negative_prompt text,
  seed          int,
  cfg_scale     numeric,
  steps         int,
  model_version text,
  status        text not null default 'pending',
  output_url    text,
  parameters    jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_shot_generations_shot_id on public.shot_generations(shot_id);

alter table public.shot_generations enable row level security;

create policy "Users manage shot generations via shot" on public.shot_generations
  for all using (
    exists (
      select 1
      from public.shots
      join public.scenes on scenes.id = shots.scene_id
      join public.projects on projects.id = scenes.project_id
      where shots.id = shot_generations.shot_id
        and projects.user_id = auth.uid()
    )
  );

create table public.shot_options (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  key         text not null,
  label       text not null,
  descriptor  text not null,
  sort_order  int not null default 0,
  active      bool not null default true,
  created_at  timestamptz not null default now(),
  unique (category, key)
);

alter table public.shot_options enable row level security;

create policy "Public read shot options" on public.shot_options
  for select using (true);

-- Minimal seed set (replace with shot_options_UPGRADED.sql for full library)
insert into public.shot_options (category, key, label, descriptor, sort_order) values
  ('shot', 'wide', 'Wide Shot', 'wide establishing shot', 1),
  ('shot', 'close', 'Close-up', 'intimate close-up framing', 2),
  ('angle', 'low', 'Low Angle', 'dramatic low angle', 1),
  ('angle', 'high', 'High Angle', 'overhead high angle', 2),
  ('camera', 'cinematic', 'Cinematic Sensor', 'exceptional dynamic range, rich shadow detail, organic highlight rolloff', 1),
  ('lens', 'cinelens', 'Cine Lens', 'natural perspective, smooth falloff, pleasing bokeh', 1),
  ('movement', 'static', 'Static', 'locked-off static camera', 1),
  ('movement', 'dolly', 'Dolly In', 'slow dolly in movement', 2),
  ('lighting', 'soft', 'Soft Key', 'soft diffused key light with gentle contrast', 1),
  ('lighting', 'hard', 'Hard Key', 'hard key light with crisp shadows', 2),
  ('timeOfDay', 'golden', 'Golden Hour', 'golden hour light with warm amber sun', 1),
  ('timeOfDay', 'blue', 'Blue Hour', 'blue hour twilight ambience', 2),
  ('colorGrade', 'kodak', 'Kodak Film', 'Kodak Vision3 film stock warmth', 1),
  ('colorGrade', 'bleach', 'Bleach Bypass', 'desaturated bleach bypass grade', 2),
  ('depthOfField', 'shallow', 'Shallow DOF', 'extremely shallow depth of field, creamy bokeh', 1),
  ('depthOfField', 'deep', 'Deep Focus', 'deep focus with crisp foreground and background', 2),
  ('aspectRatio', '239', '2.39:1', 'ultra-wide 2.39:1 anamorphic framing', 1),
  ('aspectRatio', '169', '16:9', '16:9 widescreen framing', 2),
  ('genreMood', 'noir', 'Neo Noir', 'moody neo-noir aesthetic with rich shadows', 1),
  ('genreMood', 'epic', 'Epic', 'epic cinematic scale and atmosphere', 2);

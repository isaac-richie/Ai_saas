-- Visiowave / AISAS Supabase rebuild from zero
-- Generated from src/infrastructure/supabase/migrations on 2026-07-22.
-- Run this on a fresh Supabase project in the SQL Editor.
-- This creates schema, RLS policies, functions, seed rows, storage buckets, and beta support tables.


-- ============================================================
-- src/infrastructure/supabase/migrations/0000_init_schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROJECTS
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  aspect_ratio TEXT DEFAULT '16:9',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- SCENES
CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  script_content TEXT,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- CAMERAS (Virtual Camera Configurations)
CREATE TABLE cameras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sensor_size TEXT DEFAULT '35mm',
  lens_mount TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- LENSES
CREATE TABLE lenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  focal_length INTEGER NOT NULL, -- in mm
  aperture TEXT, -- e.g. "f/2.8"
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- SHOTS
CREATE TABLE shots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE NOT NULL,
  camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  lens_id UUID REFERENCES lenses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT, -- Visual description/prompt base
  shot_type TEXT, -- Wide, Close-up, etc.
  camera_movement TEXT, -- Pan, Tilt, Dolly
  sequence_order INTEGER NOT NULL DEFAULT 0,
  estimated_duration INTEGER, -- in frames or seconds
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- PROVIDERS (AI Services)
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE, -- Midjourney, Runway, Pika
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- USER API KEYS
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  encrypted_key TEXT NOT NULL, -- In production, use standard PGP or similar env based encryption
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, provider_id)
);

-- SHOT OPTIONS (AI Generation Parameters)
CREATE TABLE shot_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  seed BIGINT,
  cfg_scale DECIMAL,
  steps INTEGER,
  model_version TEXT,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  output_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ELEMENTS (Assets: Characters, Props, Locations)
CREATE TABLE elements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- character, prop, location
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- SHOT ELEMENTS (Join Table)
CREATE TABLE shot_elements (
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE NOT NULL,
  element_id UUID REFERENCES elements(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (shot_id, element_id)
);


-- ROW LEVEL SECURITY

-- Projects: Users can only see their own projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Scenes: Access if user owns the parent project
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view scenes of own projects" ON scenes FOR SELECT 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can insert scenes to own projects" ON scenes FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update scenes of own projects" ON scenes FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete scenes of own projects" ON scenes FOR DELETE 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = scenes.project_id AND projects.user_id = auth.uid()));

-- Cameras: Access if user owns the parent project
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage cameras of own projects" ON cameras FOR ALL 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = cameras.project_id AND projects.user_id = auth.uid()));

-- Lenses: Access if user owns the parent project
ALTER TABLE lenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage lenses of own projects" ON lenses FOR ALL 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = lenses.project_id AND projects.user_id = auth.uid()));

-- Shots: Access if user owns the parent scene->project
-- Note: Deep nesting RLS can be performance intensive. 
-- Optimization: De-normalize user_id to shots? Or just trust the chain. 
-- For now, verifying via scene link.
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage shots via scenes" ON shots FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM scenes 
    JOIN projects ON scenes.project_id = projects.id 
    WHERE scenes.id = shots.scene_id AND projects.user_id = auth.uid()
  ));

-- Providers: Publicly readable (system defined), but not writeable by normal users
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read providers" ON providers FOR SELECT USING (true);
-- No insert/update for normal users

-- User API Keys: Only own keys
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own keys" ON user_api_keys FOR ALL USING (auth.uid() = user_id);

-- Shot Options
ALTER TABLE shot_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage shot options via shot" ON shot_options FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM shots 
    JOIN scenes ON shots.scene_id = scenes.id
    JOIN projects ON scenes.project_id = projects.id
    WHERE shots.id = shot_options.shot_id AND projects.user_id = auth.uid()
  ));

-- Elements
ALTER TABLE elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage elements of own projects" ON elements FOR ALL 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = elements.project_id AND projects.user_id = auth.uid()));

-- Shot Elements
ALTER TABLE shot_elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage shot elements" ON shot_elements FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM shots 
    JOIN scenes ON shots.scene_id = scenes.id
    JOIN projects ON scenes.project_id = projects.id
    WHERE shots.id = shot_elements.shot_id AND projects.user_id = auth.uid()
  ));


-- INDEXES FOR PERFORMANCE
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_scenes_project_id ON scenes(project_id);
CREATE INDEX idx_shots_scene_id ON shots(scene_id);
CREATE INDEX idx_shots_camera_id ON shots(camera_id);
CREATE INDEX idx_shots_lens_id ON shots(lens_id);
CREATE INDEX idx_shot_options_shot_id ON shot_options(shot_id);
CREATE INDEX idx_elements_project_id ON elements(project_id);
CREATE INDEX idx_shot_elements_shot_id ON shot_elements(shot_id);
CREATE INDEX idx_shot_elements_element_id ON shot_elements(element_id);


-- ============================================================
-- src/infrastructure/supabase/migrations/0001_seed_providers.sql
-- ============================================================

-- Seed Providers
INSERT INTO providers (name, slug, base_url, is_active) VALUES
('Midjourney', 'midjourney', 'https://api.midjourney.com', true),
('Runway', 'runway', 'https://api.runwayml.com', true),
('Pika', 'pika', 'https://api.pika.art', true),
('OpenAI', 'openai', 'https://api.openai.com', true)
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- src/infrastructure/supabase/migrations/0002_seed_gear.sql
-- ============================================================

-- Seed Cameras (Virtual User ID needs to be handled or these should be system/public assets? 
-- In our schema, cameras/lenses are linked to projects. 
-- For a "Global" gear list, we might need a system_assets table or just let users define them. 
-- However, for the purpose of this generic "Shot Builder" feeling like a tool, 
-- we will insert them as templates if we had a templates system, 
-- BUT re-reading the schema: cameras/lenses are project specific (project_id). 
-- This might be tedious for the user. 
-- ADJUSTMENT: For this task, I will creating a generic "System Project" or similar is complex.
-- BETTER APPROACH: I will just create a setup script that inserts them for the current project when a user initializes it, 
-- OR for the sake of this prompt, I will modify the schema or just assume the user will add them?
-- INITIAL PLAN SAID: "Populate cameras ... and lenses".
-- Let's stick to the schema. 
-- Actually, a better UX is having a "Default Gear List" available to all projects.
-- But given the current schema constraint (project_id), I will create a helper action to "Seed Project Gear" 
-- or I can just insert them for a specific user if I knew the ID.
-- SINCE I CANNOT KNOW PROJECT ID in a migration:
-- I will skip the migration for *data* that depends on dynamic project IDs.
-- INSTEAD, I will create a "System" set of gear in the UI code (constants) 
-- that can be 'selected' and then saved as a row in the DB if customized, 
-- OR I will create a 'presets' table.
-- Refine Plan: I will create a `constants/gear.ts` file with this data to populate the *dropdowns* 
-- and when saved, we only save the *names* or we insert them into the DB?
-- Schema says `shot` has `camera_id` and `lens_id`. 
-- So they MUST be in the DB.
-- Okay, I will create a migration that adds a `is_global` flag to cameras/lenses 
-- so they can be shared across projects, OR make project_id nullable for global assets.

-- Let's MODIFY SCHEMA to allow global gear.
ALTER TABLE cameras ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE lenses ALTER COLUMN project_id DROP NOT NULL;

-- NOW SEED GLOBAL GEAR
INSERT INTO cameras (name, sensor_size, lens_mount) VALUES
('Arri Alexa 35', 'Super 35', 'LPL'),
('Arri Alexa Mini LF', 'Large Format', 'LPL'),
('Sony Venice 2', 'Full Frame', 'E-mount/PL'),
('Red V-Raptor', 'VV', 'RF/PL'),
('Panavision Millennium DXL2', 'Large Format', 'PV 70');

INSERT INTO lenses (name, focal_length, aperture) VALUES
('Cooke S4/i 18mm', 18, 'T2.0'),
('Cooke S4/i 25mm', 25, 'T2.0'),
('Cooke S4/i 35mm', 35, 'T2.0'),
('Cooke S4/i 50mm', 50, 'T2.0'),
('Cooke S4/i 75mm', 75, 'T2.0'),
('Arri Master Prime 16mm', 16, 'T1.3'),
('Arri Master Prime 35mm', 35, 'T1.3'),
('Arri Master Prime 50mm', 50, 'T1.3'),
('Zeiss Supreme Prime 29mm', 29, 'T1.5'),
('Angenieux Optimo 24-290mm', 290, 'T2.8');

-- UPDATE RLS to allow reading global gear (where project_id is NULL)
DROP POLICY IF EXISTS "Users can manage cameras of own projects" ON cameras;
CREATE POLICY "Users can manage cameras of own projects" ON cameras FOR ALL 
  USING (project_id IS NULL OR EXISTS (SELECT 1 FROM projects WHERE projects.id = cameras.project_id AND projects.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage lenses of own projects" ON lenses;
CREATE POLICY "Users can manage lenses of own projects" ON lenses FOR ALL 
  USING (project_id IS NULL OR EXISTS (SELECT 1 FROM projects WHERE projects.id = lenses.project_id AND projects.user_id = auth.uid()));


-- ============================================================
-- src/infrastructure/supabase/migrations/0003_add_project_status.sql
-- ============================================================

ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active' NOT NULL;


-- ============================================================
-- src/infrastructure/supabase/migrations/0004_pro_features.sql
-- ============================================================

-- SHOT PRESETS (Templates)
CREATE TABLE shot_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Store the camera, lens, style, etc as JSON
  data JSONB NOT NULL DEFAULT '{}'::jsonb, 
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- SHOT REFERENCES (Multi-image inputs)
CREATE TABLE shot_references (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'image', -- image, video_mask, etc
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- UPDATE SHOT OPTIONS
-- Add 'parameters' for provider specific args (start_frame, end_frame, motion_score etc)
ALTER TABLE shot_options ADD COLUMN parameters JSONB DEFAULT '{}'::jsonb;

-- RLS POLICIES

-- Presets
ALTER TABLE shot_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own presets" ON shot_presets FOR ALL USING (auth.uid() = user_id);

-- References
ALTER TABLE shot_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage shot references" ON shot_references FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM shots 
    JOIN scenes ON shots.scene_id = scenes.id
    JOIN projects ON scenes.project_id = projects.id
    WHERE shots.id = shot_references.shot_id AND projects.user_id = auth.uid()
  ));

-- INDEXES
CREATE INDEX idx_shot_presets_user_id ON shot_presets(user_id);
CREATE INDEX idx_shot_references_shot_id ON shot_references(shot_id);


-- ============================================================
-- src/infrastructure/supabase/migrations/0005_user_preferences.sql
-- ============================================================

-- User preferences for generation behavior
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_provider_slug TEXT CHECK (preferred_provider_slug IN ('openai', 'runway')),
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences" ON user_preferences
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_preferred_provider_slug
ON user_preferences(preferred_provider_slug);


-- ============================================================
-- src/infrastructure/supabase/migrations/0005_video_sequences.sql
-- ============================================================

-- VIDEO SEQUENCES (multi-shot stitched video)
CREATE TABLE video_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft/generating/completed/error
  output_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE sequence_shots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID REFERENCES video_sequences(id) ON DELETE CASCADE NOT NULL,
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE NOT NULL,
  order_index INTEGER NOT NULL,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE video_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage sequences via project" ON video_sequences FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = video_sequences.project_id
      AND projects.user_id = auth.uid()
  ));

ALTER TABLE sequence_shots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage sequence shots via sequence" ON sequence_shots FOR ALL
  USING (EXISTS (
    SELECT 1 FROM video_sequences
    JOIN projects ON video_sequences.project_id = projects.id
    WHERE video_sequences.id = sequence_shots.sequence_id
      AND projects.user_id = auth.uid()
  ));

CREATE INDEX idx_video_sequences_scene_id ON video_sequences(scene_id);
CREATE INDEX idx_sequence_shots_sequence_id ON sequence_shots(sequence_id);
CREATE INDEX idx_sequence_shots_shot_id ON sequence_shots(shot_id);


-- ============================================================
-- src/infrastructure/supabase/migrations/0006_shot_generation_settings.sql
-- ============================================================

alter table if exists shots
    add column if not exists generation_settings jsonb;


-- ============================================================
-- src/infrastructure/supabase/migrations/0007_shot_options_preset_rebuild.sql
-- ============================================================

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


-- ============================================================
-- src/infrastructure/supabase/migrations/0008_shots_prompt_payload.sql
-- ============================================================

alter table if exists shots
  add column if not exists prompt_text text,
  add column if not exists selection_payload jsonb;


-- ============================================================
-- src/infrastructure/supabase/migrations/0009_client_presets.sql
-- ============================================================

-- Client preset import (auto-generated from spreed sheet.xlsx)
delete from public.shot_options;
insert into public.shot_options (category, key, label, descriptor, sort_order, active) values
  ('shot', 'extreme_wide', 'Extreme Wide Shot', 'extreme wide establishing shot, vast sweeping landscape, subject is a tiny figure lost in the environment, epic sense of scale, world dwarfs the character, cinematic establishing frame', 10, true),
  ('shot', 'wide', 'Wide Shot', 'wide shot, full body visible head to toe, environment surrounds subject, clear sense of location and context, subject grounded in the scene', 20, true),
  ('shot', 'medium', 'Medium Shot', 'medium shot framing, waist to head, subject fills centre of frame, balanced composition, face and upper body clearly readable, conversational distance', 30, true),
  ('shot', 'medium_close', 'Medium Close-Up', 'medium close-up, shoulders to top of head, face dominant in frame, emotional expression clearly visible, intimate but not intrusive framing', 40, true),
  ('shot', 'close', 'Close-Up', 'tight close-up shot, face filling the entire frame, eyes sharp and expressive, skin texture visible, background reduced to soft abstract colour, intense emotional focus', 50, true),
  ('shot', 'extreme_close', 'Extreme Close-Up', 'extreme macro close-up, single detail filling the frame, eye or lips or hands isolated, hyper-intimate framing, fine texture and detail visible, abstract and intense', 60, true),
  ('angle', 'eye_level', 'Eye Level', 'eye-level camera angle, lens at subject height, neutral and equal perspective, natural human viewpoint, neither dominant nor submissive, direct and honest framing', 10, true),
  ('angle', 'low_angle', 'Low Angle', 'dramatic low angle shot, camera positioned below subject looking upward, subject appears powerful and imposing, sky or ceiling visible behind them, heroic or threatening presence, subject looms large over viewer', 20, true),
  ('angle', 'high_angle', 'High Angle', 'high angle shot, camera elevated looking downward at subject, subject appears small and vulnerable within their environment, overhead perspective emphasises isolation, world pressing down on character', 30, true),
  ('angle', 'overhead', 'Overhead / Bird''s Eye', 'direct overhead bird''s eye view, camera pointing straight down, flat graphic composition, subjects and objects arranged like a map, architectural and geometric patterns visible, God''s perspective', 40, true),
  ('angle', 'dutch', 'Dutch Angle', 'dutch tilt, camera rotated on its axis, horizon line diagonal across frame, strong sense of unease and psychological tension, world feels unstable and wrong, disorienting and unsettling', 50, true),
  ('angle', 'worm', 'Worm''s Eye', 'extreme worm''s eye view, camera at ground level pointing upward, dramatic foreshortening, towering perspective, subjects rise up into the sky, monumental and exaggerated scale', 60, true),
  ('camera', 'arri35', 'Arri Alexa 35', 'exceptional dynamic range with detail retained in both highlights and deep shadows, organic natural colour rendition, subtle film-like grain structure, smooth tonal gradation, rich midtones, cinematic image quality, gentle highlight rolloff that never clips harshly', 10, true),
  ('camera', 'arri_mini', 'Arri Alexa Mini LF', 'large format sensor look, expansive shallow depth of field, gentle natural vignetting toward edges, exceptionally smooth and creamy out-of-focus areas, natural skin tone rendering, wide colour gamut, intimate and human image quality', 20, true),
  ('camera', 'venice2', 'Sony Venice 2', 'rich saturated colour with precise highlight control, deep shadow detail, wide colour gamut, cinematic rendering with natural contrast, excellent skin tones, anamorphic-quality image character, vivid yet controlled palette', 30, true),
  ('camera', 'redv', 'Red V-Raptor', 'razor sharp ultra-high resolution detail, fine micro-texture on every surface, clinical precision and hyper-real clarity, high contrast image with crisp edges, intense sharpness from foreground to background, every detail rendered with precision', 40, true),
  ('camera', 'panavision', 'Panavision Millennium DXL2', 'classic Hollywood cinematic rendering, deep lush blacks, rich saturated midtones, vintage large-format character, painterly tonal quality, prestigious cinematic image, strong contrast with retained shadow detail, old-world film production aesthetic', 50, true),
  ('camera', 'bmpcc6k', 'Blackmagic BMPCC 6K', 'raw unprocessed cinematic image, wide exposure latitude, independent film visual quality, natural colour science, slightly cooler rendering, honest documentary-style image, grounded and authentic look', 60, true),
  ('lens', 'cooke18', 'Cooke S4/i 18mm', 'ultra-wide 18mm perspective with characteristic Cooke warmth, slight barrel distortion stretching edges of frame, expanded sense of space and depth, close subjects appear large against vast backgrounds, warm organic optical rendering', 10, true),
  ('lens', 'cooke32', 'Cooke S4/i 32mm', 'semi-wide 32mm natural viewing angle, gentle Cooke warm colour rendering, smooth creamy out-of-focus bokeh, flattering perspective with subtle depth compression, organic and human optical character', 20, true),
  ('lens', 'cooke50', 'Cooke S4/i 50mm', 'natural 50mm perspective closest to human eye, Cooke signature warmth and smooth bokeh, gentle background separation, flattering subject rendering, perfectly balanced depth compression, warm rounded optical character', 30, true),
  ('lens', 'cooke75', 'Cooke S4/i 75mm', '75mm portrait compression bringing subject forward, luxurious oval Cooke bokeh with smooth swirling out-of-focus areas, pleasing background separation, flattering facial rendering, warm intimate optical quality', 40, true),
  ('lens', 'sigma14', 'Sigma Cine 14mm', 'extreme 14mm ultra-wide field of view, exaggerated perspective with dramatic depth, edge-to-edge sharpness, minimal distortion for the focal length, expansive environments with towering subjects, contemporary sharp rendering', 50, true),
  ('lens', 'zeiss35', 'Zeiss Supreme 35mm', '35mm classic cinematic perspective, Zeiss clinical precision and micro-contrast, razor-sharp centre resolution, neutral colour rendering without warmth bias, clean modern optical character, fine detail across the entire frame', 60, true),
  ('lens', 'zeiss85', 'Zeiss Supreme 85mm', '85mm telephoto portrait compression, Zeiss smooth creamy bokeh, strong subject isolation from background, flattering compression of facial features, crisp subject against silky smooth out-of-focus background, modern optical precision', 70, true),
  ('lens', 'canon50', 'Canon K35 50mm', 'vintage Canon K35 50mm optical rendering, characterful warm halation glow around highlights, gentle soft focus bloom, classic vintage lens flare when light hits the glass, period film production aesthetic, warm and romantic optical character', 80, true),
  ('movement', 'static', 'Static', 'perfectly locked-off static camera on a heavy tripod, absolute stillness, no camera movement whatsoever, composed and deliberate framing, classical painterly composition', 10, true),
  ('movement', 'handheld', 'Handheld', 'intimate handheld camera, subtle natural organic movement, slight breathing of the frame, documentary proximity to subject, raw human energy in the image, close personal observation', 20, true),
  ('movement', 'dolly_in', 'Dolly In', 'slow deliberate dolly push toward subject, increasing intimacy and tension, world behind gradually compressing, subject growing larger in frame, sense of focus and inevitability', 30, true),
  ('movement', 'dolly_out', 'Dolly Out', 'slow dolly pull back from subject, gradual reveal of wider environment, subject becoming smaller as world expands around them, sense of isolation or release, grand reveal of surroundings', 40, true),
  ('movement', 'pan_right', 'Pan Right', 'smooth fluid pan to the right, sweeping reveal of scene, horizontal discovery of space, elegant camera movement following action or revealing environment', 50, true),
  ('movement', 'pan_left', 'Pan Left', 'smooth fluid pan to the left, sweeping reveal of scene, horizontal discovery of space, elegant camera movement following action or revealing environment', 60, true),
  ('movement', 'tilt_up', 'Tilt Up', 'slow deliberate tilt upward, revealing towering height and vertical scale, world growing upward into frame, sense of awe and grandeur, ascending reveal', 70, true),
  ('movement', 'tilt_down', 'Tilt Down', 'slow deliberate tilt downward, descending reveal from high to low, grounding movement toward earth, sense of weight and gravity pulling the eye down', 80, true),
  ('movement', 'crane', 'Crane / Jib', 'sweeping crane shot arcing through space, elevated aerial-like movement, camera rising or falling while moving, grand cinematic gesture, sense of scale and production value', 90, true),
  ('movement', 'tracking', 'Tracking Shot', 'fluid tracking shot moving parallel with subject, camera gliding alongside the action, subject pinned in frame while world slides past behind them, kinetic energy and momentum', 100, true),
  ('lighting', 'natural', 'Natural Lighting', 'pure natural daylight, soft diffused ambient illumination, gentle realistic shadows, no artificial light sources, honest and grounded atmosphere, light behaves exactly as it would in the real world', 10, true),
  ('lighting', 'golden', 'Golden Hour', 'golden hour magic light, warm amber and orange sunlight raking at low angle, long dramatic shadows stretching across surfaces, every edge glowing warm, luminous backlit rim lighting on subjects, the most flattering light in existence', 20, true),
  ('lighting', 'blue_hour', 'Blue Hour', 'blue hour twilight atmosphere, deep cool cobalt and indigo ambient light, last traces of purple on the horizon, city lights beginning to glow warm against cool sky, quiet melancholic mood, day transitioning into night', 30, true),
  ('lighting', 'studio', 'Studio Lighting', 'precision controlled studio lighting setup, large soft box as key light, clean fill eliminating harsh shadows, perfectly shaped catch light in eyes, professional commercial quality, controlled and repeatable light', 40, true),
  ('lighting', 'cinematic', 'Cinematic', 'high-contrast dramatic cinematic lighting, single strong motivated key light from one direction, deep shadow on opposite side, strong chiaroscuro contrast, pools of light in darkness, deliberately crafted Hollywood-style illumination', 50, true),
  ('lighting', 'neon_noir', 'Neon Noir', 'urban neon noir atmosphere, saturated cyan and hot magenta neon signs casting coloured light, deep impenetrable shadows between pools of coloured light, rain-wet reflective streets doubling the neon glow, atmospheric mist and haze, lonely night city feeling', 60, true),
  ('lighting', 'rembrandt', 'Rembrandt', 'classical Rembrandt portrait lighting, single key light positioned high and to the side, characteristic triangle of light on the shadowed cheek, deep rich shadow covering half the face, warm painterly quality, old master portrait aesthetic', 70, true),
  ('lighting', 'high_key', 'High Key', 'high key lighting with bright even illumination throughout, shadows largely eliminated, clean white or light backgrounds, minimal contrast, fresh and optimistic atmosphere, commercial and lifestyle aesthetic', 80, true),
  ('lighting', 'low_key', 'Low Key', 'extreme low key lighting, image dominated by deep rich darkness, subject emerging from shadow, small isolated pools of warm light, strong chiaroscuro, noir and mysterious mood, dramatic tension through darkness', 90, true),
  ('colorGrade', 'kodak_vision3', 'Kodak Vision3 500T', 'Kodak Vision3 film stock colour science, warm amber and orange tones in the shadows, rich saturated golden midtones, creamy highlight rendering, distinctive celluloid grain structure, warm skin tones, classic Hollywood film look, analogue warmth throughout', 10, true),
  ('colorGrade', 'fuji_eterna', 'Fuji Eterna 160', 'Fuji Eterna film stock rendering, cool and neutral colour palette, fine subtle grain, exceptionally clean highlight detail without blowing out, slightly desaturated and restrained colour, precise and elegant Japanese film aesthetic', 20, true),
  ('colorGrade', 'bleach_bypass', 'Bleach Bypass', 'bleach bypass chemical process look, dramatically reduced colour saturation, strongly lifted crushed blacks with silver retention, very high contrast, colours appearing almost monochrome with faint residual hue, harsh and gritty industrial aesthetic', 30, true),
  ('colorGrade', 'teal_orange', 'Teal & Orange', 'teal and orange complementary colour grade, warm amber orange skin tones pushed into the highlights, deep teal and cyan shadows and backgrounds, maximum colour contrast between warm subjects and cool environments, modern blockbuster cinematic look', 40, true),
  ('colorGrade', 'desaturated_matte', 'Desaturated Matte', 'matte film grade, blacks lifted and softened removing deep contrast, colour saturation pulled down to near-grey, faded washed-out palette, flat low-contrast look, melancholic and introspective mood, contemporary arthouse film aesthetic', 50, true),
  ('colorGrade', 'vintage_16mm', 'Vintage 16mm', 'authentic vintage 16mm film look, heavy pronounced grain structure, soft slightly unsharp rendering, colour shift toward warm yellows and greens, faded contrast, real analogue film imperfections, 1970s documentary and new wave cinema aesthetic', 60, true),
  ('depthOfField', 'shallow', 'Shallow (Bokeh-heavy)', 'extremely shallow depth of field, wide open aperture, subject razor sharp while background dissolves into smooth creamy bokeh, foreground elements soft and dreamy, subject completely isolated from environment, luxurious soft-focus background', 10, true),
  ('depthOfField', 'moderate', 'Moderate', 'moderate depth of field, subject in sharp focus with background gradually softening, natural balance between subject clarity and environmental context, background recognisable but not distracting', 20, true),
  ('depthOfField', 'deep_focus', 'Deep Focus', 'deep focus with everything sharp from close foreground to distant background, every plane of the image in crisp focus simultaneously, all environmental detail visible and readable, Citizen Kane style full-frame sharpness', 30, true),
  ('depthOfField', 'rack_focus', 'Rack Focus Effect', 'rack focus technique, one plane of the image sharply in focus while another is soft, selective focus drawing the eye to a specific element, deliberate optical storytelling through focus choice', 40, true),
  ('depthOfField', 'tilt_shift', 'Tilt-Shift', 'tilt-shift lens effect, thin horizontal band of sharp focus across the middle of the frame, foreground and background both soft, creates miniature diorama aesthetic making real scenes look like tiny scale models', 50, true),
  ('aspectRatio', 'anamorphic', '2.39:1 Anamorphic', 'ultra-wide 2.39:1 anamorphic cinemascope framing, dramatic horizontal black letterbox bars top and bottom, characteristic anamorphic lens oval bokeh, horizontal lens flares streaking across light sources, expansive widescreen cinematic composition', 10, true),
  ('aspectRatio', 'flat', '1.85:1 Flat', '1.85:1 widescreen flat cinematic framing, classic Hollywood feature film proportions, wide enough for cinematic scope without extreme letterboxing, balanced and versatile composition', 20, true),
  ('aspectRatio', 'academy', '4:3 Academy', '4:3 near-square academy ratio framing, vintage film era proportions, taller more portrait-like composition, classic old Hollywood and early cinema aesthetic, intimate square-ish framing', 30, true),
  ('aspectRatio', 'digital', '16:9 Digital', '16:9 standard widescreen digital framing, contemporary broadcast and streaming proportions, clean modern composition, universally familiar screen ratio', 40, true),
  ('aspectRatio', 'imax', '1.43:1 IMAX', 'tall expansive IMAX 1.43:1 framing, significantly more vertical space than standard widescreen, sky and height dramatically captured, immersive large-format composition, maximum visual information in both dimensions', 50, true),
  ('timeOfDay', 'magic_hour', 'Magic Hour', 'magic golden hour light in the final minutes before sunset, impossibly warm amber and pink tones, long raking shadows at extreme low angle, subjects backlit with glowing warm rim light, luminous sky transitioning from gold to pink, the most beautiful light of the day', 10, true),
  ('timeOfDay', 'midday', 'Midday Harsh Sun', 'brutal overhead midday sun, harsh direct light from directly above, strong hard-edged dark shadows directly below subjects, intense specular highlights on every surface, high contrast and unforgiving, bleached and hot atmosphere', 20, true),
  ('timeOfDay', 'overcast', 'Overcast / Flat', 'overcast cloud-diffused daylight, perfectly even soft illumination from the entire sky, no harsh shadows anywhere, gentle wrap-around light, colours appear saturated without being blown out, neutral and honest light quality', 30, true),
  ('timeOfDay', 'night_ext', 'Night Exterior', 'deep night exterior, almost total darkness with pools of artificial warm light, street lamps and windows creating isolated islands of illumination, strong contrast between lit and dark areas, city ambient glow on the horizon, atmospheric and lonely', 40, true),
  ('timeOfDay', 'interior_dusk', 'Interior Dusk', 'interior space at dusk, warm yellow practical lamps and candles glowing inside, cool deep blue twilight visible through windows, beautiful contrast between warm interior light and cold exterior, intimate transitional moment of day becoming night', 50, true),
  ('timeOfDay', 'dawn', 'Dawn / First Light', 'pre-dawn and first light, cool blue and grey atmosphere before sunrise, faint pale glow beginning on the horizon, world still mostly in darkness, quiet and still atmosphere, first tentative light of morning breaking through', 60, true),
  ('genreMood', 'horror', 'Horror', 'horror film visual language, deeply desaturated near-monochrome colour, extreme high contrast with crushing blacks, single harsh practical light source, heavy film grain throughout, unsettling asymmetric composition, dread and psychological unease, something feels deeply wrong', 10, true),
  ('genreMood', 'scifi', 'Sci-Fi', 'science fiction aesthetic, cool clinical blue and white tones, hard specular lighting on metallic surfaces, sleek technological environment, precise geometric shapes, sterile and advanced atmosphere, humanity in a vast technological world', 20, true),
  ('genreMood', 'period_drama', 'Period Drama', 'period drama visual richness, warm candlelight and firelight illumination, painterly Flemish master quality of light, deep rich textures in fabric and material, warm amber and gold colour palette, historical authenticity in every detail, prestige television aesthetic', 30, true),
  ('genreMood', 'documentary', 'Documentary', 'observational documentary aesthetic, naturalistic available light only, handheld intimate proximity, unpolished authentic imperfection, subjects caught in real moments, reportage photojournalism quality, truth over beauty, real world visual language', 40, true),
  ('genreMood', 'action', 'Action', 'action blockbuster visual energy, highly saturated punchy colour, dynamic asymmetric composition, strong high contrast, every frame packed with visual information and energy, kinetic and aggressive aesthetic, commercial spectacle quality', 50, true),
  ('genreMood', 'romance', 'Romance', 'romantic film aesthetic, soft warm diffused light, gentle lens halation glow around highlights, warm golden and pink colour palette, soft focus dreamlike quality, intimate and tender atmosphere, world seen through the emotion of love', 60, true),
  ('genreMood', 'thriller', 'Thriller', 'psychological thriller visual tension, cool desaturated blue and grey palette, strong geometric shadow patterns, claustrophobic tight composition, every shadow hides something, paranoia and surveillance atmosphere, nothing feels entirely safe', 70, true),
  ('genreMood', 'western', 'Western', 'epic western visual language, vast open landscape dwarfing human figures, harsh desert sunlight bleaching colour, warm dusty amber and earth tones, long heroic shadows at golden hour, monumental sky dominating the frame, lone figure against infinite wilderness', 80, true),
  ('genreMood', 'noir', 'Film Noir', 'classic film noir visual language, black and white or heavily desaturated, venetian blind shadow patterns casting graphic lines across subjects, single hard key light from extreme angle, deep impenetrable shadows, cigarette smoke atmosphere, morally ambiguous world', 90, true),
  ('genreMood', 'fantasy', 'Fantasy / Epic', 'epic fantasy visual grandeur, rich saturated jewel-tone colour palette, dramatic volumetric light rays through mist and atmosphere, vast scale with intricate detail, otherworldly and magical atmosphere, sweeping painterly composition, legend and myth made visible', 100, true);


-- ============================================================
-- src/infrastructure/supabase/migrations/0010_export_queue.sql
-- ============================================================

-- Export queue scaffold for batch media exports
create table if not exists public.export_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  profile text not null,
  target_format text not null,
  status text not null default 'queued', -- queued | processing | completed | failed
  progress integer not null default 0,
  output_url text,
  error_message text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.export_job_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references public.export_jobs(id) on delete cascade not null,
  shot_generation_id uuid references public.shot_generations(id) on delete cascade,
  source_url text,
  output_url text,
  order_index integer not null default 0,
  status text not null default 'queued', -- queued | processing | completed | failed
  error_message text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists idx_export_jobs_user_id on public.export_jobs(user_id);
create index if not exists idx_export_jobs_project_id on public.export_jobs(project_id);
create index if not exists idx_export_job_items_job_id on public.export_job_items(job_id);

alter table public.export_jobs enable row level security;
alter table public.export_job_items enable row level security;

drop policy if exists "Users manage export jobs" on public.export_jobs;
create policy "Users manage export jobs" on public.export_jobs
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage export items via job" on public.export_job_items;
create policy "Users manage export items via job" on public.export_job_items
  for all using (
    exists (
      select 1
      from public.export_jobs
      where export_jobs.id = export_job_items.job_id
        and export_jobs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.export_jobs
      where export_jobs.id = export_job_items.job_id
        and export_jobs.user_id = auth.uid()
    )
  );


-- ============================================================
-- src/infrastructure/supabase/migrations/0011_storage_buckets.sql
-- ============================================================

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


-- ============================================================
-- src/infrastructure/supabase/migrations/0012_profiles.sql
-- ============================================================

-- Production auth profile mapping
-- Creates a public profile row for every auth.users record.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill existing users.
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      updated_at = now();



-- ============================================================
-- src/infrastructure/supabase/migrations/0013_billing_and_entitlements.sql
-- ============================================================

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


-- ============================================================
-- src/infrastructure/supabase/migrations/0014_testing_phase_quota_5.sql
-- ============================================================

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



-- ============================================================
-- src/infrastructure/supabase/migrations/0015_inner_circle_waitlist.sql
-- ============================================================

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


-- ============================================================
-- src/infrastructure/supabase/migrations/0016_studio_ad_packets.sql
-- ============================================================

create table if not exists public.studio_ad_packets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  scene_id uuid null references public.scenes(id) on delete set null,
  shot_id uuid null references public.shots(id) on delete set null,
  user_intent text not null,
  mode text not null,
  provider_target text not null,
  output_type text not null check (output_type in ('image', 'video')),
  project_bible jsonb not null default '{}'::jsonb,
  packet jsonb not null,
  production_readiness integer not null check (production_readiness between 0 and 100),
  continuity_confidence integer not null check (continuity_confidence between 0 and 100),
  technical_clarity integer not null check (technical_clarity between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists idx_studio_ad_packets_user_created
  on public.studio_ad_packets(user_id, created_at desc);

create index if not exists idx_studio_ad_packets_project
  on public.studio_ad_packets(project_id, created_at desc);

create index if not exists idx_studio_ad_packets_scene
  on public.studio_ad_packets(scene_id, created_at desc);

create index if not exists idx_studio_ad_packets_shot
  on public.studio_ad_packets(shot_id, created_at desc);

alter table public.studio_ad_packets enable row level security;

drop policy if exists "Users can read own studio ad packets" on public.studio_ad_packets;
create policy "Users can read own studio ad packets"
  on public.studio_ad_packets
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own studio ad packets" on public.studio_ad_packets;
create policy "Users can insert own studio ad packets"
  on public.studio_ad_packets
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own studio ad packets" on public.studio_ad_packets;
create policy "Users can delete own studio ad packets"
  on public.studio_ad_packets
  for delete
  using (auth.uid() = user_id);



-- ============================================================
-- src/infrastructure/supabase/migrations/0017_fast_video_storyboard.sql
-- ============================================================

CREATE TABLE fast_video_storyboard_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  source_clip_id TEXT,
  url TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 5,
  model_family_id TEXT,
  scene_group TEXT NOT NULL DEFAULT 'Scene A',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT fast_video_storyboard_scene_group_check CHECK (scene_group IN ('Scene A', 'Scene B', 'Scene C')),
  CONSTRAINT fast_video_storyboard_status_check CHECK (status IN ('draft', 'ready'))
);

ALTER TABLE fast_video_storyboard_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage fast video storyboard via project" ON fast_video_storyboard_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = fast_video_storyboard_items.project_id
      AND projects.user_id = auth.uid()
  ));

CREATE INDEX idx_fast_video_storyboard_scene_id ON fast_video_storyboard_items(scene_id);
CREATE INDEX idx_fast_video_storyboard_project_id ON fast_video_storyboard_items(project_id);
CREATE INDEX idx_fast_video_storyboard_scene_order ON fast_video_storyboard_items(scene_id, order_index);


-- ============================================================
-- src/infrastructure/supabase/migrations/0018_studio_ad_campaigns.sql
-- ============================================================

CREATE TABLE studio_ad_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brief TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'ugc',
  asset_count INTEGER NOT NULL DEFAULT 3,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  duration_seconds INTEGER NOT NULL DEFAULT 8,
  engine_model TEXT,
  campaign_summary TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  creative_strategy TEXT NOT NULL DEFAULT '',
  score JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT studio_ad_campaign_status_check CHECK (status IN ('planned', 'processing', 'completed', 'failed'))
);

CREATE TABLE studio_ad_campaign_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES studio_ad_campaigns(id) ON DELETE CASCADE NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  concept_type TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  creator_direction TEXT NOT NULL DEFAULT '',
  master_prompt TEXT NOT NULL,
  negative_prompt TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 8,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  model_family_id TEXT NOT NULL DEFAULT 'kling',
  style_preset_id TEXT,
  motion_preset_id TEXT,
  continuity_anchors JSONB NOT NULL DEFAULT '[]'::jsonb,
  production_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned',
  task_id TEXT,
  trace_id TEXT,
  output_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT studio_ad_campaign_item_status_check CHECK (status IN ('planned', 'queued', 'processing', 'completed', 'failed'))
);

ALTER TABLE studio_ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own studio ad campaigns" ON studio_ad_campaigns FOR ALL
  USING (user_id = auth.uid());

ALTER TABLE studio_ad_campaign_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage campaign items via campaign" ON studio_ad_campaign_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM studio_ad_campaigns
    WHERE studio_ad_campaigns.id = studio_ad_campaign_items.campaign_id
      AND studio_ad_campaigns.user_id = auth.uid()
  ));

CREATE INDEX idx_studio_ad_campaigns_user_id ON studio_ad_campaigns(user_id);
CREATE INDEX idx_studio_ad_campaigns_project_id ON studio_ad_campaigns(project_id);
CREATE INDEX idx_studio_ad_campaign_items_campaign_id ON studio_ad_campaign_items(campaign_id);
CREATE INDEX idx_studio_ad_campaign_items_status ON studio_ad_campaign_items(status);


-- ============================================================
-- src/infrastructure/supabase/migrations/0019_inner_circle_public_join_rpc.sql
-- ============================================================

create or replace function public.generate_inner_circle_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text := '';
  i integer;
begin
  for i in 1..8 loop
    candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::integer, 1);
  end loop;

  return candidate;
end;
$$;

create or replace function public.join_inner_circle_waitlist(
  p_full_name text,
  p_instagram_handle text,
  p_social_handle text,
  p_email text,
  p_referred_by_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
  normalized_name text := trim(p_full_name);
  normalized_instagram text := lower(regexp_replace(trim(coalesce(p_instagram_handle, 'not-provided')), '^@+', ''));
  normalized_social text := lower(regexp_replace(trim(coalesce(p_social_handle, 'not-provided')), '^@+', ''));
  normalized_ref text := nullif(upper(trim(coalesce(p_referred_by_code, ''))), '');
  existing_row public.inner_circle_waitlist%rowtype;
  candidate text;
  inserted_id uuid;
  tries integer := 0;
begin
  if normalized_name is null or length(normalized_name) < 2 then
    raise exception 'Name is required.';
  end if;

  if normalized_email is null or normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'A valid email is required.';
  end if;

  if normalized_instagram is null or length(normalized_instagram) < 2 then
    normalized_instagram := 'not-provided';
  end if;

  if normalized_social is null or length(normalized_social) < 2 then
    normalized_social := 'not-provided';
  end if;

  select *
  into existing_row
  from public.inner_circle_waitlist
  where email = normalized_email
  limit 1;

  if found then
    update public.inner_circle_waitlist
    set
      full_name = normalized_name,
      instagram_handle = normalized_instagram,
      social_handle = normalized_social
    where id = existing_row.id
    returning * into existing_row;

    return jsonb_build_object('ok', true, 'referralCode', existing_row.referral_code);
  end if;

  loop
    tries := tries + 1;
    candidate := public.generate_inner_circle_referral_code();

    begin
      insert into public.inner_circle_waitlist (
        full_name,
        instagram_handle,
        social_handle,
        email,
        referral_code,
        referred_by_code
      )
      values (
        normalized_name,
        normalized_instagram,
        normalized_social,
        normalized_email,
        candidate,
        normalized_ref
      )
      returning id into inserted_id;

      exit;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
    end;
  end loop;

  if normalized_ref is not null then
    update public.inner_circle_waitlist
    set referral_count = referral_count + 1
    where referral_code = normalized_ref;
  end if;

  return jsonb_build_object('ok', true, 'referralCode', candidate);
end;
$$;

grant execute on function public.generate_inner_circle_referral_code() to anon, authenticated, service_role;
grant execute on function public.join_inner_circle_waitlist(text, text, text, text, text) to anon, authenticated, service_role;


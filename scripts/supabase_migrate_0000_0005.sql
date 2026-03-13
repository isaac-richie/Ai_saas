-- AISAS schema bootstrap bundle
-- Generated automatically from migrations 0000..0005
-- Run this in Supabase SQL Editor on the target project


-- ===== BEGIN 0000_init_schema.sql =====
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

-- ===== END 0000_init_schema.sql =====

-- ===== BEGIN 0001_seed_providers.sql =====
-- Seed Providers
INSERT INTO providers (name, slug, base_url, is_active) VALUES
('Midjourney', 'midjourney', 'https://api.midjourney.com', true),
('Runway', 'runway', 'https://api.runwayml.com', true),
('Pika', 'pika', 'https://api.pika.art', true),
('OpenAI', 'openai', 'https://api.openai.com', true)
ON CONFLICT (slug) DO NOTHING;

-- ===== END 0001_seed_providers.sql =====

-- ===== BEGIN 0002_seed_gear.sql =====
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

-- ===== END 0002_seed_gear.sql =====

-- ===== BEGIN 0003_add_project_status.sql =====
ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active' NOT NULL;

-- ===== END 0003_add_project_status.sql =====

-- ===== BEGIN 0004_pro_features.sql =====
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

-- ===== END 0004_pro_features.sql =====

-- ===== BEGIN 0005_user_preferences.sql =====
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

-- ===== END 0005_user_preferences.sql =====

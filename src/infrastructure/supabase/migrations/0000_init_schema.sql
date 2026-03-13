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

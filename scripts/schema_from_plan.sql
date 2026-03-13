-- Database Schema based on the Build Guide (Phase 1)
-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users table (automatically created by Supabase Auth)

-- 2. ShotOptions (from 1_shot_options_seed.csv)
CREATE TABLE IF NOT EXISTS shot_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  subtype TEXT,
  name TEXT NOT NULL,
  description TEXT,
  purpose TEXT,
  prompt_fragment TEXT NOT NULL,
  example_prompt TEXT,
  example_image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Cameras (from 2_cameras_seed.csv)
CREATE TABLE IF NOT EXISTS cameras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL,
  thumbnail_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Lenses (from 3_lenses_seed.csv)
CREATE TABLE IF NOT EXISTS lenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  focal_length TEXT,
  type TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL,
  thumbnail_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Providers (from 5_providers_seed.csv)
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- image/video/avatar/audio
  integration_mode TEXT NOT NULL, -- api/workflow
  max_duration_seconds INTEGER,
  supports_multi_image BOOLEAN DEFAULT false,
  supports_start_end_frame BOOLEAN DEFAULT false,
  best_for TEXT,
  pricing_tier TEXT,
  api_access_via TEXT,
  notes TEXT,
  logo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Elements (user-created reference images)
CREATE TABLE IF NOT EXISTS elements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- clothing/prop/character/environment
  prompt_fragment TEXT,
  reference_image_url TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 8. Scenes
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Shots
CREATE TABLE IF NOT EXISTS shots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shot_description TEXT NOT NULL,

  -- Cinematography choices
  camera_id UUID REFERENCES cameras(id),
  lens_id UUID REFERENCES lenses(id),
  shot_size_id UUID REFERENCES shot_options(id),
  angle_id UUID REFERENCES shot_options(id),
  movement_id UUID REFERENCES shot_options(id),

  -- Generation
  provider_id UUID REFERENCES providers(id),
  final_prompt TEXT,
  output_image_url TEXT,
  output_video_url TEXT,
  status TEXT DEFAULT 'draft', -- draft/generating/completed/error
  error_message TEXT,

  -- Metadata
  index_in_scene INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  generated_at TIMESTAMP
);

-- 10. ShotElements (many-to-many: shots <-> elements)
CREATE TABLE IF NOT EXISTS shot_elements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE,
  element_id UUID REFERENCES elements(id) ON DELETE CASCADE,
  reference_tag TEXT, -- @character, @outfit, etc.
  strength DECIMAL DEFAULT 1.0,
  order_index INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 11. UserApiKeys (encrypted storage)
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,
  key_nickname TEXT,
  is_active BOOLEAN DEFAULT true,
  last_test_status TEXT, -- valid/invalid/untested
  last_tested_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,

  UNIQUE(user_id, provider_id, key_nickname)
);

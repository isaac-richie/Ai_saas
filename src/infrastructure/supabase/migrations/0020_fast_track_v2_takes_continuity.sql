-- Fast Track V2: Takes system, continuity persistence, scene metadata
-- Phase 1 of the V2 build plan

-- ============================================================
-- 1. TAKES TABLE
--    A Take is one generation attempt under a Shot.
--    shot_generations currently serves this role but lacks
--    take_number and approved tracking. We add columns to
--    shot_generations rather than creating a new table to
--    avoid migrating all existing data.
-- ============================================================

ALTER TABLE shot_generations
  ADD COLUMN IF NOT EXISTS take_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS model_version_used TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS aspect_ratio TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS first_frame_url TEXT,
  ADD COLUMN IF NOT EXISTS last_frame_url TEXT,
  ADD COLUMN IF NOT EXISTS compiled_prompt TEXT;

-- ============================================================
-- 2. APPROVED TAKE on shots
--    Each shot points to its best take.
-- ============================================================

ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS approved_take_id UUID REFERENCES shot_generations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_shot_id UUID REFERENCES shots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shot_look TEXT,
  ADD COLUMN IF NOT EXISTS style_preset_id TEXT,
  ADD COLUMN IF NOT EXISTS motion_preset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS duration_target INTEGER,
  ADD COLUMN IF NOT EXISTS aspect_ratio TEXT;

-- ============================================================
-- 3. SCENE METADATA
--    Scenes gain location/lighting/color prompts for
--    continuity inheritance.
-- ============================================================

ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS location_prompt TEXT,
  ADD COLUMN IF NOT EXISTS lighting_prompt TEXT,
  ADD COLUMN IF NOT EXISTS color_prompt TEXT;

-- ============================================================
-- 4. SHOT CONTINUITY TABLE
--    Persists lock state per shot. Source shot is the
--    shot whose last frame is used as reference.
-- ============================================================

CREATE TABLE IF NOT EXISTS shot_continuity (
  shot_id UUID PRIMARY KEY REFERENCES shots(id) ON DELETE CASCADE,
  character_locked BOOLEAN NOT NULL DEFAULT FALSE,
  character_value TEXT,
  character_ref_url TEXT,
  wardrobe_locked BOOLEAN NOT NULL DEFAULT FALSE,
  wardrobe_value TEXT,
  wardrobe_ref_url TEXT,
  location_locked BOOLEAN NOT NULL DEFAULT FALSE,
  location_value TEXT,
  location_ref_url TEXT,
  lighting_locked BOOLEAN NOT NULL DEFAULT FALSE,
  lighting_value TEXT,
  color_grade_locked BOOLEAN NOT NULL DEFAULT FALSE,
  color_grade_value TEXT,
  camera_style_locked BOOLEAN NOT NULL DEFAULT FALSE,
  camera_style_value TEXT,
  source_shot_id UUID REFERENCES shots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shot_continuity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage shot continuity via shot ownership"
  ON shot_continuity FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shots
      JOIN scenes ON scenes.id = shots.scene_id
      JOIN projects ON projects.id = scenes.project_id
      WHERE shots.id = shot_continuity.shot_id
        AND projects.user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. PROJECT DEFAULTS
--    Projects gain default provider/model/fps for V2.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS default_provider TEXT,
  ADD COLUMN IF NOT EXISTS default_model TEXT,
  ADD COLUMN IF NOT EXISTS fps INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS resolution TEXT DEFAULT '1080p';

-- ============================================================
-- 6. USER PRESET PREFERENCES
--    Pinned and recent presets per user (style + motion).
-- ============================================================

CREATE TABLE IF NOT EXISTS user_preset_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  preset_type TEXT NOT NULL CHECK (preset_type IN ('style', 'motion', 'shot_look')),
  preset_id TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, preset_type, preset_id)
);

ALTER TABLE user_preset_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preset preferences"
  ON user_preset_preferences FOR ALL USING (
    user_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_user_preset_prefs_user
  ON user_preset_preferences(user_id, preset_type);

-- ============================================================
-- 7. GENERATION JOBS TABLE
--    Tracks async generation jobs with proper status lifecycle.
-- ============================================================

CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE NOT NULL,
  take_id UUID REFERENCES shot_generations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT,
  provider_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'preparing', 'submitted', 'generating', 'downloading', 'processing', 'completed', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own generation jobs"
  ON generation_jobs FOR ALL USING (
    user_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_status
  ON generation_jobs(user_id, status);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_shot
  ON generation_jobs(shot_id);

-- ============================================================
-- 8. INDEXES for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_shots_approved_take
  ON shots(approved_take_id) WHERE approved_take_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shots_previous_shot
  ON shots(previous_shot_id) WHERE previous_shot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shot_generations_take_number
  ON shot_generations(shot_id, take_number);

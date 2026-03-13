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

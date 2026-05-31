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

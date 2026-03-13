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

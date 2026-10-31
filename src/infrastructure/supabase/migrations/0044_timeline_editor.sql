-- Timeline Editor: Phase 1
-- Multi-track timeline that references existing shots/takes

-- ============================================================
-- 1. TIMELINE PROJECTS
--    One timeline per project. Stores render settings.
-- ============================================================

CREATE TABLE IF NOT EXISTS timeline_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Main Timeline',
  fps INTEGER NOT NULL DEFAULT 24,
  resolution TEXT NOT NULL DEFAULT '1920x1080',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

ALTER TABLE timeline_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage timelines via project" ON timeline_projects FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = timeline_projects.project_id
      AND projects.user_id = auth.uid()
  )
);

-- ============================================================
-- 2. TIMELINE TRACKS
--    Ordered layers: video, audio, caption, sfx.
-- ============================================================

CREATE TABLE IF NOT EXISTS timeline_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Video 1',
  track_type TEXT NOT NULL DEFAULT 'video'
    CHECK (track_type IN ('video', 'audio', 'caption', 'sfx')),
  order_index INTEGER NOT NULL DEFAULT 0,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timeline_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage tracks via timeline" ON timeline_tracks FOR ALL USING (
  EXISTS (
    SELECT 1 FROM timeline_projects tp
    JOIN projects p ON p.id = tp.project_id
    WHERE tp.id = timeline_tracks.timeline_id
      AND p.user_id = auth.uid()
  )
);

CREATE INDEX idx_timeline_tracks_timeline ON timeline_tracks(timeline_id, order_index);

-- ============================================================
-- 3. TIMELINE CLIPS
--    A clip on a track with start/end time.
--    References either a shot_generation (take) or an asset URL.
-- ============================================================

CREATE TABLE IF NOT EXISTS timeline_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID REFERENCES timeline_tracks(id) ON DELETE CASCADE NOT NULL,
  take_id UUID REFERENCES shot_generations(id) ON DELETE SET NULL,
  asset_url TEXT,
  clip_type TEXT NOT NULL DEFAULT 'video'
    CHECK (clip_type IN ('video', 'audio', 'caption', 'image', 'sfx')),
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL DEFAULT 5000,
  trim_start_ms INTEGER NOT NULL DEFAULT 0,
  trim_end_ms INTEGER,
  volume REAL NOT NULL DEFAULT 1.0,
  opacity REAL NOT NULL DEFAULT 1.0,
  transition_in TEXT,
  transition_in_ms INTEGER DEFAULT 0,
  transition_out TEXT,
  transition_out_ms INTEGER DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timeline_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage clips via track" ON timeline_clips FOR ALL USING (
  EXISTS (
    SELECT 1 FROM timeline_tracks tt
    JOIN timeline_projects tp ON tp.id = tt.timeline_id
    JOIN projects p ON p.id = tp.project_id
    WHERE tt.id = timeline_clips.track_id
      AND p.user_id = auth.uid()
  )
);

CREATE INDEX idx_timeline_clips_track ON timeline_clips(track_id, start_ms);
CREATE INDEX idx_timeline_clips_take ON timeline_clips(take_id) WHERE take_id IS NOT NULL;

-- ============================================================
-- 4. EDIT COMMANDS
--    AI agent edit history — every edit the agent makes.
-- ============================================================

CREATE TABLE IF NOT EXISTS edit_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE CASCADE NOT NULL,
  command_type TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'user'
    CHECK (source IN ('user', 'ai_agent', 'system'))
);

ALTER TABLE edit_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage edit commands via timeline" ON edit_commands FOR ALL USING (
  EXISTS (
    SELECT 1 FROM timeline_projects tp
    JOIN projects p ON p.id = tp.project_id
    WHERE tp.id = edit_commands.timeline_id
      AND p.user_id = auth.uid()
  )
);

CREATE INDEX idx_edit_commands_timeline ON edit_commands(timeline_id, applied_at DESC);

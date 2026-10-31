-- VisioWave video editor: everything the editor needs, in one script.
-- Combines migrations 0044–0049. Safe to run more than once: it only adds what is missing.
-- Paste into Supabase → SQL Editor → Run.

-- ============================================================
-- 1. Timelines: one per project, with its look and frame shape
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

ALTER TABLE timeline_projects ADD COLUMN IF NOT EXISTS color_grade_id TEXT NOT NULL DEFAULT 'natural';
ALTER TABLE timeline_projects ADD COLUMN IF NOT EXISTS frame_fit TEXT NOT NULL DEFAULT 'blur';
ALTER TABLE timeline_projects DROP CONSTRAINT IF EXISTS timeline_projects_frame_fit_check;
ALTER TABLE timeline_projects
  ADD CONSTRAINT timeline_projects_frame_fit_check CHECK (frame_fit IN ('blur', 'fill', 'fit'));

ALTER TABLE timeline_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage timelines via project" ON timeline_projects;
CREATE POLICY "Users manage timelines via project" ON timeline_projects FOR ALL
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = timeline_projects.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = timeline_projects.project_id AND projects.user_id = auth.uid()));

-- ============================================================
-- 2. Tracks: the rows of the timeline (shots, music, text)
-- ============================================================
CREATE TABLE IF NOT EXISTS timeline_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Video 1',
  track_type TEXT NOT NULL DEFAULT 'video' CHECK (track_type IN ('video', 'audio', 'caption', 'sfx')),
  order_index INTEGER NOT NULL DEFAULT 0,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timeline_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage tracks via timeline" ON timeline_tracks;
CREATE POLICY "Users manage tracks via timeline" ON timeline_tracks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM timeline_projects tp JOIN projects p ON p.id = tp.project_id
    WHERE tp.id = timeline_tracks.timeline_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM timeline_projects tp JOIN projects p ON p.id = tp.project_id
    WHERE tp.id = timeline_tracks.timeline_id AND p.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_timeline_tracks_timeline ON timeline_tracks(timeline_id, order_index);

-- ============================================================
-- 3. Clips: shots, songs and text placed on a track
-- ============================================================
CREATE TABLE IF NOT EXISTS timeline_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID REFERENCES timeline_tracks(id) ON DELETE CASCADE NOT NULL,
  take_id UUID REFERENCES shot_generations(id) ON DELETE SET NULL,
  asset_url TEXT,
  clip_type TEXT NOT NULL DEFAULT 'video' CHECK (clip_type IN ('video', 'audio', 'caption', 'image', 'sfx')),
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

ALTER TABLE timeline_clips ADD COLUMN IF NOT EXISTS color_grade_id TEXT;

ALTER TABLE timeline_clips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage clips via track" ON timeline_clips;
CREATE POLICY "Users manage clips via track" ON timeline_clips FOR ALL
  USING (EXISTS (
    SELECT 1 FROM timeline_tracks tt
    JOIN timeline_projects tp ON tp.id = tt.timeline_id
    JOIN projects p ON p.id = tp.project_id
    WHERE tt.id = timeline_clips.track_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM timeline_tracks tt
    JOIN timeline_projects tp ON tp.id = tt.timeline_id
    JOIN projects p ON p.id = tp.project_id
    WHERE tt.id = timeline_clips.track_id AND p.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_timeline_clips_track ON timeline_clips(track_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_timeline_clips_take ON timeline_clips(take_id) WHERE take_id IS NOT NULL;

-- ============================================================
-- 4. AI editor history: every edit the AI makes
-- ============================================================
CREATE TABLE IF NOT EXISTS edit_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE CASCADE NOT NULL,
  command_type TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai_agent', 'system'))
);

ALTER TABLE edit_commands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage edit commands via timeline" ON edit_commands;
CREATE POLICY "Users manage edit commands via timeline" ON edit_commands FOR ALL
  USING (EXISTS (
    SELECT 1 FROM timeline_projects tp JOIN projects p ON p.id = tp.project_id
    WHERE tp.id = edit_commands.timeline_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM timeline_projects tp JOIN projects p ON p.id = tp.project_id
    WHERE tp.id = edit_commands.timeline_id AND p.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_edit_commands_timeline ON edit_commands(timeline_id, applied_at DESC);

-- ============================================================
-- 5. Render jobs: "Make video" progress that survives a closed tab
-- ============================================================
CREATE TABLE IF NOT EXISTS timeline_render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'rendering', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage TEXT NOT NULL DEFAULT '',
  output_url TEXT,
  storage_key TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timeline_render_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own timeline renders" ON timeline_render_jobs;
CREATE POLICY "Users manage own timeline renders" ON timeline_render_jobs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM timeline_projects tp JOIN projects p ON p.id = tp.project_id
      WHERE tp.id = timeline_render_jobs.timeline_id AND p.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_timeline_render_jobs_timeline ON timeline_render_jobs(timeline_id, created_at DESC);
-- At most one active render per timeline.
CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_render_jobs_one_active
  ON timeline_render_jobs(timeline_id) WHERE status IN ('queued', 'rendering');

-- ============================================================
-- 6. Share and review links (migration 0048)
-- ============================================================

CREATE TABLE IF NOT EXISTS video_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE SET NULL,
  -- 32 random bytes, base64url. The link is the only key a guest holds.
  token TEXT NOT NULL UNIQUE CHECK (length(token) >= 40),
  title TEXT NOT NULL DEFAULT 'Video for review' CHECK (length(title) <= 120),
  video_url TEXT NOT NULL CHECK (video_url LIKE 'https://%'),
  storage_key TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  status TEXT NOT NULL DEFAULT 'in_review' CHECK (status IN ('in_review', 'approved', 'changes_requested')),
  allow_comments BOOLEAN NOT NULL DEFAULT TRUE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE video_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage their shares" ON video_shares;
CREATE POLICY "Owners manage their shares" ON video_shares FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM projects p WHERE p.id = video_shares.project_id AND p.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_video_shares_project ON video_shares(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_share_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID REFERENCES video_shares(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL CHECK (length(author_name) BETWEEN 1 AND 60),
  -- Set when the person leaving the note is the signed-in owner.
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'approved', 'changes_requested')),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 1000),
  at_ms INTEGER CHECK (at_ms IS NULL OR at_ms >= 0),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE video_share_notes ENABLE ROW LEVEL SECURITY;
-- Owners read and resolve notes on their own shares. Guests never touch this table directly:
-- they go through the server, which checks the link first.
DROP POLICY IF EXISTS "Owners read notes on their shares" ON video_share_notes;
CREATE POLICY "Owners read notes on their shares" ON video_share_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM video_shares s WHERE s.id = video_share_notes.share_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM video_shares s WHERE s.id = video_share_notes.share_id AND s.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_video_share_notes_share ON video_share_notes(share_id, created_at);

-- ============================================================
-- 7. Saved versions of a cut (migration 0049)
-- ============================================================
CREATE TABLE IF NOT EXISTS timeline_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL DEFAULT 'Before an AI edit' CHECK (length(label) <= 200),
  -- The shots row and the look: { grade, clips: [...] }.
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timeline_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage their revisions" ON timeline_revisions;
CREATE POLICY "Owners manage their revisions" ON timeline_revisions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM timeline_projects tp JOIN projects p ON p.id = tp.project_id
      WHERE tp.id = timeline_revisions.timeline_id AND p.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_timeline_revisions_timeline ON timeline_revisions(timeline_id, created_at DESC);

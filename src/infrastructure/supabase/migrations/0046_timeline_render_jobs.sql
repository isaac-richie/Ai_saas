-- Timeline renders run as tracked jobs so the editor can show progress and survive a closed tab.
CREATE TABLE IF NOT EXISTS timeline_render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'rendering', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage TEXT NOT NULL DEFAULT '',
  output_url TEXT,
  storage_key TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timeline_render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own timeline renders" ON timeline_render_jobs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM timeline_projects tp
      JOIN projects p ON p.id = tp.project_id
      WHERE tp.id = timeline_render_jobs.timeline_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_timeline_render_jobs_timeline
  ON timeline_render_jobs(timeline_id, created_at DESC);

-- At most one active render per timeline.
CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_render_jobs_one_active
  ON timeline_render_jobs(timeline_id) WHERE status IN ('queued', 'rendering');

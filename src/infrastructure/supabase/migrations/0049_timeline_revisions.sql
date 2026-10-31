-- Saved versions of a cut: one is stored before every AI edit so it can be restored later,
-- even after the page is closed.
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

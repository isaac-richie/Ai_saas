-- Transcripts for the editor (Professional Editor spec 4). One per source video in a timeline,
-- timed in that video's own footage, so cuts, splits and undo on the timeline never change them.
CREATE TABLE IF NOT EXISTS timeline_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID REFERENCES timeline_projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- The source the words belong to: the take id, or the video's address for uploads.
  source_key TEXT NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 2048),
  language TEXT,
  engine TEXT NOT NULL DEFAULT '',
  -- [{ id, text, start_ms, end_ms, low?, fixed?, heard? }] in footage time.
  words JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(words) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (timeline_id, source_key)
);

ALTER TABLE timeline_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own timeline transcripts" ON timeline_transcripts;
CREATE POLICY "Users manage own timeline transcripts" ON timeline_transcripts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM timeline_projects tp
      JOIN projects p ON p.id = tp.project_id
      WHERE tp.id = timeline_transcripts.timeline_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_timeline_transcripts_timeline ON timeline_transcripts(timeline_id);

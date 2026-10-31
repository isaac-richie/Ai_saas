-- Share and review links: a finished video shared by an unguessable link, where anyone with
-- the link (no account needed) can leave notes pinned to a moment and approve or ask for changes.

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

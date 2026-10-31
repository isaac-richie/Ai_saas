-- Timeline color grading support
ALTER TABLE timeline_projects
  ADD COLUMN IF NOT EXISTS color_grade_id TEXT NOT NULL DEFAULT 'natural';

ALTER TABLE timeline_clips
  ADD COLUMN IF NOT EXISTS color_grade_id TEXT;

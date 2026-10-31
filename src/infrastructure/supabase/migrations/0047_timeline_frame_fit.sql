-- How footage of another shape fills the video frame:
--   blur = whole picture over a blurred copy, fill = crop to fill, fit = black bars.
ALTER TABLE timeline_projects
  ADD COLUMN IF NOT EXISTS frame_fit TEXT NOT NULL DEFAULT 'blur';

ALTER TABLE timeline_projects DROP CONSTRAINT IF EXISTS timeline_projects_frame_fit_check;
ALTER TABLE timeline_projects
  ADD CONSTRAINT timeline_projects_frame_fit_check CHECK (frame_fit IN ('blur', 'fill', 'fit'));

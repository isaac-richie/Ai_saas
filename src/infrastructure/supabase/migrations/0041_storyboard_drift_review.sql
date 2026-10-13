-- Storyboard: the creator's consistency check on a shot's latest take. Additive only.

alter table public.fast_video_storyboard_items
  add column if not exists drift_review text;

alter table public.fast_video_storyboard_items
  drop constraint if exists storyboard_drift_review_check;
alter table public.fast_video_storyboard_items
  add constraint storyboard_drift_review_check check (drift_review is null or drift_review in ('ok', 'flagged'));

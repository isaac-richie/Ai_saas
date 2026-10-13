-- Storyboard continuity: per-shot direction, review state, start / end frames
-- and the shot each card continues from. Additive only; older rows stay valid.

alter table public.fast_video_storyboard_items
  add column if not exists direction text not null default '',
  add column if not exists review_status text,
  add column if not exists start_frame jsonb,
  add column if not exists end_frame jsonb,
  add column if not exists previous_item_id uuid;

alter table public.fast_video_storyboard_items
  drop constraint if exists storyboard_review_status_check;
alter table public.fast_video_storyboard_items
  add constraint storyboard_review_status_check check (
    review_status is null or review_status in ('draft', 'generating', 'review', 'approved', 'failed')
  );

alter table public.fast_video_storyboard_items
  drop constraint if exists storyboard_direction_length;
alter table public.fast_video_storyboard_items
  add constraint storyboard_direction_length check (char_length(direction) <= 1200);

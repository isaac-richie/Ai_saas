-- Long briefs: creators can paste scripts or JSON scene breakdowns (up to 20,000 characters).
-- The app condenses them to each video model's real prompt limit before generating.
alter table public.fast_video_storyboard_items drop constraint if exists storyboard_direction_length;
alter table public.fast_video_storyboard_items
  add constraint storyboard_direction_length check (char_length(direction) <= 20000);

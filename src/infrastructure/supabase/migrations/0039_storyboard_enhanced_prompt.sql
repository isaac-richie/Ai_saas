-- Storyboard auto-enhance: the full prompt built from a short direction,
-- the direction it was built from, and the per-shot switch. Additive only.

alter table public.fast_video_storyboard_items
  add column if not exists enhanced_prompt text,
  add column if not exists enhanced_from text,
  add column if not exists auto_enhance boolean not null default true;

alter table public.fast_video_storyboard_items
  drop constraint if exists storyboard_enhanced_prompt_length;
alter table public.fast_video_storyboard_items
  add constraint storyboard_enhanced_prompt_length check (
    (enhanced_prompt is null or char_length(enhanced_prompt) <= 1200)
    and (enhanced_from is null or char_length(enhanced_from) <= 1200)
  );

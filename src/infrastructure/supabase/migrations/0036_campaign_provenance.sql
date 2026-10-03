-- Campaign provenance on storyboard items, and provider / capability
-- snapshots on campaign assets. Additive only.

alter table public.fast_video_storyboard_items
  add column if not exists campaign_provenance jsonb;

alter table public.studio_ad_campaign_items
  add column if not exists provider text,
  add column if not exists capability_snapshot jsonb;

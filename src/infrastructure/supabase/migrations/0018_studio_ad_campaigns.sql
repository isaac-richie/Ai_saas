CREATE TABLE studio_ad_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brief TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'ugc',
  asset_count INTEGER NOT NULL DEFAULT 3,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  duration_seconds INTEGER NOT NULL DEFAULT 8,
  engine_model TEXT,
  campaign_summary TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  creative_strategy TEXT NOT NULL DEFAULT '',
  score JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT studio_ad_campaign_status_check CHECK (status IN ('planned', 'processing', 'completed', 'failed'))
);

CREATE TABLE studio_ad_campaign_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES studio_ad_campaigns(id) ON DELETE CASCADE NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  concept_type TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  creator_direction TEXT NOT NULL DEFAULT '',
  master_prompt TEXT NOT NULL,
  negative_prompt TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 8,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  model_family_id TEXT NOT NULL DEFAULT 'kling',
  style_preset_id TEXT,
  motion_preset_id TEXT,
  continuity_anchors JSONB NOT NULL DEFAULT '[]'::jsonb,
  production_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned',
  task_id TEXT,
  trace_id TEXT,
  output_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT studio_ad_campaign_item_status_check CHECK (status IN ('planned', 'queued', 'processing', 'completed', 'failed'))
);

ALTER TABLE studio_ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own studio ad campaigns" ON studio_ad_campaigns FOR ALL
  USING (user_id = auth.uid());

ALTER TABLE studio_ad_campaign_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage campaign items via campaign" ON studio_ad_campaign_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM studio_ad_campaigns
    WHERE studio_ad_campaigns.id = studio_ad_campaign_items.campaign_id
      AND studio_ad_campaigns.user_id = auth.uid()
  ));

CREATE INDEX idx_studio_ad_campaigns_user_id ON studio_ad_campaigns(user_id);
CREATE INDEX idx_studio_ad_campaigns_project_id ON studio_ad_campaigns(project_id);
CREATE INDEX idx_studio_ad_campaign_items_campaign_id ON studio_ad_campaign_items(campaign_id);
CREATE INDEX idx_studio_ad_campaign_items_status ON studio_ad_campaign_items(status);

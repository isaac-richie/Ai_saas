-- Seed Providers
INSERT INTO providers (name, slug, base_url, is_active) VALUES
('Midjourney', 'midjourney', 'https://api.midjourney.com', true),
('Runway', 'runway', 'https://api.runwayml.com', true),
('Pika', 'pika', 'https://api.pika.art', true),
('OpenAI', 'openai', 'https://api.openai.com', true)
ON CONFLICT (slug) DO NOTHING;

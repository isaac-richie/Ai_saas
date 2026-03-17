alter table if exists shots
    add column if not exists generation_settings jsonb;

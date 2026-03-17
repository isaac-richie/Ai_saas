alter table if exists shots
  add column if not exists prompt_text text,
  add column if not exists selection_payload jsonb;

-- A film can hold up to 24 references (was 6). Each shot still sends the model only the few
-- most relevant ones, chosen per shot, within what the model accepts.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.production_jobs'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%reference_assets%'
  LOOP
    EXECUTE format('ALTER TABLE public.production_jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.production_jobs
  ADD CONSTRAINT production_jobs_reference_assets_check
  CHECK (jsonb_typeof(reference_assets) = 'array' AND jsonb_array_length(reference_assets) <= 24);

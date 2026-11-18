-- Longer film: keep progress (L1-L3, Steps 2 and 3 of the Keep Progress brief).
--
-- Step 2, shots are permanent. Approving a revised plan for a film that already has a shot
-- workspace now updates that workspace in place: shot N of the new plan updates the existing shot
-- N (plan, prompt, camera, notes), so its id, Takes, approved take and place in the sequence stay.
-- Extra shots are added; shots the new plan no longer has are kept with their Takes but leave the
-- sequence (generation_settings.retired_at). Nothing is deleted. The first plan still creates a new
-- workspace exactly as 0051 did, except the scene is named "Scene" (as 0057).
--
-- Step 3, locked media is tied to the permanent shot. Each locked image, video and audio record gets
-- the id of the shot it belongs to (filled on save, when the workspace is created, and backfilled
-- here). A re-plan never touches these records.
--
-- Production shots are the rows this function made (generation_settings has production_job_id);
-- shots a creator added by hand in Scene Studio are never updated. Idempotent: safe to run again.

-- 1. Locked media records point at their shot.
alter table public.long_form_reference_bindings add column if not exists shot_id uuid references public.shots(id) on delete set null;
alter table public.long_form_video_bindings add column if not exists shot_id uuid references public.shots(id) on delete set null;
alter table public.long_form_audio_bindings add column if not exists shot_id uuid references public.shots(id) on delete set null;

-- The film's current shot workspace: the newest revision of the lineage that has one.
create or replace function public.long_form_workspace_scene(p_root uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select j.scene_id from public.production_jobs j
  where (j.id = p_root or j.parent_job_id = p_root) and j.scene_id is not null
  order by j.revision_number desc, j.materialized_at desc nulls last
  limit 1
$$;

-- The permanent shot at a place in the film, or null before the workspace exists.
create or replace function public.long_form_shot_id(p_root uuid, p_shot integer)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id from public.shots s
  where s.scene_id = public.long_form_workspace_scene(p_root)
    and s.sequence_order = p_shot
    and s.generation_settings ? 'production_job_id'
    and not (s.generation_settings ? 'retired_at')
  order by s.created_at
  limit 1
$$;

create or replace function public.long_form_binding_shot_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A new record, or one moved to another shot, points at the shot now at that place.
  if tg_op = 'UPDATE' and new.shot_number is distinct from old.shot_number then
    new.shot_id := null;
  end if;
  if new.shot_number is not null and new.shot_id is null then
    new.shot_id := public.long_form_shot_id(new.production_root_id, new.shot_number);
  end if;
  return new;
end;
$$;

drop trigger if exists long_form_reference_bindings_shot_id on public.long_form_reference_bindings;
create trigger long_form_reference_bindings_shot_id before insert or update of shot_number on public.long_form_reference_bindings
  for each row execute function public.long_form_binding_shot_id();
drop trigger if exists long_form_video_bindings_shot_id on public.long_form_video_bindings;
create trigger long_form_video_bindings_shot_id before insert or update of shot_number on public.long_form_video_bindings
  for each row execute function public.long_form_binding_shot_id();
drop trigger if exists long_form_audio_bindings_shot_id on public.long_form_audio_bindings;
create trigger long_form_audio_bindings_shot_id before insert or update of shot_number on public.long_form_audio_bindings
  for each row execute function public.long_form_binding_shot_id();

-- 2. Approving a plan: a new workspace the first time, the same workspace updated after that.
create or replace function public.materialize_production_job(target_job uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job public.production_jobs%rowtype;
  previous_job public.production_jobs%rowtype;
  project_record public.projects%rowtype;
  scene_record public.scenes%rowtype;
  sequence_record public.video_sequences%rowtype;
  shot_record public.shots%rowtype;
  existing_id uuid;
  item jsonb;
  shot_index integer := 0;
  shot_count integer;
  previous_shot uuid := null;
  anchors text;
  production_title text;
  lineage uuid;
  updated_in_place boolean := false;
begin
  select * into job from public.production_jobs
    where id = target_job and user_id = auth.uid() for update;
  if job.id is null then raise exception 'Production not found'; end if;
  if job.status <> 'approved' then raise exception 'Production must be approved'; end if;
  if job.project_id is not null then
    return jsonb_build_object('projectId', job.project_id, 'sceneId', job.scene_id, 'sequenceId', job.sequence_id, 'existing', true);
  end if;
  shot_count := jsonb_array_length(job.plan->'deliverables');
  if shot_count not between 2 and 24 then raise exception 'Production requires 2 to 24 shots'; end if;

  lineage := coalesce(job.parent_job_id, job.id);
  production_title := coalesce(nullif(job.plan#>>'{crew,bible,title}', ''), 'Untitled project');
  anchors := coalesce((select string_agg(value, ' | ') from jsonb_array_elements_text(job.plan#>'{crew,bible,continuityAnchors}')), 'Preserve approved visual identity');

  -- An earlier revision of this film already has a workspace: keep it.
  select * into previous_job from public.production_jobs
    where user_id = job.user_id and id <> job.id and (id = lineage or parent_job_id = lineage)
      and project_id is not null and scene_id is not null and sequence_id is not null
    order by revision_number desc, materialized_at desc nulls last
    limit 1;
  if previous_job.id is not null then
    select * into project_record from public.projects where id = previous_job.project_id;
    select * into scene_record from public.scenes where id = previous_job.scene_id;
    select * into sequence_record from public.video_sequences where id = previous_job.sequence_id;
    updated_in_place := project_record.id is not null and scene_record.id is not null and sequence_record.id is not null;
  end if;

  if updated_in_place then
    update public.projects set description = job.plan->>'campaignSummary', updated_at = now() where id = project_record.id;
    update public.scenes set description = job.plan->>'creativeStrategy', script_content = job.brief,
      location_prompt = job.plan#>>'{crew,bible,world}', lighting_prompt = job.plan#>>'{crew,lighting,approach}',
      color_prompt = job.plan#>>'{crew,bible,treatment}', updated_at = now()
      where id = scene_record.id;

    for item in select value from jsonb_array_elements(job.plan->'deliverables') loop
      shot_index := shot_index + 1;
      select id into existing_id from public.shots
        where scene_id = scene_record.id and sequence_order = shot_index and generation_settings ? 'production_job_id'
        order by created_at limit 1;
      if existing_id is not null then
        -- Same shot, new direction: Takes, the approved take and frames stay attached to this id.
        update public.shots set
          name = left(item->>'title', 120), description = item->>'creatorDirection', shot_type = item->>'conceptType',
          estimated_duration = coalesce((item->>'durationSeconds')::integer, 10), prompt_text = item->>'masterPrompt',
          previous_shot_id = previous_shot, provider = 'kie', model = item->>'modelFamilyId',
          duration_target = coalesce((item->>'durationSeconds')::integer, 10), aspect_ratio = coalesce(item->>'aspectRatio', '16:9'),
          generation_settings = (coalesce(generation_settings, '{}'::jsonb) - 'retired_at')
            || jsonb_build_object('negative_prompt', item->>'negativePrompt', 'production_job_id', job.id, 'production_notes', item->'productionNotes'),
          updated_at = now()
          where id = existing_id
          returning * into shot_record;
      else
        insert into public.shots(scene_id, name, description, shot_type, sequence_order, estimated_duration,
          prompt_text, previous_shot_id, provider, model, duration_target, aspect_ratio, generation_settings)
        values (scene_record.id, left(item->>'title', 120), item->>'creatorDirection', item->>'conceptType', shot_index,
          coalesce((item->>'durationSeconds')::integer, 10), item->>'masterPrompt', previous_shot, 'kie',
          item->>'modelFamilyId', coalesce((item->>'durationSeconds')::integer, 10), coalesce(item->>'aspectRatio', '16:9'),
          jsonb_build_object('negative_prompt', item->>'negativePrompt', 'production_job_id', job.id, 'production_notes', item->'productionNotes'))
        returning * into shot_record;
      end if;
      insert into public.shot_continuity(shot_id, character_locked, character_value, location_locked, location_value,
        lighting_locked, lighting_value, camera_style_locked, camera_style_value, source_shot_id)
      values (shot_record.id, true, anchors, true, job.plan#>>'{crew,bible,world}', true,
        job.plan#>>'{crew,lighting,approach}', true, job.plan#>>'{crew,camera,approach}', previous_shot)
      on conflict (shot_id) do update set
        character_locked = true, character_value = excluded.character_value,
        location_locked = true, location_value = excluded.location_value,
        lighting_locked = true, lighting_value = excluded.lighting_value,
        camera_style_locked = true, camera_style_value = excluded.camera_style_value,
        source_shot_id = excluded.source_shot_id;
      if exists (select 1 from public.sequence_shots where sequence_id = sequence_record.id and shot_id = shot_record.id) then
        update public.sequence_shots set order_index = shot_index, duration_seconds = coalesce((item->>'durationSeconds')::integer, 10)
          where sequence_id = sequence_record.id and shot_id = shot_record.id;
      else
        insert into public.sequence_shots(sequence_id, shot_id, order_index, duration_seconds)
          values (sequence_record.id, shot_record.id, shot_index, coalesce((item->>'durationSeconds')::integer, 10));
      end if;
      previous_shot := shot_record.id;
    end loop;

    -- Shots the new plan no longer has: kept, with their Takes, but out of the film's sequence.
    delete from public.sequence_shots ss using public.shots s
      where ss.sequence_id = sequence_record.id and ss.shot_id = s.id
        and s.scene_id = scene_record.id and s.sequence_order > shot_count and s.generation_settings ? 'production_job_id';
    update public.shots set generation_settings = coalesce(generation_settings, '{}'::jsonb) || jsonb_build_object('retired_at', now()), updated_at = now()
      where scene_id = scene_record.id and sequence_order > shot_count and generation_settings ? 'production_job_id'
        and not (generation_settings ? 'retired_at');
  else
    insert into public.projects(user_id, name, description, aspect_ratio, default_provider, default_model, fps, resolution)
      values (job.user_id, left(production_title, 120), job.plan->>'campaignSummary', '16:9', 'kie', 'kling', 24, '1080p')
      returning * into project_record;
    insert into public.scenes(project_id, name, description, script_content, sequence_order, location_prompt, lighting_prompt, color_prompt)
      values (project_record.id, 'Scene', job.plan->>'creativeStrategy', job.brief, 1,
        job.plan#>>'{crew,bible,world}', job.plan#>>'{crew,lighting,approach}', job.plan#>>'{crew,bible,treatment}')
      returning * into scene_record;
    insert into public.video_sequences(project_id, scene_id, name, status)
      values (project_record.id, scene_record.id, left(production_title || ' - first cut', 160), 'draft')
      returning * into sequence_record;

    for item in select value from jsonb_array_elements(job.plan->'deliverables') loop
      shot_index := shot_index + 1;
      insert into public.shots(scene_id, name, description, shot_type, sequence_order, estimated_duration,
        prompt_text, previous_shot_id, provider, model, duration_target, aspect_ratio, generation_settings)
      values (scene_record.id, left(item->>'title', 120), item->>'creatorDirection', item->>'conceptType', shot_index,
        coalesce((item->>'durationSeconds')::integer, 10), item->>'masterPrompt', previous_shot, 'kie',
        item->>'modelFamilyId', coalesce((item->>'durationSeconds')::integer, 10), coalesce(item->>'aspectRatio', '16:9'),
        jsonb_build_object('negative_prompt', item->>'negativePrompt', 'production_job_id', job.id, 'production_notes', item->'productionNotes'))
      returning * into shot_record;
      insert into public.shot_continuity(shot_id, character_locked, character_value, location_locked, location_value,
        lighting_locked, lighting_value, camera_style_locked, camera_style_value, source_shot_id)
      values (shot_record.id, true, anchors, true, job.plan#>>'{crew,bible,world}', true,
        job.plan#>>'{crew,lighting,approach}', true, job.plan#>>'{crew,camera,approach}', previous_shot);
      insert into public.sequence_shots(sequence_id, shot_id, order_index, duration_seconds)
        values (sequence_record.id, shot_record.id, shot_index, coalesce((item->>'durationSeconds')::integer, 10));
      previous_shot := shot_record.id;
    end loop;
  end if;

  update public.production_jobs set project_id = project_record.id, scene_id = scene_record.id,
    sequence_id = sequence_record.id, materialized_at = now() where id = job.id;

  -- Locked media saved before the workspace existed (or before this shot did) now points at its shot.
  update public.long_form_reference_bindings b set shot_id = s.id from public.shots s
    where b.production_root_id = lineage and b.shot_id is null and b.shot_number = s.sequence_order
      and s.scene_id = scene_record.id and s.generation_settings ? 'production_job_id' and not (s.generation_settings ? 'retired_at');
  update public.long_form_video_bindings b set shot_id = s.id from public.shots s
    where b.production_root_id = lineage and b.shot_id is null and b.shot_number = s.sequence_order
      and s.scene_id = scene_record.id and s.generation_settings ? 'production_job_id' and not (s.generation_settings ? 'retired_at');
  update public.long_form_audio_bindings b set shot_id = s.id from public.shots s
    where b.production_root_id = lineage and b.shot_id is null and b.shot_number = s.sequence_order
      and s.scene_id = scene_record.id and s.generation_settings ? 'production_job_id' and not (s.generation_settings ? 'retired_at');

  return jsonb_build_object('projectId', project_record.id, 'sceneId', scene_record.id, 'sequenceId', sequence_record.id,
    'existing', false, 'updatedInPlace', updated_in_place);
end;
$$;
revoke all on function public.materialize_production_job(uuid) from public;
grant execute on function public.materialize_production_job(uuid) to authenticated;

-- 3. Backfill: locked media already saved points at the shot now at its place in the film.
update public.long_form_reference_bindings set shot_id = public.long_form_shot_id(production_root_id, shot_number)
  where shot_id is null and shot_number is not null;
update public.long_form_video_bindings set shot_id = public.long_form_shot_id(production_root_id, shot_number)
  where shot_id is null and shot_number is not null;
update public.long_form_audio_bindings set shot_id = public.long_form_shot_id(production_root_id, shot_number)
  where shot_id is null and shot_number is not null;

notify pgrst, 'reload schema';

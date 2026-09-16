-- Turn an approved crew plan into an editable project atomically.
alter table public.production_jobs
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists scene_id uuid references public.scenes(id) on delete set null,
  add column if not exists sequence_id uuid references public.video_sequences(id) on delete set null,
  add column if not exists materialized_at timestamptz;

create unique index if not exists production_jobs_project_once
  on public.production_jobs(project_id) where project_id is not null;

create or replace function public.validate_production_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.brief <> old.brief or new.id <> old.id then
    raise exception 'Production identity and brief are immutable';
  end if;
  if (old.status = 'brief' and new.status = 'awaiting_approval') or
     (old.status = 'awaiting_approval' and new.status = 'approved' and new.plan = old.plan) then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'approved' and new.status = 'approved' and new.plan = old.plan and
     old.project_id is null and new.project_id is not null and
     new.scene_id is not null and new.sequence_id is not null then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'Invalid production transition';
end;
$$;

create or replace function public.materialize_production_job(target_job uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job public.production_jobs%rowtype;
  project_record public.projects%rowtype;
  scene_record public.scenes%rowtype;
  sequence_record public.video_sequences%rowtype;
  shot_record public.shots%rowtype;
  item jsonb;
  shot_index integer := 0;
  previous_shot uuid := null;
  anchors text;
  production_title text;
begin
  select * into job from public.production_jobs
    where id = target_job and user_id = auth.uid() for update;
  if job.id is null then raise exception 'Production not found'; end if;
  if job.status <> 'approved' then raise exception 'Production must be approved'; end if;
  if job.project_id is not null then
    return jsonb_build_object('projectId', job.project_id, 'sceneId', job.scene_id, 'sequenceId', job.sequence_id, 'existing', true);
  end if;
  if jsonb_array_length(job.plan->'deliverables') <> 3 then raise exception 'Production requires three shots'; end if;

  production_title := coalesce(nullif(job.plan#>>'{crew,bible,title}', ''), 'Crew Production');
  anchors := coalesce((select string_agg(value, ' | ') from jsonb_array_elements_text(job.plan#>'{crew,bible,continuityAnchors}')), 'Preserve approved visual identity');

  insert into public.projects(user_id, name, description, aspect_ratio, default_provider, default_model, fps, resolution)
    values (job.user_id, left(production_title, 120), job.plan->>'campaignSummary', '16:9', 'kie', 'kling', 24, '1080p')
    returning * into project_record;
  insert into public.scenes(project_id, name, description, script_content, sequence_order, location_prompt, lighting_prompt, color_prompt)
    values (project_record.id, 'Crew sequence', job.plan->>'creativeStrategy', job.brief, 1,
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

  update public.production_jobs set project_id = project_record.id, scene_id = scene_record.id,
    sequence_id = sequence_record.id, materialized_at = now() where id = job.id;
  return jsonb_build_object('projectId', project_record.id, 'sceneId', scene_record.id, 'sequenceId', sequence_record.id, 'existing', false);
end;
$$;
revoke all on function public.materialize_production_job(uuid) from public;
grant execute on function public.materialize_production_job(uuid) to authenticated;

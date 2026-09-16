# VisioWave Cinematic Production Intelligence

## North Star

VisioWave should become the world's most complete AI-assisted cinematic
production environment: a virtual studio where a creative idea can move from
brief to finished film with the discipline of a world-class production crew.

"Oscar standard" is a quality target, not a claim that software can guarantee
an award. We will earn that ambition through measurable craft: story clarity,
emotional intention, visual authorship, performance consistency, editorial
rhythm, sound quality, technical reliability, and human creative approval.

The product should feel like a senior film crew working beside the user, with
every decision visible, reviewable, reversible, and connected to the finished
result.

## Product Promise

The user describes an idea in natural language. VisioWave develops it into a
complete production package:

- A creative brief and director's treatment.
- A production bible that preserves the film's identity.
- A beat sheet, scene plan, and coverage-aware shot list.
- Reference frames and visual development.
- Camera, lighting, production design, and performance direction.
- Multiple generated takes with continuity tracking.
- An edit decision list with pacing and sound intent.
- A finished, validated master and delivery variants.

The user remains the author. The crew increases the user's range, speed, and
control.

The system must preserve creative control, make expensive actions visible,
and keep model providers interchangeable. The AI proposes and explains
production intent; deterministic services execute generation, storage,
validation, editing, and export.

The quality loop is:

```text
Intent -> Plan -> Visualize -> Generate -> Inspect -> Refine -> Edit -> Finish
```

No stage should silently hide a weak result from the next stage.

## Current Foundation

The repository already provides the core of the generation layer:

- Studio AD creates structured shot prompt packets and refines weak packets.
- Campaign Director creates multi-video plans for UGC, product, and narrative
  work.
- Fast Track generates video through Kie and polls asynchronous jobs.
- Kie currently exposes Kling and Seedance as the active video families.
- Projects, scenes, shots, takes, continuity anchors, campaigns, gallery
  assets, sequences, and export jobs are represented in the application.
- Generated media can be persisted to the gallery and associated with shots.

Current implementation locations:

- `src/core/services/studio-ad/studio-ad.service.ts`
- `src/core/actions/fast-video.ts`
- `src/infrastructure/ai/providers/kie.provider.ts`
- `src/infrastructure/ai/providers/kie.models.ts`
- `src/core/actions/sequences.ts`
- `src/core/actions/exports.ts`

## Target Experience

The user should be able to say:

> Create three vertical product films for a premium launch. Keep the same
> protagonist, wardrobe, location, and warm evening look. Give me one hero
> film, one testimonial, and one tactile product close-up.

The system should then:

1. Interpret the brief and identify missing information.
2. Create a production bible with style and continuity anchors.
3. Propose a story and scene structure.
4. Create a coverage-aware shot list.
5. Assign models and generation settings per shot.
6. Ask for approval before expensive generation.
7. Generate multiple takes through Kie.
8. Review takes for continuity and technical defects.
9. Regenerate weak shots with targeted corrections.
10. Assemble approved takes into a sequence.
11. Prepare captions, audio, pacing, and export settings.
12. Present a final reviewable package to the user.

## September 2026 implementation checkpoint

The first end-to-end North Star foundation is now represented in code: durable
planning checkpoints, materialization, generation jobs, takes, technical and
sampled-keyframe review, versioned correction proposals, approved-take editing,
sound/color/delivery finishing, quality scorecards, and retry/cancel operations.
See `docs/PRODUCTION_DESK_RELEASE.md` for migration order and exact limitations.

The next engineering ceiling is infrastructure rather than UI: an external job
runner for fully unattended work, full-frame temporal video analysis, real music
and dialogue post-production, attached caption tracks, and multi-scene editorial
reasoning. These are not presented as complete in the current product.

For a feature-quality sequence, the same workflow must also support scene
geography, recurring characters or products, motivated camera choices,
coverage, cut points, sound intention, and versioned creative decisions.

## What Makes This Exceptional

### Director-grade intent

The system must understand why a shot exists, not just describe what it looks
like. Every shot gets an intention such as reveal, threat, intimacy, relief,
scale, proof, or transition. Camera and lighting choices must serve that
intention.

### Film grammar, not prompt decoration

Prompts should encode blocking, screen direction, eyelines, axis, temporal
causality, motivated movement, lens behavior, exposure, and edit purpose. The
agent must reject impressive-sounding combinations that cannot be executed or
cut together coherently.

### Persistent world model

Characters, faces, wardrobe, products, props, locations, weather, time of day,
camera geography, and color language must be represented as reusable entities.
The continuity system should compare every new take against this world model.

### Coverage by design

The crew should plan master, medium, close-up, insert, reaction, establishing,
and transition shots according to the scene's editorial needs. A beautiful
single clip is not a finished scene.

### Iterative excellence

The first generation is a blocking pass. The system should identify the most
valuable correction, regenerate only what is weak, and preserve approved
decisions. Iteration must improve the film rather than randomly restyle it.

### Finish quality

The final result must be judged as a film, not a collection of model outputs.
Picture, edit, sound, captions, color, framing, and delivery metadata all need
to pass a final technical and creative review.

## Cinematic Crew

### Executive Producer

Turns the user request into a production brief, deliverables, constraints,
complexity estimate, and approval checkpoints.

### Story Architect

Creates the narrative spine, beat sheet, scene order, action arc, and emotional
progression. For non-narrative work, this becomes a clear visual progression.

### Cinematographer

Defines shot size, camera position, lens behavior, movement, composition,
depth, frame rate, aspect ratio, and edit-safe coverage.

### Lighting Designer

Defines key, fill, rim, practicals, color temperature, contrast, exposure,
time of day, and how light should remain consistent across shots.

### Production Designer

Defines locations, wardrobe, props, materials, set dressing, palette, and
visual continuity anchors.

### Performance and Action Director

Converts story intent into specific subject behavior, gestures, blocking,
timing, screen direction, and performance energy.

### Continuity Supervisor

Checks identity, wardrobe, props, lighting direction, geography, camera axis,
duration, and transitions between neighboring shots.

### Editor

Selects approved takes, orders shots, trims clips, sets pacing, proposes
transitions, captions, music, and audio requirements.

### Finishing and QC Agent

Checks prompt compliance, media availability, duration, aspect ratio, audio,
visual artifacts, unsafe content, export readiness, and delivery metadata.

## Agent Tool Boundary

The orchestrator may call tools such as:

- `create_production_bible`
- `create_scene_plan`
- `create_shot_list`
- `create_master_prompt`
- `generate_fast_video`
- `poll_generation`
- `save_take`
- `approve_take`
- `check_continuity`
- `regenerate_shot`
- `assemble_sequence`
- `queue_export`

Each tool must:

- Validate input with Zod before execution.
- Verify the authenticated user owns the referenced project and scene.
- Return a typed result or an explicit error.
- Record an event in the production job history.
- Be idempotent where retries are possible.
- Never expose provider API keys to the browser.

## Astra Orchestrator

The supervising agent should be GPT-6 Astra when the account and API project
have access to it. Astra coordinates the crew, reasons over structured
artifacts, resolves conflicts, and decides which specialist should run next.

Astra should not render video or write directly to the database. The application
must expose narrow tools that perform those operations and return validated
results. The current Studio AD model is configured through `STUDIO_AD_MODEL`
and defaults to `gpt-5.5`; Astra should be an environment-controlled migration
with a tested fallback.

Astra has bounded authority:

- Planning and critique may run automatically.
- Generation runs only within the user's approved scope and quota.
- Regeneration runs only within an explicit retry budget.
- Publishing, sharing, purchasing, and irreversible delivery decisions require
  user approval.
- Every action and tool result is auditable.

For orchestration, use the OpenAI Responses API with structured outputs and
tool calling. Keep the existing prompt packet schema as a compatibility layer
while introducing the broader production schemas.

## Production State Machine

Every autonomous production should have a durable state:

```text
brief
  -> planning
  -> awaiting_approval
  -> generating
  -> reviewing
  -> regenerating (optional)
  -> editing
  -> exporting
  -> completed
```

Any failure should move to `failed` with a human-readable reason and a safe
retry action. A user may pause or cancel a job before the next expensive step.

## Proposed Persistence

Add a durable production orchestration layer rather than storing the entire
workflow only in model responses.

### `production_jobs`

- `id`
- `user_id`
- `project_id`
- `scene_id`
- `job_type`
- `status`
- `brief`
- `production_bible`
- `requested_outputs`
- `current_step`
- `requires_approval`
- `created_at`
- `updated_at`
- `completed_at`
- `error_message`

### `production_job_events`

- `id`
- `job_id`
- `event_type`
- `agent_role`
- `input_snapshot`
- `output_snapshot`
- `provider_task_id`
- `status`
- `error_message`
- `created_at`

### Production artifacts

Use typed JSON artifacts for the production bible, story plan, shot plan,
continuity report, edit decision list, and QC report. Keep large media in
storage and reference it by durable URL or storage path.

### `production_entities`

Reusable continuity entities for characters, products, props, locations,
wardrobe, and visual motifs. Each entity should support approved descriptions,
reference media, and version history.

### `production_decisions`

An immutable record of approved look, lens package, character reference, take
selection, edit point, or rejected direction. Later agents must not silently
undo an approved choice.

### `media_inspections`

Machine-readable inspection results for every generated asset, including codec,
reachability, duration, dimensions, audio tracks, artifact flags, identity,
continuity, prompt adherence, and human review status.

## Production Bible

The production bible is the shared memory of the crew. It should contain:

- Project premise and audience.
- House visual style.
- Color and lighting language.
- Camera and lens package.
- Aspect ratio and frame rate.
- Character or product identity anchors.
- Wardrobe and prop anchors.
- Location and geography anchors.
- Dialogue or text constraints.
- Negative constraints and safety notes.
- Approved reference images.

Every shot prompt should receive a compressed, relevant subset of this bible.
The full bible should not be copied blindly into every request.

The bible should also contain the film's creative constitution:

- What the audience should feel.
- What the camera is allowed to do.
- What visual choices are forbidden.
- What must remain stable.
- What may evolve between scenes.
- What makes the film recognizably its own.

## Quality Gates

The system must not accept a successful provider response as a successful shot
without review.

Required gates include:

- Duration requested, generated, and persisted must agree.
- Aspect ratio and frame rate must be compatible with the sequence.
- A continuity-sensitive shot must have continuity anchors.
- A generated URL must be reachable before the take is marked complete.
- Audio presence must be recorded when audio was requested.
- Failed provider jobs must never appear as completed gallery assets.
- Unsafe or policy-blocked prompts must return a useful revision path.
- A user approval is required before batch generation and final export.

### Creative review gates

- Story: the scene has a clear dramatic or commercial purpose.
- Look: references, palette, lens language, and lighting agree.
- Blocking: subject action and camera movement are physically legible.
- Coverage: the editor has enough usable angles and transitions.
- Performance: expression, gesture, and eyeline match the intended beat.
- Continuity: identity, wardrobe, props, geography, and light direction agree.
- Edit: the sequence communicates without relying on explanation.
- Sound: dialogue, ambience, music, and effects support the image.
- Master: final media passes technical, accessibility, and delivery checks.

Each gate must produce a score, evidence, specific failures, and the smallest
useful correction. A score without evidence is not an approval.

## Evaluation System

World-class output requires a repeatable evaluation program. Build a private
evaluation set covering narrative, product, fashion, UGC, action, portrait,
environment, and multi-shot continuity.

Track story clarity, emotional intention, subject identity, product integrity,
camera adherence, lighting continuity, temporal stability, editability,
coverage completeness, audio quality, safety compliance, and expert reviewer
preference. Every major prompt, model, provider, and orchestration change must
be tested against this set.

## Editing and Finishing

Kie remains the video generation layer. A separate deterministic media layer is
needed for finishing:

- Clip trimming and concatenation.
- Crossfades and restrained transitions.
- Audio bed and voiceover mixing.
- Captions and title cards.
- Loudness normalization.
- Color and contrast presets.
- Aspect-ratio exports.
- Poster and thumbnail extraction.
- Final media validation.

FFmpeg is a suitable first implementation for deterministic assembly. Astra
can produce an edit decision list, but the server-side worker should execute
the actual render and report machine-verifiable results.

The editor should work from an explicit edit decision list containing ordered
shot and take IDs, in and out points, transition intent, dialogue and music
events, captions, color notes, and delivery profile. The interface should make
cuts non-destructive, comparable, and restorable.

## Sound Department

Sound is a first-class department. The crew should plan dialogue or voiceover,
room tone, ambience, Foley, designed effects, music mood, tempo, edit points,
ducking, loudness targets, caption timing, and accessibility metadata.

Generated video with missing or unexpected audio must be surfaced immediately,
with a clear retry or replacement action.

## Safety and Control

Autonomy must be bounded by explicit application permissions:

- Planning is low risk and may be automatic.
- Generation consumes quota and requires approval for campaigns.
- Regeneration may be automatic within a configured retry budget.
- Publishing, sharing, or external communication always requires user action.
- Provider and storage access remain server-side.
- Prompt compliance runs before every generation call.
- Agent actions and tool results are auditable.

The agent should explain what it changed, why a take was rejected, and what the
next action will cost in time or generation quota.

## Operating Principles

- Craft before spectacle.
- Continuity before novelty.
- Evidence before confidence scores.
- Approved decisions are durable.
- Every expensive action is visible.
- Every generated asset is traceable to a brief, prompt, model, and take.
- Human taste remains the final authority.
- Failure is recoverable and never silently discarded.

## Delivery Phases

### Phase 1: Orchestration foundation

- Add production job and event migrations.
- Define production artifact schemas.
- Migrate Studio AD to a Responses-compatible adapter.
- Add a single orchestrator route with tool boundaries.
- Preserve the current Fast Track experience as the fallback path.

### Phase 2: Crew planning

- Add production bible generation.
- Add scene and shot-list planning.
- Add campaign execution from existing deliverables.
- Add approval UI before generation.

Current progress: production bible and shot planning are represented by a
five-role crew for fixed three-shot sequences, and approval is available in
Fast Track. Campaign execution, plan revision, durable execution, and broader
scene structures remain open.

### Phase 3: Generation supervision

- Run Kie jobs from approved shot plans.
- Track provider task IDs and polling state.
- Save every take with prompt, model, duration, aspect ratio, and source.
- Add continuity and technical review reports.
- Add targeted regeneration with a retry budget.

### Phase 4: Editorial finishing

- Add edit decision list persistence.
- Add sequence assembly worker.
- Add audio, captions, transitions, and export profiles.
- Connect completed sequences to the gallery and exports area.

### Phase 5: Production-grade operations

- Add resumable background workers.
- Add observability, tracing, cost reporting, and quotas.
- Add evaluation datasets for prompt quality and continuity.
- Add project versioning and rollback for production artifacts.
- Add team review, comments, and approval history.

### Phase 6: World-class creative intelligence

- Add reference-aware visual development and look exploration.
- Add entity-level identity and product continuity checks.
- Add automatic coverage analysis and missing-shot recommendations.
- Add scene geography and screen-direction validation.
- Add performance and action review against the approved beat sheet.
- Add sound planning, audio review, captions, and loudness validation.
- Add expert evaluation dashboards and regression thresholds.

### Phase 7: Virtual studio scale

- Add reusable show bibles and production templates.
- Add project-level style learning from approved user decisions.
- Add multi-cut editing and side-by-side creative comparison.
- Route providers based on measured shot-type performance.
- Add resumable distributed workers for generation, inspection, and render.
- Add professional delivery profiles for social, web, broadcast, and archive.

## Definition Of Done

The first cinematic crew release is ready for beta when a signed-in user can
submit one brief, review a treatment and production bible, approve a
coverage-aware shot plan, generate at least two coherent takes per shot,
inspect evidence-backed quality reports, reject or regenerate a take, assemble
approved takes, add a sound plan, and export a validated video while seeing the
full production history.

The world-class target is reached progressively when independent reviewers
consistently find the output emotionally intentional, visually coherent,
editorially usable, technically clean, and meaningfully better than direct
single-prompt generation. The system should publish these evaluation results
internally and use them to decide what to improve next.

The system should be described as a professional AI-assisted production
workflow. The ambition is unprecedented creative leverage; the proof is
measured craft, successful exports, expert review, and user-reviewed results.

# Production Desk: North Star Foundation

This release turns Production Desk into a human-approved, resumable production
pipeline. A brief moves through a five-role Astra crew, materializes into real
projects/scenes/shots, generates durable Kling or Seedance takes, reviews those
takes, assembles approved footage, and records beta quality evidence.

## Required migrations

Apply these files in order in the Supabase SQL editor:

1. `0021_production_desk.sql`
2. `0022_production_materialization.sql`
3. `0023_production_review_finishing.sql`
4. `0024_production_revision_loop.sql`
5. `0025_durable_crew_planning.sql`

Migration 0021 creates owner-scoped production jobs and event history. Migration
0022 atomically creates the project, scene, sequence, shots, and continuity
locks from an approved plan. Migration 0023 adds take inspections, editorial
intent, finishing settings, and beta scorecards. Migration 0024 adds immutable
prompt-correction history and versioned production briefs. Migration 0025 adds
lease-protected planning checkpoints and updates the transition guard so only
safe same-status planning updates are accepted.

## Runtime configuration

- `OPENAI_API_KEY` is server-only and powers planning, keyframe review, and
  corrective prompt proposals.
- `PRODUCTION_CREW_MODEL` is optional and defaults to `gpt-6-astra`.
- Kie credentials remain server-only and power Kling and Seedance generation.
- The deployment needs FFmpeg and FFprobe for keyframe inspection and sequence
  finishing. If the host does not provide these binaries, move these routes to
  a media worker image that does.
- Long-running route limits must allow up to 180 seconds for one Astra stage and
  300 seconds for local sequence finishing.
- `PRODUCTION_WORKER_SECRET` (or `CRON_SECRET`) and
  `SUPABASE_SERVICE_ROLE_KEY` are required for unattended crew recovery. Call
  `GET /api/production/worker` from a trusted scheduler every five minutes with
  `Authorization: Bearer <secret>`. The worker advances at most two saved stages
  per run and retains the existing user-approval boundary before generation.

## Implemented workflow

1. Save a production brief.
2. Develop it through persisted story, camera/lighting, shot, and review stages.
3. Resume from the last checkpoint after a refresh or recoverable failure.
4. Approve the written direction before video credits can be spent.
5. Materialize the approved plan into editable production records atomically.
6. Generate one take per shot through Kling or Seedance with persistent jobs.
7. Poll submitted provider jobs after reload and retry individual failures.
8. Inspect duration, dimensions, aspect ratio, and browser-visible audio metadata.
9. Optionally inspect first/middle/last keyframes against prompt and continuity
   locks. The report explicitly excludes motion, audio, and unsampled frames.
10. Ask Astra for a targeted correction, review it, and explicitly apply it to
    the next take while retaining the previous prompt.
11. Approve takes and edit order, trim, duration, cuts, dissolves, and fades.
12. Normalize picture/audio, apply a color intent, render delivery aspect ratios,
    and save a four-axis beta quality scorecard.
13. Recover up to two unclaimed planning stages per scheduler run through the
    protected production worker. The export worker now also uses the admin client
    for trusted cron calls, while normal browser calls remain user-scoped.

## Safety and authority

Planning and critique may run automatically. Generation starts only after the
user approves direction and presses a credit-labelled generation control. A
correction proposal never changes a shot until the user applies it. The system
does not bypass provider policies and never exposes provider keys to the client.
Publishing, spending beyond the visible generation action, and irreversible
delivery remain outside autonomous authority.

## Honest limitations

- Three sampled keyframes are not full temporal video understanding.
- Browser audio detection is best-effort; FFprobe standardizes tracks at render.
- Caption intent is stored, but rendering intentionally stops until an actual
  caption track is attached. It does not fabricate captions.
- A request handler resumes the next saved planning stage when the UI asks it to;
  a queue worker or scheduler is still required for unattended planning while
  every client is offline.
- Cinematic excellence is a measurable target, not an award guarantee. Human
  approval remains the final creative and quality decision.

## Verification

Run `npm run build` and `npm run lint`. Exercise one signed-in production on the
deployment host because provider networking, route duration, FFmpeg availability,
and storage policies cannot be fully proven by a local compile.

## Production Desk UI fixes (2026-10-17)

Implements `Production_Desk_UI_Fixes_Spec.docx`. No new migrations.

1. **@image mentions in the film brief.** The brief is a `MentionTextarea`.
   Typing `@` opens the film's references at the caret, each with its thumbnail
   and a permanent tag (`@image1`…`@image12`, `@video1`…). Tags are assigned
   once on upload by `labelProductionAssets()` and never renumber when other
   references are removed. The crew is told which image each tag means.
2. **Production dropdown cleanup.** `ProductionPicker` replaces the native
   select: search, status pills (Draft / Ready to approve / In production),
   dates, a per-row trash button with the inline confirmation
   "Delete this production draft?", and "Clear drafts" for every unplanned
   brief except the open one. `deleteProductions(ids)` checks ownership before
   it deletes revisions and roots.
3. **Corrected takes with images.** "Request a corrected take" (`CorrectionBox`)
   accepts up to four images ("Add image") and `@` tags for the film's
   references. The images are checked for ownership and sent to the correction
   supervisor alongside the note.

### Studio, Create and UGC polish

- Shared controls inside the workspace (selects, inputs, details, tables,
  scrollbars, focus rings) follow the obsidian-and-gold system.
- The gold primary-button style no longer leaks onto badges and tab lists, so
  the project page's Scenes / Asset Library tabs are readable again.
- Project pages highlight Studio in the menu, not Home.
- The empty shot board is a designed empty state instead of loading skeletons.
- Create on desktop keeps the preview sticky beside the controls; the free
  prompt preview link sits just above Create video.
- "Make a set of ads": segmented ad count, a full-width "Plan N ads" button,
  and clearer Character and Product cards.
- On phones, the scene builder's Generate image and Enhance with AI buttons
  stack instead of clipping.

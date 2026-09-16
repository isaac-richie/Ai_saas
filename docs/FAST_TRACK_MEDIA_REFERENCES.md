# Fast Track Media References

## Setup

Apply migrations **0026, 0027, then 0028** after the earlier production migrations. 0027 creates a **private** `media-references` bucket with authenticated owner-only reads/uploads and adds a storyboard snapshot column. 0028 adds account-level reference setups and shared analysis limits. These migrations do not delete media or project data. Production Desk's image drawer uses 0026 independently. SQL files are in `src/infrastructure/supabase/migrations/`.

The existing server-only `OPENAI_API_KEY` powers analysis. Optional overrides:

```dotenv
REFERENCE_ANALYSIS_MODEL=gpt-6-astra
REFERENCE_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
REFERENCE_AUDIO_MODEL=gpt-audio-1.5
# Only if FFmpeg is not on the server PATH:
# FFMPEG_PATH=/absolute/path/to/ffmpeg
# FFPROBE_PATH=/absolute/path/to/ffprobe
```

Director analysis falls back to `PRODUCTION_CREW_MODEL`, then the existing crew default. Non-speech audio uses the separate audio model to listen, then passes its observations to the director. Video/audio analysis require FFmpeg on the deployed server, not just the developer's laptop; take inspection also requires FFprobe. On serverless deployments, provide compatible binaries or move analysis to a media worker. No new browser-visible credentials are required. Model access must be verified in the deployment account.

## Workflow

1. Single-shot Studio > Advanced Controls > Media references.
2. Add images, video or audio (up to six per context, 25 MB each; media up to ten minutes).
3. Expand a card; choose its role, priority, influence and scope. Trim video/audio to a section of at most 30 seconds for analysis.
4. Choose Director guidance or, for one image, Direct image-to-video.
5. Analyse, review/edit the resulting direction and warnings, then Apply Reference. Changing creative settings clears approval; changing role/trim invalidates analysis.
6. Generate. Only applied references are included; unsupported native inputs fail before quota is consumed. Subject, reference direction and duration must fit the current adapter's prompt budget.
7. Use **Save setup** to store all reference scopes in your account. On another device choose **Load setup**. Loading asks before replacing a non-empty local setup; saving uses revisions to prevent another session's changes being silently overwritten. Local edits during an in-flight sync are disabled. Loading when no cloud setup exists leaves local work untouched.

Existing continuity fields remain below the manager. References are evidence; continuity locks are instructions. Reference locks protect card settings, not a guarantee that a model preserves every detail.

## What Is Implemented

- Multiple image/video/audio uploads directly to private storage, without routing large files through Next.js Server Actions.
- Signed previews; waveform for browser-decodable audio; native playback and trim preview; preview volume/mute.
- Modality-specific roles, priority, influence, scope, lock/unlock, replacement and detach actions.
- Image analysis; four-frame video sampling; speech transcription; actual listening for music/effects/ambience/timing; structured director guidance and peer-direction conflict warnings.
- Explicit Apply step, ownership checks, prompt-budget checks, and one-image adapter compatibility checks.
- Reference snapshots with local takes, gallery shot generation settings/parameters, scene promotion, and cloud storyboard records. Loading saved clips/takes and editing storyboard shots restores their references.
- Draft settings survive navigation/reload on this browser. Scene/project-scoped references are filtered by their recorded context. Start next shot setup detaches shot-only references; Continue from storyboard carries locked scene/project references.
- Explicit cloud setup save/load across devices, with optimistic revision checks and private owner-only access.
- Take inspection compares attached source images against the generated keyframes, limited to their selected roles. Video/audio requirements are explicitly not verified by a still-frame review.
- Shared, atomic Supabase limits: six analyses per minute and sixty per UTC day per account (reference analysis and take inspection combined). Missing limit configuration fails closed before paid model calls.

## Honest Limits / Follow-up Work

- Unsaved scope drafts remain in this browser until **Save setup** is used. Cloud save/load is explicit, not live collaboration or automatic merging. There is no team sharing yet.
- Production Desk and campaign batch generation retain their existing reference workflows; this manager is for Single-shot Studio.
- The current Kie adapter forwards one image. Video/audio refs guide the text prompt, not native model conditioning. Direct image mode may transfer its full composition and cannot promise role isolation. Influence is a prompt instruction, not a provider numeric strength setting.
- Video motion is inferred from four samples, not tracked or reproduced exactly. Speech analysis is transcript-based, not voice cloning or word-aligned lip-sync.
- Music/effects/ambience/timing analysis listens to the selected trim and describes sound/energy/rhythm cues. It does not measure precise BPM or beat timestamps. No source audio is mixed into generated output.
- Image crop editing, measured beat mapping, native motion/lip-sync adapters and full temporal/audio output QC remain follow-up work. Still-frame visual comparisons are implemented, but user footage still needs manual quality review.
- Removing a reference detaches it; its original stored file remains. There is no asset-library cleanup UI yet.
- Shared analysis limits require migration 0028; the in-memory limiter is only an additional early throttle, not the authoritative cost limit.

## Verification

Run `node --test scripts/test-media-references.mjs scripts/test-bounded-body.mjs`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

Authenticated smoke test after migration: upload each modality, preview, analyse a short trim, edit a direction and apply; refresh/navigate back; generate and save; reload storyboard and inspect the stored `media_references`. Verify a second account cannot read the private object. Live provider calls incur API costs.

Implementation references: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [speech transcription](https://developers.openai.com/api/docs/guides/speech-to-text).

Audio listening follows the [official Audio in Chat Completions guide](https://developers.openai.com/api/docs/guides/audio-chat-completions), using WAV input and text-only output. The director model is unchanged.

### Release verification (2026-09-16)

- Eighteen schema/compatibility/bounded-stream unit tests pass. Lint, TypeScript and production build are run before pushing.
- Isolated desktop/mobile browser checks with mocked storage/analysis pass for approval, locks, stale-analysis invalidation, trims, waveform, provider compatibility, next-shot reset, cloud save/load, revision conflicts, empty-cloud preservation and horizontal overflow. The temporary fixture route is removed before the release build. These do not replace live RLS/upload tests.
- Read-only live schema check found migrations 0026-0028 pending. No production migration was applied automatically.
- Configured OpenAI account exposed both director and audio models. A paid synthetic one-second tone smoke test returned a correct steady-tone description without invented speech. This is not an end-to-end uploaded-media test.
- Authenticated upload, cloud persistence, RLS isolation and shared-limit smoke tests must be run after the migrations are applied. GitHub push alone does not configure Supabase or install FFmpeg on Vercel.

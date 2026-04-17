# Visiowave AI Studio (AISAS)

Production-focused AI cinematography studio for image/video generation, shot orchestration, sequence building, and export.

## What We Have Built So Far

### Core Product
- Authenticated dashboard with Projects -> Scenes -> Shots workflow.
- Shot Builder with structured cinematic controls (shot size, lens, movement, lighting, mood, etc.).
- Fast Track Video Studio for quick direct-to-video generation.
- Reusable element/reference upload flow for scene consistency.
- Shot list with generation options, approval workflow, compare/pin, and animate-to-video actions.
- Sequence builder and sequence export pipeline.
- Inner Circle waitlist capture flow.

### Studio AD (AI Assistant Director)
- Assistant Director panel embedded in Shot Builder and Fast Track.
- `/api/ad/direct-shot` endpoint for shot direction packets.
- Structured packet output:
  - strategy
  - shot strategy (framing/lens/movement/lighting/mood/composition)
  - master prompt + negative prompt
  - variants
  - technical metadata
  - production scores
  - director notes
- Critic/Refiner pass:
  - Detects contradictions and low-readiness outputs.
  - Auto-refines packet before returning when needed.
- Auth + throttling on AD route.
- AD packet persistence/history:
  - Saved packet metadata + scores in database.
  - Recent directs surfaced in UI.

### UI/UX Upgrades (Current)
- Premium design system pass:
  - new button variants (`studio`, `studioSecondary`, `studioGhost`)
  - new card/field/chip utility styles (`studio-card`, `studio-subcard`, `studio-field`, `studio-chip`)
- Shot Builder + Assistant Director layout cleanup for less crowded composition.
- Shot generation/approval cards redesigned for clearer hierarchy and presentation readiness.

## Stack
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- Supabase (Auth, Postgres, Storage, RLS)
- OpenAI SDK

## Local Setup
1. Install dependencies:
```bash
npm install
```
2. Copy env template:
```bash
cp .env.local.example .env.local
```
3. Fill required variables in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ENCRYPTION_KEY`

Recommended/optional:
- `OPENAI_API_KEY` (required for Studio AD/OpenAI generation features)
- `KIE_AI_API_KEY`
- `EXPORT_WORKER_SECRET` or `CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` (required for admin/server-only flows such as waitlist/admin operations)
- `STUDIO_AD_MODEL` (optional override; default in code)
- `STUDIO_AD_REFINER_MODEL` (optional override; defaults to `STUDIO_AD_MODEL`)

4. Run dev server:
```bash
npm run dev
```

## Database Migrations
Migrations live in:
- `src/infrastructure/supabase/migrations`

Important recent migration:
- `0016_studio_ad_packets.sql` (Studio AD packet history table + RLS policies)

Apply migrations in your Supabase workflow before testing new AD history features.

## Build
```bash
npm run build
npm run start
```

## API Surface (Key Routes)
- `POST /api/ad/direct-shot` - Generate Studio AD packet.
- `GET /api/ad/direct-shot?limit=...` - Fetch recent Studio AD directs for signed-in user.
- `POST /api/inner-circle` - Submit Inner Circle waitlist lead.
- `POST /api/exports/worker` - Export queue worker execution.

## Deploy (Vercel)
- Production branch: `main`
- Project root: repo root
- `vercel.json` includes export worker cron:
  - `*/5 * * * *` -> `/api/exports/worker?limit=3`
- Set environment variables in Vercel:
  - Supabase keys
  - model/provider keys
  - `CRON_SECRET` or `EXPORT_WORKER_SECRET`

## Notes
- API keys are encrypted at rest.
- Provider connection tests are available in Dashboard Settings.
- Export queue supports manual run and background worker processing.
- Studio AD now saves prompt packets and readiness scores for continuity and reuse.

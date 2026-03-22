# Visiowave AI Studio (AISAS)

Production-focused AI cinematography studio built with Next.js + Supabase.

## Stack
- Next.js 16 (App Router)
- React 19
- Tailwind CSS
- Supabase (Auth, Postgres, Storage)

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
- `ENCRYPTION_KEY` (required)

Optional:
- `OPENAI_API_KEY`
- `KIE_AI_API_KEY`
- `EXPORT_WORKER_SECRET` or `CRON_SECRET`

4. Run dev server:
```bash
npm run dev
```

## Build
```bash
npm run build
npm run start
```

## Deploy (Vercel)
- Production branch: `main`
- Project root: repo root
- `vercel.json` includes export queue cron:
  - `*/5 * * * *` -> `/api/exports/worker?limit=3`
- Set `CRON_SECRET` (or `EXPORT_WORKER_SECRET`) in Vercel env.

## Notes
- API keys are encrypted at rest.
- Provider connection tests are available in Dashboard Settings.
- Export queue supports manual run and background worker processing.

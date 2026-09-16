# Reference workflow release check

## Verified in this audit

- Production build, including TypeScript, and ESLint passed after patches.
- 21 unit tests passed (run `npm test`).
- Live Supabase checks used two temporary confirmed accounts and a synthetic PNG.
- Own-account reference library reads and writes succeeded.
- Cross-account library reads returned no records; updates affected no records;
  insert attempts for another owner were rejected.
- Stale optimistic revisions did not overwrite saved library data.
- Private reference upload and download succeeded for the owner.
- Another account could not download, sign, or upload into the owner's folder.
- Analysis quota allowed six calls and rejected the seventh within the minute.
- Authenticated clients could not directly read the usage table.
- Signed-in local HTTP library checks passed: initial load, save, reload,
  conflict (409), and invalid revision (400).
- Signed-out library GET/PUT, reference analysis, and take inspection returned 401.
- All temporary test accounts and test storage objects were removed.
- Local FFmpeg and FFprobe executables are installed.

## Patched

- Check media executables before consuming shared analysis quota. Return a safe
  503 if the deployment cannot run the required binary.
- Share a 150-second cancellation deadline across media downloads, FFmpeg/FFprobe
  processes, and OpenAI calls so sequential expensive steps cannot each spend a
  separate full timeout. Database/storage SDK calls are not bounded by this signal.
- Stop returning raw process/provider exception messages from take inspection.
- Prevent temporary-file cleanup failures from replacing a handled API response.
- Add runtime-preflight regression tests and an explicit npm test command.

## Remaining release gates

- Verify deployed FFmpeg/FFprobe availability and runtime budget on Vercel.
  Local binaries are not evidence that deployment binaries exist. This patch
  detects missing binaries; it does not bundle them for the deployment.
- Verify deployed environment variables target the migrated project; do not put
  service-role or provider keys in client-exposed environment variables.
- Run browser-level upload/analysis/generation/gallery/download/movie-assembly
  tests against deployment, including navigation/reload and provider failures.
- No paid generation or analysis API calls were made during this audit.
- Monitoring, backup recovery, daily quota rollover/concurrent load, and the
  production-reference immutability trigger were not exercised in this audit.
- Rotate any credentials previously exposed in chat before public launch.

These results verify the listed paths, not blanket production readiness.

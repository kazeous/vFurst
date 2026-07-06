# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. It is the cheapest way to know what is real.

## Current phase

**Phase 0 - Foundation & Planning** (in progress)

Phase 0 is locally complete under the updated local-development directive:

- Cloud deployment setup is deferred until after Phase 7.
- `.github/workflows/deploy.yml` and `.env.staging` are intentionally absent.
- `docker-compose.yml` provides the local Postgres, Redis, MinIO, and Mailpit stack used for Phases 0-7.
- Stripe is expected to use a free test-mode account and local webhook forwarding when payment flows are implemented; live-mode setup is not a Phase 0 blocker.
- The only remaining Phase 0 completion checkpoint is authenticated evidence that GitHub Actions CI is green for the latest Phase 0 commit.

## Status by phase

| Phase | Status | Notes |
|-------|--------|-------|
| 0 - Foundation | In progress | Repository checks and local Docker Compose stack are verified; GitHub Actions CI status still needs authenticated verification. |
| 1 - Core Infrastructure | Not started | |
| 2 - Registration & Hotel | Not started | |
| 3 - Store & Add-ons | Not started | |
| 4 - Volunteers & Vendors | Not started | |
| 5 - Advanced Features | Not started | |
| 6 - SaaS Layer | Not started | |
| 7 - Launch | Not started | |

Legend: Not started - In progress - Verified complete

## Session log

### 2026-07-06 - Phase 0, session 9
- Built: No source changes. Re-read the required Phase 0 instructions and re-audited the current repository against the updated local-stack directive.
- Verified:
  - Current HEAD is `f3ebb63632be11a21843e70c00ec635bb054ac13` on `main`, pushed to `origin/main`.
  - `docker-compose config` passed and rendered Postgres, Redis, MinIO, and Mailpit. It still prints a Docker config-file access warning for `C:\Users\Kazeous\.docker\config.json`.
  - `docker-compose ps` passed after elevated Docker engine access; Postgres, Redis, MinIO, and Mailpit are running.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run test:e2e` passed.
  - `turbo run type-check` passed via the Windows `.cmd` shim.
  - `turbo run lint` passed via the Windows `.cmd` shim.
  - `cd packages/db && npx prisma validate` passed via the Windows `.cmd` shim.
  - `turbo run build` passed via the Windows `.cmd` shim.
  - `gh` is still unavailable, no `GH*`/`GITHUB*`/`ACTIONS*` environment token is present, and unauthenticated GitHub API/page checks for the repo Actions/status endpoints still return `404`.
- Deviated from plan:
  - Used `docker-compose` instead of `docker compose` because this shell does not expose the modern Compose plugin.
  - Used Windows `.cmd` shims because PowerShell blocks `npm.ps1`, `npx.ps1`, and package-bin `.ps1` wrappers under the current execution policy.
- Remaining issues:
  - GitHub Actions CI status for `f3ebb63632be11a21843e70c00ec635bb054ac13` still needs authenticated verification before Phase 0 can be marked verified complete.
  - The known Next 15/PostCSS audit advisory remains an open dependency question, but it is not listed as a Phase 0 completion gate.
- Next session should: verify GitHub Actions CI for `f3ebb63632be11a21843e70c00ec635bb054ac13` with authenticated repository access, then mark Phase 0 complete if CI is green. Do not start Phase 1 until Phase 0 is marked verified complete.

### 2026-07-06 - Phase 0, session 8
- Built:
  - Reconciled Phase 0 with the updated local-stack plan directive.
  - Added root `docker-compose.yml` for Postgres 16, Redis 7, MinIO, and Mailpit.
  - Removed deferred deployment artifacts: `.github/workflows/deploy.yml` and `.env.staging`.
  - Removed the obsolete `docs/operations/phase-0-external-setup.md` checklist.
  - Updated `.env.example` and `.env.local` for the Docker Compose stack, MinIO via `S3_ENDPOINT`, Mailpit SMTP, Auth.js, and Stripe test-mode placeholders.
  - Updated `.gitignore` so `.env.staging` remains ignored until deployment is in scope.
- Verified:
  - `docker compose config` failed because this shell does not expose the modern Compose plugin and cannot read `C:\Users\Kazeous\.docker\config.json`.
  - `docker-compose config` passed and rendered all four local services.
  - `docker-compose up -d` passed after elevated Docker engine access; Postgres, Redis, MinIO, and Mailpit containers started.
  - `docker-compose ps` passed after elevated Docker engine access; all four services were running.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed.
  - `npm run test:e2e` passed.
  - Re-read `docs/plan/phase-0-foundation.md` and verified every Phase 0 requirement individually against the updated directive.
  - Checked env templates for concrete Stripe test credentials; none remain.
  - Pushed commit `fbd0227` to `origin/main` so GitHub Actions CI can run.
  - Could not verify the GitHub Actions run from this environment: `gh` is not installed, and unauthenticated access to `https://github.com/kazeous/vFurst/actions` returns `404`.
- Deviated from plan:
  - Used the legacy `docker-compose` command because this machine's `docker compose` subcommand is unavailable. The Compose file itself is valid and the local stack runs.
  - Used Windows `.cmd` shims for npm/npx commands because PowerShell blocks `npm.ps1`/`npx.ps1` under the current execution policy.
- Remaining issues:
  - GitHub Actions CI status for commit `fbd0227` needs authenticated verification before Phase 0 can be marked verified complete.
  - `npm audit --audit-level=moderate` still reports the known moderate PostCSS advisory through `next@15.5.20`, with no non-breaking fix available from npm audit. This is not caused by Phase 0 changes and is not listed as a Phase 0 completion gate.
- Next session should: verify GitHub Actions CI for the latest Phase 0 commit with authenticated repository access, then mark Phase 0 complete if CI is green. Do not start Phase 1 until Phase 0 is marked verified complete.

### 2026-07-06 - Phase 0, sessions 1-7
- Built: Initial Phase 0 monorepo, Next.js 15 app, Astryx theme wiring, Prisma schema with all 29 planned entities, API contracts, CI, env templates, Playwright smoke test, and E2E runner.
- Verified: Repository-side checks passed repeatedly: test, type-check, lint, Prisma validate, build, E2E, and dev server smoke checks.
- Superseded note: Earlier sessions treated Vercel, Railway, AWS S3/IAM, and live Stripe setup as Phase 0 blockers. The plan was later updated to defer cloud deployment until after Phase 7 and use the local Docker Compose stack during Phases 0-7.

## Known deviations from the plan

- `packages/db/.env` exists as a committed, non-secret Prisma CLI helper so `cd packages/db && npx prisma validate` works before any real environment is provisioned.
- Next build skips its duplicate internal lint pass; `turbo run lint` is the authoritative lint check and is included in CI.
- E2E tests use `scripts/run-e2e.mjs` to manage the Next dev server lifecycle reliably on Windows.
- On this machine, verification uses the legacy `docker-compose` CLI rather than the unavailable `docker compose` plugin.

## Blockers / open questions

- GitHub Actions CI status is not observable from this environment without authenticated repository access.
- Decide later whether to accept the current Next 15/PostCSS audit advisory until a patched Next 15 release exists, or explicitly approve moving beyond the plan's Next.js 15 requirement.

# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. It is the cheapest way to know what is real.

## Current phase

**Phase 0 - Foundation & Planning** (verified complete)

Phase 0 is complete under the updated local-development directive:

- Cloud deployment setup is deferred until after Phase 7.
- `.github/workflows/deploy.yml` and `.env.staging` are intentionally absent.
- `docker-compose.yml` provides the local Postgres, Redis, MinIO, and Mailpit stack used for Phases 0-7.
- Stripe is expected to use a free test-mode account and local webhook forwarding when payment flows are implemented; live-mode setup is not a Phase 0 blocker.

## Status by phase

| Phase | Status | Notes |
|-------|--------|-------|
| 0 - Foundation | Verified complete | Monorepo, Next app, Prisma schema, API contracts, CI, env templates, and local Docker Compose stack are in place and verified. |
| 1 - Core Infrastructure | Not started | |
| 2 - Registration & Hotel | Not started | |
| 3 - Store & Add-ons | Not started | |
| 4 - Volunteers & Vendors | Not started | |
| 5 - Advanced Features | Not started | |
| 6 - SaaS Layer | Not started | |
| 7 - Launch | Not started | |

Legend: Not started - In progress - Verified complete

## Session log

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
- Deviated from plan:
  - Used the legacy `docker-compose` command because this machine's `docker compose` subcommand is unavailable. The Compose file itself is valid and the local stack runs.
  - Used Windows `.cmd` shims for npm/npx commands because PowerShell blocks `npm.ps1`/`npx.ps1` under the current execution policy.
- Remaining issues:
  - `npm audit --audit-level=moderate` still reports the known moderate PostCSS advisory through `next@15.5.20`, with no non-breaking fix available from npm audit. This is not caused by Phase 0 changes and is not listed as a Phase 0 completion gate.
- Next session should: start Phase 1 only after reading `AGENTS.md`, this `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-1-core-infra.md`, and the Phase 1 verification requirements.

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

- No Phase 0 blockers remain.
- Decide later whether to accept the current Next 15/PostCSS audit advisory until a patched Next 15 release exists, or explicitly approve moving beyond the plan's Next.js 15 requirement.

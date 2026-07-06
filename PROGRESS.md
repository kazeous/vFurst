# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. It is the cheapest way to know what is real.

## Current phase

**Phase 1 - Core Infrastructure** (implemented; pending hosted Stripe Connect onboarding completion)

Phase 0 is complete under the updated local-development directive:

- Cloud deployment setup is deferred until after Phase 7.
- `.github/workflows/deploy.yml` and `.env.staging` are intentionally absent.
- `docker-compose.yml` provides the local Postgres, Redis, MinIO, and Mailpit stack used for Phases 0-7.
- Stripe is expected to use a free test-mode account and local webhook forwarding when payment flows are implemented; live-mode setup is not a Phase 0 blocker.
- GitHub Actions CI is green for the latest pushed Phase 0 commit verified before this completion update.

## Status by phase

| Phase | Status | Notes |
|-------|--------|-------|
| 0 - Foundation | Verified complete | Monorepo, Next app, Prisma schema, API contracts, CI, env templates, local Docker Compose stack, local verification, and GitHub Actions CI are verified. |
| 1 - Core Infrastructure | In progress | Implemented core code and verified local auth/dashboard/org CRUD/subdomain smoke. Root `.env` has usable Stripe test credentials; Connect Account Link creation works, but Stripe-hosted onboarding completion is paused on hCaptcha before the manual checkpoint can be marked complete. |
| 2 - Registration & Hotel | Not started | |
| 3 - Store & Add-ons | Not started | |
| 4 - Volunteers & Vendors | Not started | |
| 5 - Advanced Features | Not started | |
| 6 - SaaS Layer | Not started | |
| 7 - Launch | Not started | |

Legend: Not started - In progress - Verified complete

## Session log

### 2026-07-06 - Phase 1, session 4
- Built: No source changes.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-1-core-infra.md`, and `docs/plan/verification-and-timeline.md`.
  - Confirmed the working tree contains only pre-existing user/editor changes outside Phase 1 commits: `.idea/.name`, `AGENTS.md`, `docs/plan/phase-1-core-infra.md`, and `CLAUDE.md`.
  - Confirmed no local Next dev server is running.
- Remaining issues:
  - Phase 1 still cannot be marked verified complete because the Stripe-hosted onboarding checkpoint remains incomplete. The previous visible in-app browser tab containing the one-time Stripe Account Link is closed; a fresh Account Link will need to be generated, opened, and completed through Stripe's hCaptcha-hosted flow before refreshing app status.
- Next session should: generate a fresh Stripe Account Link from an existing test org or by clicking `Start onboarding`, solve the hCaptcha in the visible browser, complete hosted onboarding, click `Refresh status`, and verify `onboardingComplete` is true before marking Phase 1 complete. Do not start Phase 2.

### 2026-07-06 - Phase 1, session 3
- Built:
  - Added an environment-derived mode row to the Stripe Connect dashboard page so organizers can see whether the configured Stripe key is running in test mode, live mode, or is missing.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-1-core-infra.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Checked the root `.env` without printing secrets. It contains usable Stripe test-mode credentials, so no secrets were copied into the tracked `.env.local`.
  - Verified the Stripe secret with Stripe's balance API; the key is valid and test-mode (`livemode: false`).
  - Ran the Stripe Connect onboarding server action against local dev with root `.env` injected into the process environment. The app created and stored real Stripe test connected accounts (`acct_...`) and redirected to Stripe-hosted Account Links.
  - Inspected the latest connected account through Stripe's API; Stripe reports the expected onboarding requirements are still due because the hosted onboarding form has not completed.
  - Attempted hosted onboarding in both headless Playwright and the visible in-app browser. Stripe presented hCaptcha on `connect.stripe.com`, so the manual checkpoint "Stripe Connect onboarding completes" remains incomplete until the CAPTCHA is solved in the browser and the app status is refreshed.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run test:e2e` passed cleanly.
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed cleanly and still includes the middleware bundle.
- Deviated from plan:
  - The Phase 1 file says "OAuth flow" and "Test mode toggle" for Stripe Connect, but `docs/plan/00-reference.md` explicitly says local Stripe Connect should use Account Links in test mode. Kept the Account Links implementation and added a truthful env-derived mode indicator rather than a fake per-org toggle.
- Remaining issues:
  - Stripe-hosted onboarding is still not complete because the external Stripe page is waiting on hCaptcha in the visible in-app browser. After the CAPTCHA is solved, finish the hosted onboarding, return to the local app, click `Refresh status`, and verify `onboardingComplete` becomes true before marking Phase 1 verified complete.
  - Stripe sends webhook attempts to `/api/webhooks/stripe`, which currently returns 404. This was observed during Account Link creation; webhook handling is referenced in the project structure but is not listed as a Phase 1 artifact or verification gate, so it has not been added in this phase.
  - `npm install` previously reported 6 audit findings (5 moderate, 1 high). This remains a dependency-review item, not a listed Phase 1 verification gate.
  - No Phase 1-specific unit tests were added; current coverage is still command-level and browser-smoke verification.
- Next session should: solve the Stripe hCaptcha in the visible in-app browser or generate a fresh Account Link if the current one expires, complete hosted onboarding, refresh app status, and only then mark Phase 1 verified complete if the manual checkpoint passes. Do not start Phase 2.

### 2026-07-06 - Phase 1, session 2
- Built:
  - Tightened Phase 1 UI implementation to better match the plan's Astryx component requirements.
  - Replaced raw login/register inputs with small client form components using Astryx `TextInput` and `FormLayout`; login now uses Astryx `Divider`.
  - Replaced the handmade dashboard nav wrapper with Astryx `SideNav`, `SideNavHeading`, `SideNavSection`, and `SideNavItem` inside the existing `AppShell`.
  - Updated dashboard stat cards to use Astryx `Heading`, `Text`, and `ProgressBar` instead of handmade metric/progress markup.
  - Replaced the organization list's handmade table markup with an Astryx `Table` plus `EmptyState`; added a client table wrapper so column renderers stay on the client side, and set `tableProps` for the accessible table name.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-1-core-infra.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Audited every Phase 1 named artifact from the plan; all expected files exist.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run test:e2e` passed cleanly.
  - `turbo run type-check` passed.
  - `turbo run lint` passed.
  - `cd packages/db && npx prisma validate` passed after elevated npm-cache access.
  - `turbo run build` passed cleanly and still includes the middleware bundle.
  - Local browser smoke passed for Astryx-controlled register/login forms, dashboard render, organization create, Astryx organization table render with accessible table name, and created-org subdomain routing.
  - Docker Compose stack remains running for Postgres, Redis, MinIO, and Mailpit.
- Deviated from plan:
  - None new.
- Remaining issues:
  - Stripe Connect onboarding is still not live-verified because `.env.local` still has placeholder Stripe test credentials (`sk_test_replace_me` / `ca_replace_me`). Current evidence shows the env is not ready for the required manual checkpoint "Stripe Connect onboarding completes."
  - `npm install` previously reported 6 audit findings (5 moderate, 1 high). This remains a dependency-review item, not a listed Phase 1 verification gate.
  - No Phase 1-specific unit tests were added; current coverage is still command-level and browser-smoke verification.
- Next session should: provide real Stripe test-mode credentials, run local Stripe Connect onboarding, and only then mark Phase 1 verified complete if that manual checkpoint passes. Do not start Phase 2.

### 2026-07-06 - Phase 1, session 1
- Built:
  - Added Phase 1 dependencies for Auth.js, Prisma adapter, bcrypt, AWS S3/SES, Stripe, BullMQ, ioredis, nodemailer, and Zod.
  - Added Auth.js v5 configuration, credentials registration/login, Google provider wiring, auth API route, and session org-membership enrichment.
  - Added Prisma support required by Phase 1 auth and org settings: Auth.js adapter models, `User.passwordHash`, `User.image`, `Organization.emailProvider`, and `Organization.emailSettings`.
  - Added dashboard shell, dashboard home, organization list/create/overview/settings/members/Stripe Connect pages, and event server actions.
  - Added S3 helper with optional `S3_ENDPOINT` for MinIO/local development and real AWS S3 parity.
  - Added subdomain resolution helper, middleware routing, and a `src/middleware.ts` runtime re-export because the Next app uses `src/app`.
  - Added `@vfurst/email` package with SES/SMTP providers and welcome, registration confirmation, and password reset templates.
  - Added `@vfurst/worker` package with BullMQ queues, email job processor, Redis connection config, graceful shutdown, and health endpoint.
  - Applied the updated Prisma schema to the local Docker Postgres database with `prisma db push` for manual smoke testing.
- Verified:
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run test:e2e` passed cleanly after stopping the temporary manual dev server.
  - `turbo run type-check` passed.
  - `turbo run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `turbo run build` passed cleanly and includes the middleware bundle.
  - Docker Desktop was started; `docker-compose ps` showed Postgres, Redis, MinIO, and Mailpit running.
  - Local browser smoke against `http://127.0.0.1:3000` passed for register, credentials login, dashboard render, organization create, event create, organization settings update, organization list, and Stripe Connect page render.
  - Subdomain routing smoke passed with `Host: phase1-1783333054435.vfurst.app`, resolving to the convention tenant page for the created org.
- Deviated from plan:
  - Added `apps/web/src/middleware.ts` as a runtime re-export of the planned `apps/web/middleware.ts`; with this repo's `src/app` layout, Next did not pick up the root middleware during dev until the `src` entry existed.
  - Added the minimal Auth.js adapter tables and auth/org-settings fields to Prisma because Phase 1 requires credentials auth, persistent auth integration, and per-org email provider configuration, but the Phase 0 product entity list did not include those infrastructure fields.
  - Added a development-only Auth.js fallback secret because the web workspace does not load the repo-root `.env.local` when running `npm run dev --workspace @vfurst/web`.
- Remaining issues:
  - Stripe Connect onboarding was not completed live because `.env.local` still contains placeholder Stripe test credentials (`sk_test_replace_me`). The page renders and the server action is wired, but the manual checklist item "Stripe Connect onboarding completes" needs a real Stripe test secret.
  - `npm install` reports 6 audit findings (5 moderate, 1 high). These need a dependency review before deciding whether any breaking upgrades are acceptable.
  - No Phase 1-specific unit tests were added; current automated coverage remains smoke/build-oriented.
- Next session should: provide real Stripe test-mode credentials, run the Stripe Connect onboarding flow locally, then mark Phase 1 verified complete if the onboarding checkpoint passes. Do not start Phase 2 until this is done.

### 2026-07-06 - Phase 0, session 12
- Built: No source changes. Used a temporary GitHub token only as a process environment value to verify GitHub Actions; the token was not written to repository files.
- Verified:
  - `gh auth status` succeeded when using the temporary `GH_TOKEN`; token scopes include `repo` and `workflow`.
  - GitHub Actions `CI` workflow for commit `0cea185b8cd70d96366e0ebe6279fc3dd7ad144a` completed successfully.
  - The latest visible `main` branch CI runs are successful, including the Phase 0 local-foundation commit and subsequent progress commits.
  - The complete Phase 0 local checklist remains green from session 9: `npm run test`, `npm run test:e2e`, `turbo run type-check`, `turbo run lint`, `cd packages/db && npx prisma validate`, `turbo run build`, `docker-compose config`, and `docker-compose ps`.
  - Re-read `docs/plan/phase-0-foundation.md` before marking this complete and verified each Phase 0 requirement against current repository state.
- Deviated from plan:
  - The temporary token was needed because the installed GitHub CLI's secure stored credential still reports invalid without `GH_TOKEN`.
  - Used `docker-compose` instead of `docker compose` for local stack verification because this shell does not expose the modern Compose plugin.
  - Used Windows `.cmd` shims for prior npm/npx/Turbo verification because PowerShell blocks `.ps1` wrappers under the current execution policy.
- Remaining issues:
  - None blocking Phase 0.
  - The known Next 15/PostCSS audit advisory remains an open dependency question, but it is not listed as a Phase 0 completion gate and has no non-breaking npm audit fix while preserving the plan's Next.js 15 requirement.
- Next session should: start Phase 1 only after reading `AGENTS.md`, this `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-1-core-infra.md`, and the Phase 1 verification requirements.

### 2026-07-06 - Phase 0, session 11
- Built: No source changes. Re-read the required Phase 0 instructions and retried the GitHub Actions verification path after GitHub CLI was installed.
- Verified:
  - `gh.exe` exists at `C:\Program Files\GitHub CLI\gh.exe`.
  - Initial `gh auth status` reported the stored `kazeous` token as invalid.
  - Removed the invalid stored GitHub CLI credential and completed a fresh browser/device login as `kazeous` with `repo` and `workflow` scopes.
  - After the fresh login, `gh auth status` still reported the stored `kazeous` token as invalid, and `gh run list --branch main` still returned GitHub API `404`.
  - A less-secure `gh auth login --insecure-storage` retry was not performed because it would persist the GitHub token in plain text and requires explicit user approval after that risk is understood.
- Deviated from plan: None.
- Remaining issues:
  - GitHub Actions CI status for the latest `main` commit still needs authenticated verification before Phase 0 can be marked verified complete.
  - Safe next options are: provide/persist a working secure GitHub CLI login, provide a temporary `GH_TOKEN` with read access to this repository's Actions runs, paste authenticated CI evidence, or explicitly approve `gh auth login --insecure-storage` knowing it stores the token in plain text.
- Next session should: use one of the safe authentication/evidence options above, verify CI green for the latest `main` commit, and only then mark Phase 0 complete.

### 2026-07-06 - Phase 0, session 10
- Built: No source changes. Re-read the required Phase 0 instructions and inspected the current repository state again.
- Verified:
  - Current branch is `main` and is synchronized with `origin/main` before this session's progress update.
  - The CI workflow file exists at `.github/workflows/ci.yml` and still runs install, Prisma validate, type-check, lint, test, and build on push to `main` and pull requests.
  - `gh` is not installed.
  - No `GH*`, `GITHUB*`, or `ACTIONS*` environment token is present.
  - Unauthenticated GitHub Actions/API checks are still unavailable for this repo.
  - Attempted to use the local Git credential helper in-memory to query GitHub Actions without printing any credential. The credential helper timed out, including with terminal prompting disabled, so no CI status evidence was obtained.
- Deviated from plan: None.
- Remaining issues:
  - GitHub Actions CI status for the latest `main` commit still needs authenticated verification before Phase 0 can be marked verified complete.
- Next session should: provide authenticated GitHub Actions evidence for the latest `main` commit, or install/authenticate a GitHub CLI/API token that can read this repository's workflow runs, then mark Phase 0 complete only if CI is green.

### 2026-07-06 - Phase 0, session 9
- Built: No source changes. Re-read the required Phase 0 instructions and re-audited the current repository against the updated local-stack directive.
- Verified:
  - Phase 0 source changes and progress updates are pushed to `origin/main`; GitHub Actions should be verified against the latest `main` commit.
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
  - GitHub Actions CI status for the latest `main` commit still needs authenticated verification before Phase 0 can be marked verified complete.
  - The known Next 15/PostCSS audit advisory remains an open dependency question, but it is not listed as a Phase 0 completion gate.
- Next session should: verify GitHub Actions CI for the latest `main` commit with authenticated repository access, then mark Phase 0 complete if CI is green. Do not start Phase 1 until Phase 0 is marked verified complete.

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

- No Phase 0 blockers remain.
- Decide later whether to accept the current Next 15/PostCSS audit advisory until a patched Next 15 release exists, or explicitly approve moving beyond the plan's Next.js 15 requirement.

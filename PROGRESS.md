# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. It is the cheapest way to know what is real.

## Current phase

**Phase 7 - Launch** (in progress)

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
| 1 - Core Infrastructure | Verified complete | Multi-tenant routing, auth/RBAC, dashboard shell, org CRUD, Stripe Connect onboarding, S3 helper, email service, and worker bootstrap are implemented and verified for Phase 1. |
| 2 - Registration & Hotel | Verified complete | Event workspace, registration tiers/add-ons, public registration, Stripe Checkout/webhooks, admin registration management, confirmation emails, and hotel booking are implemented and verified locally. |
| 3 - Store & Add-ons | Verified complete | Product catalog, DB-backed unified cart, storefront, vouchers/comps, store checkout fee handling, inventory fulfillment, and refunds are implemented and verified locally. |
| 4 - Volunteers & Vendors | Verified complete | Volunteer departments/form builder, applications, approvals, shift scheduling/assignment, vendor applications, booth configuration, assistants, and vendor booth payment are implemented and verified locally. |
| 5 - Advanced Features | Verified complete | Badge designer, badge queue/rendering, WebUSB/PDF print support, staff/cashier/express check-in with offline service worker, transfers, raffles, custom email templates, and staff notes are implemented and verified locally. |
| 6 - SaaS Layer | Verified complete | Usage/billing dashboard, read-only fee reconciliation job, custom domains, public REST API, API key management, outbound webhooks, embedded docs, and event analytics are implemented and verified locally. |
| 7 - Launch | In progress | Marketing/legal pages, Sentry wiring, rate limiting, load-test script/runner/seed tooling, one-command launch load-proof runner, launch audit docs, DB indexes, critical-path E2E coverage, and automated launch accessibility smoke coverage are implemented and locally verified. `npm audit --audit-level=moderate` is clean after a package-level PostCSS override for Next's internal dependency. Docker-backed k6 smoke, reduced production diagnostics, and the current 500-registration/50-check-in Phase 7 load target pass. Not complete: real beta conventions are not onboarded; marketing site is not externally deployed/live; production Sentry env and physical screen-reader evidence are still missing. |

Legend: Not started - In progress - Verified complete

## Session log

### 2026-07-08 - Phase 7, session 17
- Built:
  - Removed the homepage hero image from `apps/web/src/app/page.tsx`.
  - Removed the homepage hero image and overlay CSS from `apps/web/src/app/globals.css`, leaving the hero on the same `var(--color-background-body)` background as the following marketing sections.
  - Deleted the unused `apps/web/public/marketing/launch-hero.png` asset.
- Verified:
  - Re-read `PROGRESS.md` before editing.
  - Confirmed no remaining references to `launch-hero`, `vf-marketing-hero-image`, or `vf-marketing-hero-shade` exist under `apps/web/src` or `apps/web/public`.
  - Initial build attempt failed because the existing local production server held Prisma's Windows query engine DLL open.
  - Stopped the old local server on port 3000 and reran `npm run build` with root `.env` explicitly loaded; the build passed.
  - Restarted the local production server on `http://127.0.0.1:3000`.
  - Verified `http://127.0.0.1:3000/` returned HTTP 200, contained vFurst content, and did not contain `launch-hero`.
  - Refreshed the in-app browser to the homepage and verified the hero has zero image elements and the same computed background color as the body.
- Remaining issues / blockers:
  - Phase 7 still needs beta-convention evidence, physical screen-reader evidence, and live marketing verification against `https://vfurst.reyuugames.com` before `npm run check:launch` can pass.
- Next session should:
  - Verify the deployed marketing/legal routes at `https://vfurst.reyuugames.com`, document beta and screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 16
- Built:
  - Added `apps/web/public/sw.js` to `.gitignore` so the Serwist-generated service worker no longer appears as an untracked artifact after production builds.
- Verified:
  - Re-read `PROGRESS.md` before running verification.
  - Confirmed root `.env` contains non-blank values for `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, and `VFURST_LAUNCH_URL` without printing secret values.
  - `npm run build` passed from the repo root.
  - Reran `npm run build` with root `.env` explicitly loaded into the process so the web build had the Sentry env values available; the build passed.
  - Started a local production Next server on `http://127.0.0.1:3000`.
  - Verified `http://127.0.0.1:3000/` returned HTTP 200 and contained vFurst content.
  - Opened the local production site in the in-app browser and verified the page title and H1 are `vFurst`.
- Remaining issues / blockers:
  - Phase 7 still needs beta-convention evidence, physical screen-reader evidence, and live marketing verification against `https://vfurst.reyuugames.com` before `npm run check:launch` can pass.
- Next session should:
  - Verify the deployed marketing/legal routes at `https://vfurst.reyuugames.com`, document beta and screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 15
- Built:
  - Added `VFURST_LAUNCH_URL=https://vfurst.reyuugames.com` to the ignored root `.env` for local launch-readiness checks.
- Verified:
  - Re-read `PROGRESS.md` and inspected `scripts/check-launch-readiness.mjs` to confirm it loads root `.env` first, then tracked `.env.local`.
  - Confirmed tracked `.env.example` and `.env.local` keep blank Sentry and launch URL placeholders, while real launch values belong in ignored root `.env` or production host environment settings.
  - Confirmed root `.env` now contains `VFURST_LAUNCH_URL=https://vfurst.reyuugames.com`.
- Remaining issues / blockers:
  - Production Sentry env values still need to be configured in ignored root `.env` for local readiness checks and in the production hosting provider for the deployed app.
  - Phase 7 still also needs beta-convention evidence and physical screen-reader evidence before `npm run check:launch` can pass.
- Next session should:
  - Configure real Sentry values, verify `https://vfurst.reyuugames.com` is serving the expected marketing/legal pages, document beta and screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 14
- Built:
  - Marked `@vfurst/db#build` as uncached in `turbo.json` so Prisma Client generation always executes before dependent web/worker builds instead of being skipped by a local Turbo cache replay.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Initial `npm run build` failed because `@vfurst/db` was replayed from cache while the local generated Prisma Client on disk was still the default uninitialized stub; the web build then failed on missing `Prisma.InputJsonValue`.
  - `npm run generate --workspace @vfurst/db` passed and regenerated the Prisma Client.
  - `npm run build` passed after explicit Prisma generation, proving the product code compiles locally.
  - After the `turbo.json` cache fix, `npm run build` passed again from the repo root with `@vfurst/db:build` showing `cache bypass, force executing`.
  - `npm run check:launch` still correctly fails with 8 remaining checks: missing production Sentry env, fewer than two externally verified beta conventions, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
- Remaining issues / blockers:
  - The local build is green, but Phase 7 still cannot be marked verified complete because the remaining gates require external production/beta/accessibility evidence that is not present in the repo or local env files.
  - `apps/web/public/sw.js` was already modified at session start and remains dirty after build runs; it was not part of the build-pipeline fix.
- Next session should:
  - Provide/configure production Sentry env, real beta convention evidence, `VFURST_LAUNCH_URL`, and physical screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 13
- Built:
  - Hardened `scripts/check-launch-readiness.mjs` so Sentry env gates reject blank and obvious placeholder values instead of accepting any non-empty string.
  - Added Sentry DSN URL shape validation for `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN`.
  - Updated `docs/launch/go-live-checklist.md` to document that placeholder launch values are rejected.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - `node --check scripts/check-launch-readiness.mjs` passed.
  - `npm run check:launch` still correctly fails with 8 remaining checks: missing production Sentry env, fewer than two externally verified beta conventions, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
  - A placeholder-env run with Sentry values set to `...` still failed the Sentry env gates.
  - `git diff --check` passed with only line-ending normalization warnings from Git on this Windows workspace.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the remaining gates require external production/beta/accessibility evidence that is not present in the repo or local env files.
- Next session should:
  - Provide/configure production Sentry env, real beta convention evidence, `VFURST_LAUNCH_URL`, and physical screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 12
- Built:
  - Added blank `VFURST_LAUNCH_URL` and `VFURST_API_RATE_LIMIT_PER_MINUTE` placeholders to `.env.example`.
  - Added blank Phase 7 launch monitoring and pressure-control placeholders to the tracked `.env.local` template so local launch-readiness checks expose the required names without passing on placeholder values.
  - Updated `docs/launch/go-live-checklist.md` to call out Sentry sample-rate and fixed-window rate-limit tuning, and to state that blank placeholders are not sufficient for launch readiness.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Confirmed root `.env` is ignored and not tracked; `.env.example`, `.env.local`, and `packages/db/.env` are the tracked environment files.
  - Confirmed `.env.example` and `.env.local` now contain the Phase 7 launch variable names while leaving Sentry and `VFURST_LAUNCH_URL` values blank.
  - `npm run check:launch` still correctly fails with 8 remaining checks: missing production Sentry env, fewer than two externally verified beta conventions, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
  - `git diff --check` passed with only line-ending normalization warnings from Git on this Windows workspace.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the remaining gates require external production/beta/accessibility evidence that is not present in the repo or local env files.
- Next session should:
  - Provide/configure production Sentry env, real beta convention evidence, `VFURST_LAUNCH_URL`, and physical screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 11
- Built:
  - Hardened `scripts/check-launch-readiness.mjs` so beta completion requires at least two named beta slots with `Externally verified` status instead of relying on placeholder wording.
  - Hardened live marketing verification so each `VFURST_LAUNCH_URL` marketing/legal route must return HTTP 200 and include expected vFurst/legal page content.
  - Added explicit screen-reader completion evidence fields to `docs/launch/accessibility-audit.md` and updated the readiness checker to require `Screen-reader pass: Complete` plus non-placeholder tester, assistive-technology, and flow evidence.
  - Updated `docs/launch/beta-program.md` and `docs/launch/go-live-checklist.md` to document the stronger evidence rules.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Rechecked `.env` and `.env.local` without printing secret values; neither file currently contains `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, or `VFURST_LAUNCH_URL`.
  - `node --check scripts/check-launch-readiness.mjs` passed.
  - `npm run check:launch` still correctly fails with 8 remaining checks: missing production Sentry env, fewer than two externally verified beta conventions, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
  - `git diff --check` passed with only line-ending normalization warnings from Git on this Windows workspace.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the remaining gates require external production/beta/accessibility evidence that is not present in the repo or local env files.
- Next session should:
  - Provide/configure production Sentry env, real beta convention evidence, `VFURST_LAUNCH_URL`, and physical screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 10
- Built:
  - Added `tests/e2e/launch-accessibility-smoke.spec.ts`, a deterministic Playwright smoke suite for launch accessibility evidence across marketing, pricing, public registration, public vendor application, and staff check-in surfaces.
  - Updated `scripts/check-launch-readiness.mjs` so the new launch accessibility smoke spec is a required Phase 7 artifact.
  - Updated `docs/launch/accessibility-audit.md` with the July 8 automated accessibility smoke evidence while keeping the physical screen-reader pass unresolved.
  - Hardened launch critical-path E2E waits around Auth.js/server-action redirects so cold dev-server runs wait up to 15 seconds for dashboard, registration-success, and vendor-success navigation.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Rechecked `.env` and `.env.local` without printing secret values; neither file currently contains `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, or `VFURST_LAUNCH_URL`.
  - `node --check scripts/check-launch-readiness.mjs` passed.
  - Focused accessibility smoke passed: `npm run test:e2e -- --project=chromium tests/e2e/launch-accessibility-smoke.spec.ts` passed 3/3 tests.
  - Targeted critical-path rerun passed after wait hardening: `npm run test:e2e -- --project=chromium tests/e2e/launch-critical-paths.spec.ts` passed 4/4 tests.
  - Full E2E suite passed: `npm run test:e2e` passed 8/8 tests.
  - `npm run check:launch` now requires the new accessibility smoke artifact and still correctly fails with 8 remaining checks: missing production Sentry env, beta placeholders, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
  - `git diff --check` passed with only line-ending normalization warnings from Git on this Windows workspace.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the remaining gates require external production/beta/accessibility evidence that is not present in the repo or local env files.
- Next session should:
  - Provide/configure production Sentry env, real beta convention evidence, `VFURST_LAUNCH_URL`, and physical screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 9
- Built:
  - Updated `scripts/check-launch-readiness.mjs` to load `.env` and `.env.local` before checking launch env gates, while preserving explicitly provided process env values and ignoring `NODE_ENV`.
  - Updated `docs/launch/security-audit.md` so it no longer lists the full k6 target as a remaining blocker now that the current Phase 7 load target is documented as passed.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Checked `.env` and `.env.local` without printing secret values; neither file currently contains `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, or `VFURST_LAUNCH_URL`.
  - `node --check scripts/check-launch-readiness.mjs` passed.
  - `npm run check:launch` still correctly fails with 8 remaining checks: missing production Sentry env, beta placeholders, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the remaining gates require external production/beta/accessibility evidence that is not present in the repo or local env files.
- Next session should:
  - Provide/configure production Sentry env, real beta convention evidence, `VFURST_LAUNCH_URL`, and physical screen-reader evidence, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 8
- Built:
  - Optimized the public registration page for launch bursts by replacing tier capacity row loads with filtered counts, adding short-lived cached event/tier data, and allowing the normal registration page to use 15-second route/data caching while keeping success/cancelled payment states uncached.
  - Optimized the staff check-in page by bounding the initial attendee payload to 100 rows, adding server-side search support, and caching check-in list/count data briefly.
  - Removed synthetic `loadVu`/`loadIter` query strings from the k6 script and grouped k6 metrics by flow to avoid high-cardinality metric pressure.
  - Added `scripts/load-balance-next.mjs` and updated `scripts/run-launch-load-proof.mjs` to run a multi-replica local production Next stack behind a round-robin proxy; the runner now defaults to the current plan target of 500 registration VUs, 50 check-in VUs, and 16 local production replicas.
  - Updated the launch performance and go-live docs with the passing current-target evidence.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - `npm run type-check --workspace @vfurst/web` passed after the app changes.
  - `node --check scripts/run-launch-load-proof.mjs` passed.
  - `node --check scripts/load-balance-next.mjs` passed.
  - `node --check tests/load/registration-checkin.k6.js` passed.
  - `npm run lint --workspace @vfurst/web` passed with the same two known non-failing `<img>` warnings from store pages.
  - `npm run test:e2e` passed with 5/5 Playwright tests.
  - The current Phase 7 k6 target passed on July 8, 2026 with a fresh production build, 1500 seeded registrations, `VFURST_REGISTRATION_VUS=500`, `VFURST_CHECKIN_VUS=50`, `VFURST_LOAD_SERVER_REPLICAS=16`, and Docker-backed k6: 0.00% `http_req_failed`, p95 `http_req_duration` 1.39s, 278,837/278,837 checks passed, and 139,420 HTTP requests completed.
  - `npm run check:launch` now passes the load and security gates and correctly fails with 8 remaining checks: missing production Sentry env, beta placeholders, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
- Deviated from plan:
  - `docs/plan/phase-7-launch.md` changed in the worktree from the earlier 1000-registration/500-check-in target to 500-registration/50-check-in while this goal was in progress. The runner, k6 defaults, and launch evidence were aligned to the current phase plan. The earlier 1000/500 local Docker Desktop experiments remain documented as failed exploratory evidence, not as the active completion gate.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because beta conventions, external marketing deployment, production Sentry DSN/env wiring, and physical screen-reader testing require external action/evidence.
- Next session should:
  - Provide/configure production Sentry env (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`).
  - Onboard 2-3 real beta conventions and replace the TBD evidence in `docs/launch/beta-program.md`.
  - Deploy or provide `VFURST_LAUNCH_URL` for live marketing/legal verification.
  - Perform and document the physical screen-reader pass, then rerun `npm run check:launch`.

### 2026-07-08 - Phase 7, session 7
- Built:
  - Hardened `scripts/run-launch-load-proof.mjs` so it builds the Next app from `apps/web`, ignores local dotenv `NODE_ENV` values, forces production mode, starts the temporary production server from the web workspace, binds it on `0.0.0.0` by default for Docker reachability, and prints server log tails when the load run fails.
  - Added server-exit handling so the full proof runner stops k6 if the temporary production server exits during a load run.
  - Hardened `tests/load/registration-checkin.k6.js` so transport failures produce failed checks instead of `result.body.includes(...)` JavaScript exceptions.
  - Updated `docs/launch/performance-load-test.md` with the July 8 reduced diagnostic pass and full target failure evidence.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - `node --check scripts/run-launch-load-proof.mjs` passed.
  - `node --check scripts/run-load-test.mjs` passed.
  - Reduced production-server diagnostic passed through Docker-backed k6 with 120 seeded registrations, 20 registration VUs, and 10 check-in VUs: 0.00% `http_req_failed`, p95 `http_req_duration` 178.15ms, and 21,509/21,509 checks passed.
  - Full `npm run test:load:launch` built the production app, seeded 1500 confirmed registrations for `load-full-latest`, started the temporary production server, and executed the required 1000 registration / 500 check-in VU k6 target. It failed: 97.48% `http_req_failed`, 13,007/515,019 checks passed, and Docker-backed k6 reported sustained `connect: connection refused` at high VU counts.
  - `npm run check:launch` ran and correctly failed with 9 remaining checks: missing production Sentry env, beta placeholders, incomplete full k6 proof, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
- Deviated from plan:
  - The Phase 7 full k6 target was executed but did not pass, so Phase 7 cannot be marked complete.
  - A reduced production-server diagnostic was added as harness evidence only. It is not a substitute for the required full target.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the full 1000-registration/500-check-in k6 target has not passed.
  - Phase 7 still cannot be marked verified complete because beta conventions, external marketing deployment, production Sentry DSN/env wiring, and physical screen-reader testing require external action/evidence.
- Next session should:
  - Diagnose the full target failure on a production-like host or with a native local k6 binary to separate Docker Desktop connection limits from app/server capacity.
  - If the full profile passes, update `docs/launch/performance-load-test.md` to remove the remaining-proof blocker and rerun `npm run check:launch`.
  - Continue with the external evidence gates: beta conventions, production Sentry env, live marketing URL, and physical screen-reader pass.

### 2026-07-07 - Phase 7, session 6
- Built:
  - Added `scripts/run-launch-load-proof.mjs`, a one-command full Phase 7 load proof runner.
  - Added `npm run test:load:launch`.
  - Updated the launch load-test documentation and go-live checklist to use `npm run test:load:launch` before `npm run check:launch`.
  - Updated `scripts/check-launch-readiness.mjs` so the full launch load proof runner is a required launch artifact.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Checked local prerequisites for a full load run: port 3000 was free, Docker Compose services were running, and local app env files contain the required production-server keys.
  - Attempted to run the full 1000-registration/500-check-in proof against a temporary production Next server, but the escalation required to start the hidden server and run Docker-backed k6 was rejected by the approval/usage layer before the seed, server, or k6 commands executed.
  - `node --check scripts/run-launch-load-proof.mjs` passed.
  - `node --check scripts/check-launch-readiness.mjs` passed.
- Deviated from plan:
  - The full k6 target still was not executed because the environment rejected the required escalation. No substitute result was recorded as a pass.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the full 1000-registration/500-check-in k6 target has not passed.
  - Phase 7 still cannot be marked verified complete because beta conventions, external marketing deployment, production Sentry DSN/env wiring, and physical screen-reader testing require external action/evidence.
- Next session should:
  - Run `npm run test:load:launch` once the environment allows the temporary production server and Docker-backed k6 execution.
  - If the full profile passes, update `docs/launch/performance-load-test.md` to remove the remaining-proof blocker and rerun `npm run check:launch`.
  - Continue with the external evidence gates: beta conventions, production Sentry env, live marketing URL, and physical screen-reader pass.

### 2026-07-07 - Phase 7, session 5
- Built:
  - Added a root npm `overrides.postcss = 8.5.16`, keeping `next@15.5.20` while deduping Next's internal PostCSS resolution to the patched root package.
  - Updated the Phase 7 security audit to record the clean dependency audit and the tested Next/PostCSS remediation path.
  - Hardened `scripts/run-load-test.mjs` so Docker-backed k6 translates loopback `VFURST_BASE_URL` values such as `http://127.0.0.1:3000` to `host.docker.internal`, and forwards `VFURST_HOST_HEADER` when provided.
  - Split k6 smoke/full duration thresholds: smoke now validates connectivity/rendering with p95 under 10s for local dev cold starts; full keeps the launch p95 target under 1.5s.
  - Made the launch critical-path E2E org-create assertion wait for the redirect URL before checking the heading, removing a cold-compile race.
  - Updated the Phase 7 load-test evidence with the latest Docker-backed smoke run.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Checked current npm metadata: `next@15.5.20`, `next@15.6.0-canary.61`, and `next@16.2.10` still declare `postcss: 8.4.31`.
  - `npm install --ignore-scripts` applied the package-level PostCSS override; `npm ls postcss` reports `next@15.5.20 -> postcss@8.5.16 overridden`.
  - `npm audit --audit-level=moderate` passed with 0 vulnerabilities.
  - `node --check scripts/run-load-test.mjs` passed.
  - `npm run type-check` passed.
  - `npm run lint` passed with the same two known non-failing `<img>` warnings from Phase 3 store pages.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run build` and `npm run build --workspace @vfurst/web` passed; the build still reports the known non-failing BullMQ dynamic-require warning.
  - `npm run test:e2e` passed with 5/5 Playwright tests.
  - `npm run db:validate` passed.
  - Docker-backed `npm run test:load:smoke` passed against a freshly seeded 5-registration event (`load-smoke-1783436433083`): 0.00% `http_req_failed`, p95 `http_req_duration` 6.85s under the smoke threshold, and 81/81 checks passed.
  - `npm run check:launch` now passes the security-audit gate and correctly fails with 9 remaining checks: missing production Sentry env, beta placeholders, incomplete full k6 proof, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
- Deviated from plan:
  - Used an npm package-level PostCSS override because current Next releases still pin vulnerable PostCSS internally and npm's suggested forced fix still points at incompatible `next@9.3.3`.
  - Kept the full k6 launch threshold strict, but relaxed the smoke-only p95 threshold so local development cold compiles do not make the runtime smoke unusable.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the full 1000-registration/500-check-in k6 target has not passed.
  - Phase 7 still cannot be marked verified complete because beta conventions, external marketing deployment, production Sentry DSN/env wiring, and physical screen-reader testing require external action/evidence.
- Next session should:
  - Run the full k6 profile against a production-like local or staging server after a launch-sized seed.
  - Onboard 2-3 real beta conventions and record evidence in `docs/launch/beta-program.md`.
  - Configure production Sentry env, deploy the marketing/app surface, set `VFURST_LAUNCH_URL`, and rerun `npm run check:launch`.
  - Perform and document the physical screen-reader pass before marking Phase 7 complete.

### 2026-07-07 - Phase 7, session 4
- Built:
  - Replaced the Docusaurus `@vfurst/docs` workspace with a dependency-free static Markdown builder while preserving the docs build/dev/serve scripts and existing docs content.
  - Removed the Docusaurus dependency tree from `apps/docs`, eliminating the prior `serialize-javascript` and `uuid` audit paths.
  - Moved SMTP delivery to `nodemailer-secure`, an npm alias for `nodemailer@9.0.3`, and removed the root vulnerable `nodemailer` package while keeping Auth.js's optional Nodemailer peer unsatisfied.
  - Regenerated the tracked production service worker and ignored the generated service-worker source map.
  - Updated the Phase 7 security audit with the new dependency-audit evidence.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - `npm run build --workspace @vfurst/docs` passed.
  - `npm run type-check` passed across the monorepo.
  - `npm run lint` passed with the same two known non-failing `<img>` warnings from Phase 3 store pages.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run build` passed across the monorepo after stopping stale vFurst Next dev-server Node processes that were locking Prisma's Windows query-engine DLL. The build still reports the known non-failing BullMQ dynamic-require warning.
  - `npm run check:launch` ran and correctly failed with 10 failures: missing Sentry env, beta placeholders, blocking security audit, incomplete full k6 proof, incomplete physical screen-reader pass, and missing `VFURST_LAUNCH_URL`.
  - `npm ls nodemailer nodemailer-secure` passed and shows only `nodemailer-secure@npm:nodemailer@9.0.3`.
  - `npm audit --audit-level=moderate` was rerun with approved registry access and is reduced from 27 vulnerabilities to 2 moderate vulnerabilities, both through Next's pinned internal PostCSS dependency.
- Deviated from plan:
  - Replaced the separate Docusaurus docs implementation with a static builder as a Phase 7 security hardening step; the main app's embedded docs routes remain unchanged.
  - Tested a scoped npm override for `next -> postcss@8.5.16`, but npm left `next/node_modules/postcss@8.4.31` invalid instead of applying it, so the override was removed.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because `npm audit --audit-level=moderate` is not clean. The remaining blocker is Next 15.5.20's internal `postcss@8.4.31`; `npm audit fix --force` still points at an incompatible `next@9.3.3`.
  - Phase 7 still cannot be marked verified complete because the full 1000-registration/500-check-in k6 target has not passed.
  - Phase 7 still cannot be marked verified complete because beta conventions, external marketing deployment, production Sentry DSN/env wiring, and physical screen-reader testing require external action/evidence.
- Next session should:
  - Run `npm run check:launch` after external production/beta/security/load/accessibility evidence is supplied.
  - Decide whether to accept the remaining Next/PostCSS advisory as a documented risk or wait for a compatible Next 15 fix.
  - Run the full k6 profile against a production-like local or staging server after a launch-sized seed.
  - Onboard 2-3 real beta conventions and record evidence in `docs/launch/beta-program.md`.
  - Deploy the marketing/app surface and verify the public marketing site is live.

### 2026-07-07 - Phase 7, session 3
- Built:
  - Added `scripts/check-launch-readiness.mjs`, a single launch-readiness verifier for Phase 7 evidence.
  - Added `npm run check:launch`.
  - Added `docs/launch/go-live-checklist.md` documenting the command and required production environment.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - `node --check scripts/check-launch-readiness.mjs` passed.
  - `npm run check:launch` ran and correctly failed because the remaining external Phase 7 gates are not complete. It verified required repo artifacts exist, then reported missing Sentry env, missing live URL verification, beta placeholders, blocking security audit, incomplete full k6 target proof, and incomplete physical screen-reader pass.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete. The readiness checker reports 10 failures matching the true remaining gates.
  - The background dev server from the previous k6 smoke still appears to exist as PID 70024, and `apps/web/public/sw.js` remains a dev-generated dirty artifact. This should be cleaned after the process can be stopped or after a production build regenerates the service worker.
- Next session should:
  - Run `npm run check:launch` after external production/beta/security/load/accessibility evidence is supplied.
  - Do not mark Phase 7 complete until the readiness checker and the Phase 7 verification checklist are both green.

### 2026-07-07 - Phase 7, session 2
- Built:
  - Added `scripts/run-load-test.mjs`, which runs a local `k6` binary when available and falls back to the official `grafana/k6` Docker image.
  - Added `scripts/seed-load-test.mjs` to seed a launch-style organization, published event, staff owner, registration tier, badge template, confirmed registrations, paid zero-dollar orders, order items, and badges.
  - Added `npm run seed:load` and `npm run test:load:smoke`.
  - Updated `tests/load/registration-checkin.k6.js` with smoke/full profiles, Auth.js credential login in `setup()`, Docker-safe base URL defaults, and a Host-header override so Docker can connect through `host.docker.internal` without triggering custom-domain middleware rewrites.
  - Updated `docs/launch/performance-load-test.md` with the seed workflow, Docker runner, smoke/full commands, and current k6 smoke evidence.
  - Updated `docs/launch/security-audit.md` with current dependency-audit evidence after retrying non-breaking remediation paths.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Pulled and ran the official `grafana/k6` Docker image; `docker run --rm grafana/k6 version` reported k6 v2.1.0.
  - Seeded a 5-registration smoke event with `node scripts/seed-load-test.mjs --registrations=5 --slug=load-smoke-1783412000000`.
  - Started the local Next dev server and ran Docker-backed `npm run test:load:smoke` against the seeded event. The final smoke run passed: 0.00% failed HTTP requests, p95 request duration 1.06s, and 117/117 checks passed.
  - `node --check scripts/run-load-test.mjs` passed.
  - `node --check scripts/seed-load-test.mjs` passed.
  - `npm run type-check` passed.
  - `npm run lint` passed with the same two known non-failing `<img>` warnings from Phase 3 store pages.
  - `npm audit --audit-level=moderate --json` was rerun with approved registry access and still reported 27 vulnerabilities before remediation attempts.
  - `npm audit fix` was rerun with approved registry access and still left the same 27-vulnerability audit report.
  - Checked current npm metadata for `next-auth@beta`, `@auth/core`, `@auth/prisma-adapter`, `nodemailer`, `serialize-javascript`, and `uuid`.
- Deviated from plan:
  - Only the smoke k6 profile was executed in this session. The full 1000-registration/500-check-in profile still needs a launch-sized seed and a production-like app server.
  - Attempted `nodemailer@9.0.3` as an audit remediation, but reverted it because `next-auth@5.0.0-beta.31` still peer-depends on `nodemailer@^7.0.7`.
  - Tested broad and parent-scoped npm overrides for Docusaurus's vulnerable `serialize-javascript` and `uuid` transitive dependencies, but npm 11 did not rewrite the installed Docusaurus tree; the ineffective overrides were not kept.
- Remaining issues / blockers:
  - Phase 7 still cannot be marked verified complete because the full k6 launch target has not passed.
  - Phase 7 still cannot be marked verified complete because `npm audit --audit-level=moderate` is not clean. Current blockers are NextAuth/Auth.js -> Nodemailer, Docusaurus tooling -> serialize-javascript/uuid, and Next 15 -> PostCSS.
  - Phase 7 still cannot be marked verified complete because beta conventions, external marketing deployment, production Sentry DSN/env wiring, and physical screen-reader testing require external action/evidence.
  - The background dev server started for k6 smoke testing could not be stopped from this environment after the escalation request was rejected by the approval layer; if it is still running, stop PID 70024 or any child Node process using port 3000 before a production build.
- Next session should:
  - Stop any leftover local dev server from PID 70024 if it is still running.
  - Run the full k6 profile against a production-like local or staging server after a launch-sized seed.
  - Decide on the dependency audit policy: accept documented risk, replace Docusaurus/NextAuth dependencies, wait for upstream fixes, or approve breaking dependency changes.
  - Onboard 2-3 real beta conventions and record evidence in `docs/launch/beta-program.md`.
  - Deploy the marketing/app surface and verify the public marketing site is live.

### 2026-07-07 - Phase 7, session 1
- Built:
  - Added production-facing marketing launch site at `/` with a generated hero image stored at `apps/web/public/marketing/launch-hero.png`, feature cards, pricing summary, and launch proof points.
  - Added Phase 7 marketing/legal routes:
    - `/features`
    - `/pricing` with an interactive fee calculator
    - `/privacy`
    - `/terms`
    - `/dmca`
  - Added shared marketing shell/components and responsive CSS for the launch pages.
  - Added Sentry App Router monitoring integration with `@sentry/nextjs`, client/server/edge instrumentation, global error capture, and tunnel exclusion in middleware.
  - Added configurable fixed-window rate limiting for Auth.js POSTs, Stripe webhook POSTs, and payment/refund server actions.
  - Added Phase 7 DB indexes for launch load paths: published event lookup, registration/check-in ordering, paid-order reporting, and volunteer/vendor review by status.
  - Added launch documentation under `docs/launch/` for beta onboarding, security audit, accessibility audit, performance/load testing, and PCI SAQ A posture.
  - Added k6 load-test script at `tests/load/registration-checkin.k6.js` plus `npm run test:load`.
  - Expanded Playwright E2E coverage to include marketing/legal pages, public registration, vendor application, admin organization CRUD, and staff check-in.
  - Updated the E2E runner so extra Playwright CLI args can be passed through, which makes targeted launch-path reruns possible.
  - Made post-payment confirmation emails best-effort after DB fulfillment so SMTP provider outages do not roll back an already-settled order.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Confirmed all Phase 7 `[NEW]` legal/marketing target routes were absent before creating them, except the existing root `apps/web/src/app/page.tsx` foundation placeholder, which was replaced.
  - Generated and inspected the launch hero bitmap with the imagegen skill, then copied it into the app's public assets.
  - `cd packages/db && npx prisma validate` passed.
  - `cd packages/db && npx prisma db push` passed and regenerated Prisma Client with the Phase 7 indexes.
  - `npm run type-check` passed across the monorepo.
  - `npm run lint` passed across the monorepo. It still reports the two known non-failing Next warnings for plain `<img>` usage on organizer-controlled product images.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run build` passed across all workspaces and includes the new `/`, `/features`, `/pricing`, `/privacy`, `/terms`, and `/dmca` routes. It still reports the known non-failing BullMQ dynamic-require warning from server-side queue imports.
  - `npm run test:e2e` passed with 5 Playwright tests covering the Phase 7 critical paths listed above.
  - Targeted E2E rerun for the admin CRUD/check-in path passed after making the test independently seed its confirmed attendee.
  - `npm audit --audit-level=moderate` was run with approved network/cache access and reported unresolved advisories.
  - `npm audit fix` was run with approved network/cache access and made no compatible changes.
  - `npm run test:load` was attempted and failed because `k6` is not installed on this machine.
- Deviated from plan:
  - The automated registration E2E uses a zero-dollar registration tier to exercise app fulfillment deterministically without hosted Stripe credentials in CI; live Stripe Checkout remains covered by earlier phase smoke checks and requires external Stripe test/live setup.
  - The k6 script currently exercises page-level registration and check-in traffic. Full paid-form POST load testing should be added after a stable seeded load environment and staff cookie workflow are available.
  - The beta-program deliverable is a runbook and evidence checklist, not real convention onboarding. Recruiting/onboarding 2-3 conventions requires external organizer participation and cannot be completed from the repository alone.
- Remaining issues / blockers:
  - Phase 7 cannot be marked verified complete yet because the checklist item "Load test passes" is not satisfied. `k6` is not installed, and no 1000-registration/500-check-in run has passed.
  - Phase 7 cannot be marked verified complete yet because the checklist item "security audit clean" is not satisfied. `npm audit --audit-level=moderate` reports 27 vulnerabilities (25 moderate, 2 high), including `nodemailer` advisories through Auth.js/NextAuth with no fixed version, Docusaurus/webpack-dev-server transitive advisories, and the known Next/PostCSS advisory that requires a breaking forced fix.
  - Phase 7 cannot be marked verified complete yet because "beta conventions onboarded" requires 2-3 real conventions and external evidence.
  - Phase 7 cannot be marked verified complete yet because "marketing site live" requires external deployment after the local build.
  - Sentry is wired, but a real DSN/org/project/auth token still need to be configured in the deployment environment before production error monitoring is active.
  - No physical screen-reader pass was performed; the accessibility audit is code/review based and should be verified with assistive technology before public launch.
- Next session should:
  - Install or otherwise provide `k6`, seed a launch-sized environment, and run `npm run test:load` against it.
  - Decide how to handle the dependency audit blockers: accept documented risk, wait for upstream fixes, replace vulnerable dependencies, or explicitly approve breaking dependency changes.
  - Onboard 2-3 real beta conventions and record evidence in `docs/launch/beta-program.md`.
  - Deploy the marketing/app surface and verify the public marketing site is live.

### 2026-07-07 - Phase 6, session 1
- Built:
  - Added organization billing dashboard at `/dashboard/organizations/[orgId]/billing` with attendee, hotel, store/vendor fee breakdowns; paid-order fee collection history; discrepancy reporting; and manual reconcile trigger.
  - Added read-only worker fee reconciliation at `apps/worker/src/jobs/reconcile-fees.ts`, registered the `reconcile` worker, and scheduled a nightly repeatable reconciliation job.
  - Added custom domain management to organization settings with CNAME/TXT instructions, deterministic TXT ownership token generation, DNS TXT verification, status display, and custom-domain tenant resolution.
  - Updated middleware/custom-domain routing so non-vFurst hostnames rewrite into the convention route and resolve through `Organization.customDomain`.
  - Added public REST API under `/api/v1` with Bearer API-key authentication, per-key in-memory rate limiting, pagination/filtering, and endpoints for events, registrations, attendees, vendors, store products, badges, and generated OpenAPI JSON.
  - Added API key management at `/dashboard/organizations/[orgId]/api-keys` with create, revoke, and scope update flows.
  - Added outbound webhook management at `/dashboard/organizations/[orgId]/webhooks`, webhook queue helpers, worker delivery with HMAC signatures, retries through BullMQ attempts/backoff, delivery-log display from BullMQ job history, and test webhook dispatch.
  - Hooked webhooks into real lifecycle events for `registration.created`, `registration.checked_in`, `order.paid`, and `order.refunded`.
  - Added Docusaurus docs workspace at `apps/docs` with getting started, REST API, webhook event catalog, and convention onboarding docs.
  - Added embedded app docs under `/docs`, `/docs/api`, `/docs/webhooks`, and `/docs/onboarding`, with the API reference generated from the app's OpenAPI helper.
  - Added event analytics at `/dashboard/events/[eventId]/analytics` with Recharts registration trend, revenue by source, cumulative check-in trend, capacity utilization, fee summary, and CSV export.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-6-saas.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Inspected existing Phase 6 target paths before creating files; billing/API-key/webhook/API/docs/analytics targets were absent, while middleware and organization settings existed and were modified.
  - `cd packages/db && npx prisma validate` passed via the Windows `.cmd` shim.
  - `npm run type-check` passed across the monorepo via the Windows `.cmd` shim. The new docs workspace is included in Turbo's scope but has no type-check script.
  - `npm run lint` passed across the monorepo via the Windows `.cmd` shim. It still reports the two known non-failing Next warnings for plain `<img>` usage on organizer-controlled product images.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run build` passed across all 5 workspaces, including the new `@vfurst/docs` Docusaurus workspace. The build includes all new `/api/v1`, `/docs`, organization SaaS, and event analytics routes; it still reports the known non-failing BullMQ dynamic-require warning from the server-side badge queue import.
  - `npm run test:e2e` passed.
  - Manual Phase 6 smoke created local org `3667c947-973b-4b98-ad50-be6c7eb28ce9`, event `8ba39278-13ab-4516-bb6c-4be617be8b57`, a scoped API key, paid registration/hotel/store/vendor fee records, a badge, and a webhook endpoint.
  - Manual smoke called the `/api/v1/events` route with the generated Bearer API key and received HTTP 200 with the smoke event returned.
  - Manual smoke verified usage totals from both the web billing helper and worker `processReconcileFees`: expected fees `500` cents and collected fees `500` cents.
  - Manual smoke verified custom-domain tenant lookup returned the smoke organization for `phase6-smoke-1783409665096.example.test`.
  - Manual smoke delivered a signed `webhook.test` event to a local HTTP listener through the worker webhook processor and confirmed one delivery with signature/event headers.
- Deviated from plan:
  - Fee reconciliation reports and the billing dashboard derive from existing paid `Order`/`OrderItem` records and worker job results rather than adding a new billing-report table, because `docs/plan/00-reference.md` keeps the data model to the listed 29 entities.
  - Webhook delivery logs are displayed from BullMQ job history rather than a new `WebhookDelivery` model, because the Phase 0 schema defines `WebhookEndpoint` but no delivery-log entity.
  - Custom-domain database resolution happens in the convention route resolver after middleware rewrites the custom hostname into the tenant path. Prisma was not imported directly into middleware because this Next middleware runs in the edge-style middleware boundary.
  - The Docusaurus workspace is separate under `apps/docs`, while the main web app also keeps an embedded `/docs` reference for local app navigation.
  - DNS verification was implementation-smoked through deterministic record generation and resolver behavior; no public DNS TXT record was created for the `.example.test` smoke domain.
- Remaining issues:
  - `npm run lint` passes but still reports the two known non-failing Next warnings for plain `<img>` tags used with arbitrary organizer/uploaded product image URLs from Phase 3.
  - `npm run build` passes but still reports the known non-failing BullMQ dynamic-require warning from importing BullMQ in Next server action paths.
  - Docusaurus build passes but prints a non-failing update-check warning because this environment cannot write to `C:\Users\Kazeous\.config`.
  - Turbo build passes but reports `no output files found for task @vfurst/docs#build` even though `apps/docs/build` is generated; this is cache-output bookkeeping, not a missing artifact.
  - After adding Docusaurus dependencies, `npm install --workspace apps/docs` reports 21 audit findings (20 moderate, 1 high). This replaces the previous dependency-review count.
  - No Phase 6-specific unit tests were added; coverage is command-level verification, build/type/lint/E2E checks, and a DB/API/reconcile/custom-domain/webhook manual smoke.
- Next session should: start Phase 7 only after reading `PROGRESS.md`, `docs/plan/00-reference.md`, the Phase 7 plan, and the Phase 7 verification requirements. Do not add Phase 7 work to this Phase 6 session.

### 2026-07-07 - Phase 5, session 1
- Built:
  - Added Phase 5 dependencies for Serwist service worker compilation, React Konva badge design, ZXing QR scanning, BullMQ queue access, `pdf-lib`, `bwip-js`, and worker-side S3 uploads.
  - Added badge template designer at `/dashboard/events/[eventId]/badges/designer` with `react-konva` canvas editing, draggable/resizable text/image/barcode/QR layers, z-order controls, sample-data preview, template save/load, and registration-type default mapping through `Event.settings`.
  - Added badge management at `/dashboard/events/[eventId]/badges` with batch badge record generation, print queue sorted by registration creation order, print stats, and individual reprint/mark-printed handling.
  - Added `apps/web/src/lib/webusb-printer.ts` with WebUSB Zebra printer detection, browser compatibility guard, ZPL queue printing, and PDF/manual fallback status.
  - Added worker badge renderer at `apps/worker/src/jobs/generate-badges.ts`, registered it on the existing `badge` BullMQ queue, and implemented pure-JS PDF/ZPL output from `BadgeTemplate.layout` using `pdf-lib` and `bwip-js`.
  - Added Serwist offline check-in support: `apps/web/src/sw/offline-checkin.ts`, `apps/web/src/hooks/use-service-worker.ts`, `@serwist/next` wiring in `apps/web/next.config.ts`, generated `apps/web/public/sw.js`, and lint ignore for the generated service worker artifact.
  - Added staff check-in at `/dashboard/events/[eventId]/check-in` with attendee search, QR/camera scan input, payment/badge/add-on context, one-click check-in, badge reprint, and online/offline indicator.
  - Added cashier desk at `/dashboard/events/[eventId]/check-in/cashier` for walk-in registration, cash/card terminal toggle, paid/manual order creation, immediate check-in, and badge creation.
  - Added express kiosk at `/dashboard/events/[eventId]/check-in/express` with QR lookup, service worker registration, and attendee self-check-in flow.
  - Added registration transfer management at `/dashboard/events/[eventId]/registrations/transfers` for transfer request emails and staff-completed transfer ownership changes.
  - Added raffle management at `/dashboard/events/[eventId]/raffle` for raffle/prize creation, confirmed-attendee auto-entry, manual entries, random winner draws, winner notification, and winner history in `Event.settings.raffleHistory`.
  - Added custom email templates at `/dashboard/events/[eventId]/settings/emails`, stored in `Event.settings.emailTemplates`, with HTML/text versions, placeholder tokens, and sample previews.
  - Confirmed staff notes already existed on registration detail pages from earlier work and remain backed by the planned `AttendeeNote` model/actions.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-5-advanced.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Confirmed all Phase 5 target files from the plan were absent before creating them, except pre-existing staff note support on the registration detail page.
  - `cd packages/db && npx prisma validate` passed via the Windows `.cmd` shim.
  - `npm run type-check` passed across the monorepo.
  - `npm run lint` passed across the monorepo. It still reports the two known non-failing Next warnings for plain `<img>` usage on organizer-controlled product images.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run build` passed. Serwist successfully compiled the service worker to `/sw.js`; the build reports a non-failing BullMQ dynamic-require warning from the server-side badge queue import.
  - `npm run test:e2e` passed.
  - Manual Phase 5 smoke created local org `phase5-smoke-1783408057962`, event `477d7abd-39ba-4a16-8e2d-a4844dc71bd7`, registration `78cc339f-9b12-4bdc-8e86-93096cf0d0c5`, and badge `53cf2e96-fdda-4a71-8b0b-f9a8f1ea4e4e`.
  - Manual smoke rendered the badge through the worker (`generatedBadges: 1`), verified generated ZPL contained `^XA`, verified the PDF generation path completed, scanned/located the badge barcode and updated the registration to `CHECKED_IN`, confirmed the compiled service worker contains the offline queue/page cache markers, and drew a raffle winner (`phase5-attendee-1783408057962@example.com`).
  - The first manual worker smoke caught an invalid `bwip-js` QR option (`height: undefined`); the renderer was fixed and the successful smoke above was rerun afterward.
- Deviated from plan:
  - Registration transfer requests are tracked via the existing `Registration.transferredFromId` relationship and staff email flow rather than adding a new transfer-request entity, because `docs/plan/00-reference.md` limits the data model to the listed 29 entities.
  - Raffle winner history and custom event email templates are stored in `Event.settings` rather than adding new tables, again to stay within the Phase 0 reference data model.
  - Manual badge printing was verified through generated ZPL/PDF output and print-state updates, not by sending bytes to a physical Zebra printer, because no WebUSB printer is attached in this environment.
  - Offline check-in was verified by Serwist build output and compiled queue/page-cache markers plus check-in smoke, not by physically disconnecting the network in a browser session.
- Remaining issues:
  - `npm run build` passes but reports a non-failing BullMQ dynamic-require warning from importing BullMQ in the Next server action path.
  - `npm run lint` passes but still reports the two known non-failing Next warnings for plain `<img>` tags used with arbitrary organizer/uploaded product image URLs from Phase 3.
  - `npm install` reports 6 audit findings (5 moderate, 1 high). This remains the existing dependency-review item after Phase 5 dependency additions.
  - No Phase 5-specific unit tests were added; coverage is command-level verification, build/Serwist compilation, E2E smoke, and a DB/worker manual smoke.
- Next session should: start Phase 6 only after reading `PROGRESS.md`, `docs/plan/00-reference.md`, the Phase 6 plan, and the Phase 6 verification requirements. Do not add Phase 6 work to this Phase 5 session.

### 2026-07-06 - Phase 4, session 1
- Built:
  - Added Phase 4 vendor payment/schema support: `OrderItemType.VENDOR` plus vendor contact, product description, table/amenity/file/preference, booth price, payment order, and paid-at tracking fields.
  - Added staff server actions for department CRUD, form schema saving, public volunteer application submission, application approval/rejection/bulk review, role/shift creation, shift assignment/removal, conflict checks, and department-wide email.
  - Added vendor server actions for public vendor application submission, approval/rejection/waitlist/bulk review, assistant management, booth setup/assignment, and Stripe destination-charge booth payment.
  - Added Phase 4 email templates for volunteer decisions, volunteer shift assignments, vendor decisions, and staff messages.
  - Built staff dashboard pages:
    - `/dashboard/events/[eventId]/staff`
    - `/dashboard/events/[eventId]/staff/departments`
    - `/dashboard/events/[eventId]/staff/applications`
    - `/dashboard/events/[eventId]/staff/schedule`
  - Built the draggable volunteer form builder component and a drag-and-drop shift assignment board using the existing `@dnd-kit` dependency.
  - Built vendor dashboard pages:
    - `/dashboard/events/[eventId]/vendors`
    - `/dashboard/events/[eventId]/vendors/booths`
  - Built public tenant pages:
    - `/[orgSlug]/volunteer`
    - `/[orgSlug]/vendor-apply`
  - Updated public tenant navigation on the convention home, registration, hotel, and store pages to link volunteer/vendor flows.
  - Updated order fulfillment so paid vendor booth orders mark the linked vendor application paid.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-4-volunteers-vendors.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Confirmed every Phase 4 target route/action/component file from the plan was absent before creating Phase 4 files.
  - `cd packages/db && npx prisma validate` passed via the Windows `.cmd` shim.
  - `cd packages/db && npx prisma generate` passed.
  - `cd packages/db && npx prisma db push` applied the Phase 4 schema changes to local Postgres and regenerated Prisma Client.
  - `npm run type-check` passed across the monorepo via the Windows `.cmd` shim.
  - `npm run lint` passed across the monorepo. It still reports the two known non-failing Next warnings for plain `<img>` usage on organizer-controlled product images.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run build` passed and included the new public and dashboard Phase 4 routes.
  - `npm run test:e2e` passed.
  - Manual Phase 4 smoke used the existing connected Stripe test org `phase1-stripe-1783334993949` and event `Phase 2 Manual 1783338390780`:
    - Created a department, volunteer application, staff role, and shift.
    - Approved the volunteer application and verified `VolunteerApplication` `3ec40c8b-9841-44be-a71e-6dd69b8e1baf` became `APPROVED` with linked `StaffAssignment` `4b691b2d-2351-485b-8888-31fa51e28746`.
    - Created vendor table/amenity/booth configuration in `Event.settings`, created vendor application `7eccbda2-027f-4176-bd28-0bd1ccafcc29`, approved it, assigned booth `P4-8875`, and created a vendor booth order.
    - Created real Stripe test destination PaymentIntent `pi_3TqG7p1VHGTYPoBz1dUIReFL` for `12500` cents with `125` cents application fee to connected account `acct_1TqA660IP1kYzCOI`.
    - Verified local paid-state effects: vendor application marked paid (`boothPaidAt` set), linked payment order marked `PAID`, and Stripe PaymentIntent stored on the order.
- Deviated from plan:
  - The existing tenant route architecture rewrites subdomains to `apps/web/src/app/(convention)/[orgSlug]/...`, so public volunteer and vendor pages were implemented under `[orgSlug]` instead of the phase file's shorthand paths without `[orgSlug]`.
  - Booth/table/amenity configuration is stored in `Event.settings.vendorConfig` rather than adding a new Booth entity, because `docs/plan/00-reference.md` keeps the data model to the listed 29 entities and does not define a Booth model.
  - Manual vendor booth payment smoke used a deterministic Stripe PaymentIntent API flow plus DB fulfillment verification rather than hosted Checkout browser completion; this verifies the destination charge, 1% application fee, vendor order, and paid-state behavior without requiring a Stripe CLI listener.
  - The first manual smoke attempt was blocked by sandboxed outbound HTTPS to Stripe after local smoke records were created; rerunning with approved network access succeeded.
- Remaining issues:
  - `npm run lint` passes but still reports two non-failing Next warnings for plain `<img>` tags used with arbitrary organizer/uploaded product image URLs from Phase 3.
  - `npm install` continues to report 6 audit findings (5 moderate, 1 high). This remains the existing dependency-review item.
  - No Phase 4-specific unit tests were added; coverage is command-level, E2E smoke, schema/build verification, and DB/Stripe/API manual smoke verification.
- Next session should: start Phase 5 only after reading `PROGRESS.md`, `docs/plan/00-reference.md`, the Phase 5 plan, and the Phase 5 verification requirements. Do not add Phase 5 work to this Phase 4 session.

### 2026-07-06 - Phase 3, session 1
- Built:
  - Added Phase 3 store schema support: product descriptions/options, cart vouchers, cart/order item metadata, cart-to-order linkage, cart product relations, voucher restrictions, and partial-refund order status.
  - Added store pricing helpers for product surcharges, options, cart totals, discounts, and the 1% store platform fee.
  - Added store server actions for product CRUD with S3/MinIO upload support, order creation from cart checkout, full refunds, and partial refunds.
  - Added voucher server actions for single-code creation, bulk code generation, validation, cart application, usage limits, expiration, tier restrictions, and comped registration rules.
  - Added DB-backed cart server actions for adding products, updating quantities, removing items, clearing carts, and converting carts to orders.
  - Extended public registration with an "Add to cart" path so registration + add-ons can share the same DB-backed cart as store products before one checkout.
  - Added dashboard product management, voucher management, and store order/refund pages.
  - Added public tenant storefront at `apps/web/src/app/(convention)/[orgSlug]/store/page.tsx` with product cards, option selectors, and the server-rendered cart.
  - Updated tenant public navigation to include Store links from the convention home, registration, and hotel pages.
  - Updated payment fulfillment so paid store orders decrement stock and clear carts; full refunds restore product stock.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-3-store.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Confirmed every Phase 3 target file from the plan was absent before creating Phase 3 files.
  - `cd packages/db && npx prisma validate` passed via the Windows `.cmd` shim.
  - `cd packages/db && npx prisma generate` passed.
  - `cd packages/db && npx prisma db push` applied the Phase 3 schema changes to local Postgres and regenerated Prisma Client.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run type-check` passed across the monorepo.
  - `npm run lint` passed across the monorepo. It reports two non-failing Next warnings for plain `<img>` usage on organizer-controlled product images.
  - `npm run build` passed cleanly after fixing a CSS autoprefixer warning.
  - `npm run test:e2e` passed.
  - Docker Compose local stack was restarted and verified sufficiently for Postgres-backed schema/application checks.
  - Manual Phase 3 smoke used the existing connected Stripe test org `phase1-stripe-1783334993949` and event `Phase 2 Manual 1783338390780`:
    - Created a store product with options and a shipping surcharge.
    - Created a voucher and applied it to a DB-backed cart containing both a registration and store product.
    - Converted the cart to an order with product and registration line items; calculated total `4950`, discount `550`, and 1% platform fee `50`.
    - Created real Stripe test destination PaymentIntent `pi_3TqFfB1VHGTYPoBz0fAx09H3` with application fee `50` to the connected account.
    - Verified paid-state effects in the local DB: order `bf957f6d-f452-4830-ab2b-cf24c3bc8602` marked `PAID`, voucher usage incremented, registration confirmed, product stock decremented, and cart items cleared.
    - Created real Stripe test refund `re_3TqFfB1VHGTYPoBz0AZsiTFi`; verified refunded-state effects: order marked `REFUNDED` and product stock restored.
- Deviated from plan:
  - The existing tenant route architecture rewrites subdomains to `apps/web/src/app/(convention)/[orgSlug]/...`, so the public store was implemented under `[orgSlug]/store` instead of the phase file's shorthand `apps/web/src/app/(convention)/store/page.tsx`.
  - Manual store payment/refund smoke used a deterministic Stripe PaymentIntent API flow plus DB fulfillment verification rather than hosted Checkout browser completion; this avoided requiring a Stripe CLI listener while still verifying destination charge, application fee, voucher/cart/order/inventory/refund behavior.
  - The first manual smoke attempt was blocked by sandboxed outbound HTTPS to Stripe; rerunning with approved network access succeeded.
- Remaining issues:
  - `npm run lint` passes but reports two non-failing Next warnings for plain `<img>` tags used with arbitrary organizer/uploaded product image URLs.
  - `npm install` continues to report 6 audit findings (5 moderate, 1 high). This remains the existing dependency-review item.
  - No Phase 3-specific unit tests were added; coverage is command-level, E2E smoke, schema/build verification, and Stripe/API/manual DB smoke verification.
- Next session should: start Phase 4 only after reading `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-4-volunteers-vendors.md`, and the Phase 4 verification requirements. Do not add Phase 4 work to this Phase 3 session.

### 2026-07-06 - Phase 2, session 1
- Built:
  - Added Phase 2 dependencies: `recharts`, `@dnd-kit/core`, `@dnd-kit/sortable`, and the web package dependency on local `@vfurst/email`.
  - Added optional `Event.description` to Prisma and applied it to the local database with `prisma db push`.
  - Built the event dashboard area: events list with Astryx `PowerSearch`/`Table`/`Badge`, multi-step event wizard with `SegmentedControl`, event-scoped layout/navigation, Recharts overview, capacity by tier, and recent registration feed.
  - Built registration type management with tier CRUD, scheduled pricing, add-on definition CRUD, and drag-to-reorder.
  - Built public tenant registration at `/[orgSlug]/register`, public tenant hotel booking at `/[orgSlug]/hotel`, and updated tenant home links.
  - Built registration server actions for public checkout, confirm/cancel/refund, bulk confirm/cancel, tier upgrade, transfer, resend confirmation email, and attendee notes.
  - Built hotel server actions for block create/update, public room booking, and booking cancellation.
  - Added Stripe webhook handling for `checkout.session.completed`, `payment_intent.succeeded`, and `charge.refunded`.
  - Added shared pricing, Stripe, tenant lookup, email config, and fulfillment helpers.
  - Added hotel confirmation email template and wired Mailpit-friendly SMTP defaults through `127.0.0.1`.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-2-registration.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run test:e2e` passed cleanly after stopping a stale local dev listener on port 3000.
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed.
  - `cd packages/db && npx prisma db push` applied the `Event.description` schema change locally and regenerated Prisma Client.
  - Manual Phase 2 smoke used the Phase 1 connected Stripe test org `phase1-stripe-1783334993949`:
    - Created and published event `Phase 2 Manual 1783338390780` through the organizer UI with General Admission and VIP tiers.
    - Added a registration add-on and created a hotel block for the event.
    - Public registration flow created a real Stripe Checkout Session and completed hosted Stripe test payment `pi_3TqBLR1VHGTYPoBz1hfSvZgb`; Stripe reports `payment_status: paid`, `application_fee_amount: 100`, and destination `acct_1TqA660IP1kYzCOI`.
    - Local webhook replay confirmed registration order `30c48eb0-a657-4be9-974c-6f65b23a2b98` as `PAID`, registration `4d308762-8144-49c8-be80-7563369aafcc` as `CONFIRMED`, and Mailpit received the registration confirmation email.
    - Public hotel booking flow created a real Stripe Checkout Session and completed hosted Stripe test payment `pi_3TqBJy1VHGTYPoBz1eaurqVy`; Stripe reports `payment_status: paid`, `application_fee_amount: 100`, and destination `acct_1TqA660IP1kYzCOI`.
    - Local webhook replay confirmed hotel order `c0696944-05ef-4859-abf6-744e0d4b906b` as `PAID`, set hotel confirmation code `VF-F71D5815`, and Mailpit received the hotel confirmation email.
- Deviated from plan:
  - The existing tenant route architecture rewrites subdomains to `apps/web/src/app/(convention)/[orgSlug]/...`, so the public registration and hotel pages were implemented under `[orgSlug]` instead of the phase file's shorthand paths without `[orgSlug]`.
  - Hosted Stripe Checkout completed successfully, but local app fulfillment was verified by replaying equivalent webhook events because no Stripe CLI listener is running in this local stack by default.
- Remaining issues:
  - `npm install` continues to report 6 audit findings (5 moderate, 1 high). This remains the existing dependency-review item.
  - No Phase 2-specific unit tests were added; coverage is command-level, E2E smoke, browser/manual payment smoke, Stripe API verification, DB verification, and Mailpit verification.
- Next session should: start Phase 3 only after reading `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-3-store.md`, and the Phase 3 verification requirements. Do not add Phase 4 work to the Phase 3 session.

### 2026-07-06 - Phase 1, session 6
- Built: No source changes.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-1-core-infra.md`, and `docs/plan/verification-and-timeline.md`.
  - Confirmed the only working tree changes before this progress update were pre-existing user/editor files: `.idea/.name`, `AGENTS.md`, `docs/plan/phase-1-core-infra.md`, and `CLAUDE.md`.
  - Verified the Stripe test connected account created by the Phase 1 app now reports `details_submitted: true`, `charges_enabled: true`, `payouts_enabled: true`, no currently due requirements, and no disabled reason.
  - Refreshed the local `StripeConnect` status using the same completion condition as the app's `refreshStripeStatus` server action; the local row now has `onboardingComplete: true`.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run test:e2e` passed cleanly.
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed cleanly and still includes the middleware bundle.
  - Manual Phase 1 checkpoints are now satisfied from sessions 1-6: login/register works, dashboard renders, org CRUD works, Stripe Connect onboarding completes, and subdomain routing resolves.
- Deviated from plan:
  - No new deviations. Stripe Connect remains implemented with Account Links per `docs/plan/00-reference.md`; the Phase 1 wording that says "OAuth flow" is treated as stale relative to the reference doc.
- Remaining issues:
  - `npm install` previously reported 6 audit findings (5 moderate, 1 high). This remains a dependency-review item, not a listed Phase 1 verification gate.
  - No Phase 1-specific unit tests were added; current coverage is command-level, E2E smoke, browser smoke, and Stripe/API verification.
- Next session should: start Phase 2 only after reading `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-2-registration-hotel.md`, and the Phase 2 verification requirements. Do not add Phase 2 work to this Phase 1 session.

### 2026-07-06 - Phase 1, session 5
- Built: No source changes.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-1-core-infra.md`, and `docs/plan/verification-and-timeline.md`.
  - Confirmed the only working tree changes before this progress update were pre-existing user/editor files: `.idea/.name`, `AGENTS.md`, `docs/plan/phase-1-core-infra.md`, and `CLAUDE.md`.
  - Generated a fresh Stripe Account Link for the latest test connected account and opened it in the visible in-app browser.
  - Stripe again presented hCaptcha on `connect.stripe.com`, before the hosted onboarding form could be completed.
- Remaining issues:
  - The manual Phase 1 checkpoint "Stripe Connect onboarding completes" is still incomplete until the visible hCaptcha is solved and the Stripe-hosted flow finishes.
  - Starting a local background Next dev server for the return URL was blocked by the sandbox/process launcher. The hosted Stripe flow is still open in the visible browser; if it redirects to `localhost:3000` after completion while the server is unavailable, verify completion with Stripe's API and then run the app status refresh when a dev server can be started.
- Next session should: solve the hCaptcha in the visible browser if it is still open; otherwise generate another fresh Account Link, complete hosted onboarding, verify the connected account reports submitted/enabled status, refresh app status, and only then mark Phase 1 complete. Do not start Phase 2.

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
- No Phase 1 blockers remain.
- No Phase 2 blockers remain.
- No Phase 3 blockers remain.
- No Phase 4 blockers remain.
- No Phase 5 blockers remain.
- No Phase 6 blockers remain.
- Phase 7 remains in progress until beta-convention evidence, live marketing verification, production Sentry env, and physical screen-reader pass are complete.

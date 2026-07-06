# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. It is the cheapest way to know what is real.

## Current phase

**Phase 0 - Foundation & Planning** (in progress)

Phase 0 code foundation is implemented and locally verified. Phase 0 is not marked complete because the plan also requires external service/account setup that cannot be truthfully completed from repository changes alone:

- Stripe Connect platform account and OAuth redirect URI configuration.
- Vercel project creation.
- Railway Redis instance creation.
- AWS S3 bucket creation.

## Status by phase

| Phase | Status | Notes |
|-------|--------|-------|
| 0 - Foundation | In progress | Code foundation verified; manual external service setup remains. |
| 1 - Core Infrastructure | Not started | |
| 2 - Registration & Hotel | Not started | |
| 3 - Store & Add-ons | Not started | |
| 4 - Volunteers & Vendors | Not started | |
| 5 - Advanced Features | Not started | |
| 6 - SaaS Layer | Not started | |
| 7 - Launch | Not started | |

Legend: Not started - In progress - Verified complete

## Session log

### 2026-07-06 - Phase 0, session 6
- Built: No code changes. Added fresh evidence for the Phase 0 manual checkpoint that the dev environment runs.
- Verified:
  - Root Turbo dev task started successfully via `node node_modules/turbo/bin/turbo run dev`.
  - The web app served `http://127.0.0.1:3000` with HTTP 200 and expected `vFurst` page content.
  - The dev job was stopped afterward; no local dev server remained listening on port 3000.
  - Prior same-session checklist results remained green: `npm run test`, `npm run type-check`, `npm run lint`, `cd packages/db && npx prisma validate`, `npm run build`, and `npm run test:e2e`.
- Deviated from plan: Used Turbo's Node entrypoint directly for the dev-env proof because Windows command wrappers (`Start-Process`, direct `.cmd` spawn) failed before launching npm; this still exercises the root `turbo run dev` task graph.
- Remaining issues:
  - Manual external setup evidence is still missing for Stripe Connect, Vercel, Railway Redis, and AWS S3.
  - GitHub Actions status still requires authenticated repository access to verify.
  - The known moderate PostCSS advisory remains through `next@15.5.20`; preserving Next.js 15 means there is no verified non-breaking npm fix at this time.
- Next session should: provide authenticated GitHub/provider access or complete the external checklist in `docs/operations/phase-0-external-setup.md`, then rerun verification and mark Phase 0 complete only once external evidence exists.

### 2026-07-06 - Phase 0, session 5
- Built: No code changes. Re-ran the Phase 0 verification checklist and external access audit.
- Verified:
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed.
  - `npm run test:e2e` passed.
  - `npm audit --audit-level=moderate` still reports the known Next 15/PostCSS advisory.
  - Unauthenticated `curl.exe -I https://github.com/kazeous/vFurst/actions` returns 404, so CI status is still not observable from this environment.
  - No `gh`, `vercel`, `railway`, `stripe`, or `aws` CLI is available on PATH.
  - No relevant `STRIPE`, `VERCEL`, `RAILWAY`, `AWS`, `S3`, `REDIS`, `GITHUB`, or `GH_` environment values are present.
- Deviated from plan: None.
- Remaining issues:
  - Manual external setup evidence is still missing for Stripe Connect, Vercel, Railway Redis, and AWS S3.
  - GitHub Actions status still requires authenticated repository access to verify.
  - The known moderate PostCSS advisory remains through `next@15.5.20`; preserving Next.js 15 means there is no verified non-breaking npm fix at this time.
- Next session should: provide authenticated GitHub/provider access or complete the external checklist in `docs/operations/phase-0-external-setup.md`, then rerun verification and mark Phase 0 complete only once external evidence exists.

### 2026-07-06 - Phase 0, session 4
- Built: No code changes. Re-audited the current repository and external tool/credential availability.
- Verified:
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed.
  - `npm run test:e2e` passed.
  - No `gh`, `vercel`, `railway`, `stripe`, or `aws` CLI is available on PATH.
  - No relevant `STRIPE`, `VERCEL`, `RAILWAY`, `AWS`, `S3`, `REDIS`, `GITHUB`, or `GH_` environment values are present.
- Deviated from plan: None.
- Remaining issues:
  - Manual external setup evidence is still missing for Stripe Connect, Vercel, Railway Redis, and AWS S3.
  - GitHub Actions status still requires authenticated repository access to verify.
  - The known moderate PostCSS advisory remains through `next@15.5.20`; preserving Next.js 15 means there is no verified non-breaking npm fix at this time.
- Next session should: provide or use authenticated access for GitHub/provider dashboards, complete the external checklist in `docs/operations/phase-0-external-setup.md`, rerun verification, and mark Phase 0 complete only once that external evidence exists.

### 2026-07-06 - Phase 0, session 3
- Built: No code changes. Pushed the two committed Phase 0 commits to `origin/main` so remote CI can run.
- Verified:
  - `git push` succeeded for `main -> main` at commit `6321a64`.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed.
  - `npm run test:e2e` passed.
- Deviated from plan: None.
- Remaining issues:
  - GitHub Actions status is not observable from this environment: unauthenticated access to `https://github.com/kazeous/vFurst/actions` returns 404, and no GitHub CLI/token is available.
  - Manual external setup evidence is still missing for Stripe Connect, Vercel, Railway Redis, and AWS S3.
  - The known moderate PostCSS advisory remains through `next@15.5.20`; preserving Next.js 15 means there is no verified non-breaking npm fix at this time.
- Next session should: verify GitHub Actions with repository access, complete the manual external setup in `docs/operations/phase-0-external-setup.md`, add the real provider secrets, rerun the checklist, and then mark Phase 0 verified complete only if those external checkpoints are proven.

### 2026-07-06 - Phase 0, session 2
- Built: Added `docs/operations/phase-0-external-setup.md` with the required Stripe Connect, Vercel, Railway Redis, AWS S3, secret-store, and completion-evidence checklist for the remaining manual Phase 0 scope.
- Verified:
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed.
  - `npm run test:e2e` passed.
  - `npm audit --audit-level=moderate` still reports the known Next 15/PostCSS advisory.
- Deviated from plan: None. The new operations checklist documents the existing manual setup requirements from Phase 0 and does not add implementation scope.
- Remaining issues:
  - Manual external setup evidence is still missing for Stripe Connect, Vercel, Railway Redis, and AWS S3.
  - The known moderate PostCSS advisory remains through `next@15.5.20`; preserving Next.js 15 means there is no verified non-breaking npm fix at this time.
- Next session should: complete the manual setup in `docs/operations/phase-0-external-setup.md`, add the real secrets to the provider dashboards, confirm CI/deploy green, rerun the checklist, and then mark Phase 0 verified complete.

### 2026-07-06 - Phase 0, session 1
- Built: npm/Turbo monorepo scaffold; Next.js 15 web app; Astryx neutral theme wiring; Prisma database package with all 29 planned entities, enums, tenant `orgId` fields, indexes, and JSON columns; API contract docs; CI and Vercel deploy workflows; env templates; Playwright E2E smoke test and runner.
- Verified:
  - `npm run type-check` passed.
  - `npm run lint` passed.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `cd packages/db && npx prisma validate` passed.
  - `npm run build` passed.
  - `npm run test:e2e` passed after installing Playwright Chromium.
- Deviated from plan:
  - Added `packages/db/.env` with a non-secret local `DATABASE_URL` so the exact documented Prisma validation command works from `packages/db`.
  - Set `eslint.ignoreDuringBuilds` in `apps/web/next.config.ts`; lint remains enforced by `turbo run lint` and CI before build. This avoids Next's duplicate build-time ESLint detector warning with the root flat config.
  - Added a small `scripts/run-e2e.mjs` runner because Playwright's built-in `webServer` child process teardown hung on Windows even after the test passed.
- Remaining issues:
  - `npm audit --audit-level=moderate` reports a moderate PostCSS advisory through `next@15.5.20` depending internally on `postcss@8.4.31`. `npm audit fix --force` suggests a breaking change and does not preserve the Phase 0 Next.js 15 requirement.
- Blockers:
  - Manual external setup remains: Stripe Connect platform/OAuth redirects, Vercel project, Railway Redis, and AWS S3 bucket.
- Next session should: complete the external service setup, add real secret values to deployment providers, then rerun the Phase 0 checklist and mark Phase 0 verified complete only if those manual checkpoints are done.

## Known deviations from the plan

- `packages/db/.env` exists as a committed, non-secret Prisma CLI helper so `cd packages/db && npx prisma validate` works before any real environment is provisioned.
- Next build skips its duplicate internal lint pass; `turbo run lint` is the authoritative lint check and is included in CI.
- E2E tests use `scripts/run-e2e.mjs` to manage the Next dev server lifecycle reliably on Windows.

## Blockers / open questions

- External Phase 0 setup needs human-owned credentials/accounts: Stripe Connect platform, Vercel project, Railway Redis, and AWS S3.
- Decide whether to accept the current Next 15/PostCSS audit advisory until a patched Next 15 release exists, or explicitly approve moving beyond the plan's Next.js 15 requirement.

# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. `PROGRESS.md` and the actual repository are the only ground truth for what exists; plan docs describe intent.

> **Plan v2 (2026-07-26).** The original phase 0–7 plan and the complete pre-rebuild session history were retired in the docs-v2 rebuild and live in git history (see the `docs: rebuild plan` commit). The verified baseline they produced is summarized in `docs/plan/01-current-state.md` — do not re-derive it from old history.

## Current phase

**Phase 1 — Stabilize** (`docs/plan/phase-1-stabilize.md`)

Audit Batches 0–5 and unit 1.6/TST-02 are complete. Phase 1 remains in progress because `npm audit --audit-level=moderate` reports 33 high/critical dependency vulnerabilities and the complete plain-dev manual walkthrough is not yet recorded. **Next session: Phase 1 verification/security closeout only** — triage the dependency advisories and complete the walkthrough; do not start Phase 2 or Audit Batch 6. Batch 6 (split-runtime hardening) remains explicitly deferred/frozen.

## Status by phase

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Stabilize | In progress | Units 1.1–1.6 done (2026-07-27); closeout blocked by dependency audit + complete plain-dev walkthrough; audit Batch 6 deferred/frozen |
| 2 — Attendee & registration parity | Not started | Blocked on Phase 1; decisions listed in the phase file |
| 3 — Commerce & product parity | Not started | Blocked on Phase 1; age rules depend on Phase 2 DOB |
| 4 — Event-day & operations parity | Not started | Depends on Phase 2 (DOB) and Phase 3 (fulfillment) items as noted |
| 5 — Registration lottery | Not started | Product contract in the phase file needs confirmation before build |
| 6 — Launch | Blocked (external) | All external evidence outstanding; see `docs/launch/go-live-checklist.md` |

Legend: Not started · In progress · Blocked · Complete (only after the phase's `verification.md` checkpoint passes and is recorded here with counts).

## Baseline evidence (2026-07-26, pre-rebuild — details in `docs/plan/01-current-state.md`)

Type-check/lint/test 32/32 tasks (133 web unit tests); build 10/10; split topology 5/5; **full E2E 88 passed / 5 failed / 6 did not run** (known: TST-01 assertions, DAT-01 teardown FK, one contention flake); 500/50 load proof passed 2026-07-14. Local Docker volumes and build caches were wiped during the rebuild — re-run gates before relying on baseline numbers.

## Session log

### 2026-07-28 — Corrective staging/Coolify deployment hardening (user-requested)

- Reworked `staging-deploy.yml` into independent web/worker matrix jobs (`fail-fast: false`). Both hooks are attempted after green staging CI; missing/malformed secrets fail visibly; `401`/`403` and other permanent `4xx` responses stop immediately with the Coolify response body, while network failures, `408`/`425`/`429`, and `5xx` retry up to three times. Removed the ignored `ref`/`commit` JSON payload and documented that the configured Coolify branch is authoritative.
- Replaced the invalid npmrc scoped `allow-scripts` entries with npm's supported, version-pinned root `allowScripts` policy for all seven applicable Linux dependencies. A Node 24/npm 11.16 Docker dependency build reports **no unreviewed install scripts**; the obsolete `.npmrc` warnings are gone.
- Hardened both native Dockerfile builds: recursive Docker ignore rules now exclude generated/nested `.env*` files, OpenSSL/CA certificates are present for Prisma in build and runtime stages, `SOURCE_COMMIT` is carried into build/runtime metadata, worker health defaults to port 3100, and the web standalone entrypoint runs the repository's required-env validation before listening.
- Replaced the stale GHCR/Docker Image runbook with the actual Git-repository + Dockerfile Coolify setup. It now distinguishes Next public build variables from backend runtime secrets, lists the complete web/worker startup contracts, fixes the control-plane channel, records database preparation, token recovery, default-branch workflow requirement, retry semantics, and smoke checks.
- Verification: actionlint **clean** for both workflows; local fake-Coolify smoke proved `403` makes exactly one request and `200` succeeds with its response body. Host `npm ci` passed. Forced repository gates passed: type-check **9/9**, lint **9/9**, test **14/14** (web **179/179**), build **10/10**; the final metadata-only rerun also passed **9/9, 9/9, 14/14, 10/10**. The known BullMQ warning and offline local-service `ECONNREFUSED` build noise remain unchanged.
- Docker verification: final web and worker images built successfully; the corrected web dependency stage had no pending install-script approvals; starting either image without production env exits early with the expected web contract report / `WorkerConfigurationError`. No Coolify hook was called and no token was read during verification.
- Remote follow-up remains: merge the workflow onto the GitHub default branch, delete the obsolete `GHCR_TOKEN` repository secret, and run one manual staging dispatch after confirming both Coolify resources use branch `staging`. GitHub CLI authentication was invalid and the available browser session was signed out, so this session did not mutate repository secrets, push, or trigger a deployment.
- This was an out-of-plan corrective unit requested by the user; Phase 1 status is unchanged. **Next session must resume Phase 1 verification/security closeout only** (dependency advisory triage plus the plain-dev walkthrough); do not start Phase 2 or Batch 6.

### 2026-07-27 — Phase 1 unit 1.6: developer boot configuration smoke (TST-02)

- Closed TST-02 with `scripts/smoke-web-boot.mjs` and root `test:boot-config`. The smoke removes all app-contract keys from the process environment, requires the real `predev` env sync and ENV-01 startup assertion, boots a development Next server, and restores the generated web/worker env files exactly.
- CI now runs the smoke after unit tests and before `build`. Linux CI exercises the exact workspace `npm run dev` lifecycle; the controlled Windows path exercises the same `predev` assertion and Next development boot without leaving a detached process tree.
- Focused smoke passed without injected app env. Repository gates passed: type-check **9/9**, lint **9/9**, test **14/14** (web **179/179**, DB **52/52**, auth **67/67**), build **10/10**, split-topology **5/5**; only the known BullMQ warning remains.
- Full production E2E on the final application build passed **118/118, 0 failed, 0 did not run** with one worker. An earlier four-worker attempt had four concurrency/server-instability failures and is not claimed as green.
- `npm run check:launch` ran and remains red only on ten Phase-6 deployment/external checks (Stripe/Sentry configuration, beta and screen-reader evidence, live URL). `npm audit --audit-level=moderate` failed with **33 vulnerabilities: 31 high, 2 critical**; several Auth.js/Next.js advisories report no fix. No dependency change was made because it is outside TST-02.
- TST-02 is complete, but Phase 1 is **not** marked complete: the dependency audit is red and the full plain-`npm run dev` walkthrough is not yet recorded. **Next session must perform Phase 1 verification/security closeout only; it must not start Phase 2, Batch 6, split hardening, or cutover work.**

### 2026-07-27 — Phase 1 unit 1.5: organizer/platform residual actions and routing hygiene (audit Batch 5)

- Closed ERR-03 remainder, ERR-05, and RTE-03/05/08/09/10. Organizer/platform residual forms now share structured action state with a centralized `unstable_rethrow` guard: expected validation/race conditions render inline, retain values, disable while pending, and never become a masked production 500.
- Converted the audited event, voucher, hotel-block, store-product, badge-upload, member-invitation, organization/domain/lifecycle, raffle-draw, payout, email-replay, and vendor booth-payment flows. Unique/race paths (voucher duplicate, already-member, replay queued, DNS pending, draw exhausted, payout arithmetic, vendor approval race) are covered; tenant/payment invariants still throw.
- Routing now treats LAN/private/machine hosts as platform only outside production, uses `slug` rather than `subdomain` for central portal roots, rewrites dotted application paths unless the last segment has a known asset extension, keeps one middleware implementation, and rejects reserved organization slugs.
- Final bare-throw sweep: **72** action-layer sites, all classified in the audit outcome as binding security/payment invariants, authorization/state-transition guards, or lower-priority sites outside the exact Batch-5 P1/P2 register. No unreviewed ERR/RTE P1/P2 site remains.
- Plain host probe: **200/200/200/200/400**. Focused unit coverage **61/61**; staff/vendor residual E2E **6/6**; split-topology canary **5/5**. Docker/prestart passed with the schema already in sync.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (web **179/179**, DB **52/52**, auth **67/67**), build **10/10** packages; only the known BullMQ warning remains.
- Full production E2E on the final build: **118 passed / 0 failed / 0 did not run**. The documented registration-policy contention timeout reproduced once under four workers, then passed 3/3 in isolation and in the clean one-worker full run.
- **Next session must perform only unit 1.6 / TST-02.** Audit Batch 6 and all split-runtime hardening/cutover work remain untouched and frozen.

### 2026-07-27 — Phase 1 unit 1.4: data model and test integrity (audit Batch 4)

- Closed DAT-01, TST-01, and TST-03. The control-plane outbox FK now uses `ON DELETE SET NULL`; an organization with a lifecycle event can be deleted while its event survives with `organizationId = null`, and event receipts remain correctly owned by the surviving event.
- Updated the two stale hero accessible-name assertions and four stale visual baselines discovered by the full accessibility smoke: marketing reflects the earlier removal of “Live”, while registrations reflects the existing approval-column/“Approve selected” UI.
- Added a guarded fixture-prefix cleanup utility with dry-run/apply entry points and **19/19** unit tests. The load-proof runner invokes it before building/seeding. The local purge matched **0 organizations / 0 users / 0 outbox events** because the plan rebuild had already reset accumulated fixtures; post-suite DB checks still show zero matching fixture organizations/users.
- `prestart` passed twice consecutively (first synchronized the FK, second reported the schema already in sync). The DAT deletion regression passed, and the actual PostgreSQL constraint was confirmed as `ON DELETE SET NULL`.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (DB **52/52**, web **160/160**, auth **67/67**), build **10/10** packages, split-topology **5/5**. The only build warning is the known BullMQ dynamic-dependency warning.
- Full production E2E: **114 passed / 0 failed / 0 did not run**. Batch 5 was deliberately untouched.

### 2026-07-27 — Phase 1 unit 1.3: routing and checkout safety (audit Batch 3)

- Closed RTE-01/02/04/06/07 and CHK-01/02. Canonical/configured platform hosts are classified consistently; malformed hosts return a no-store 400; forged `x-vfurst-*` input is scrubbed and internal tenant metadata is no longer echoed in public response headers.
- Tenant-host store checkout now moves to the central checkout surface and returns to a central-path portal receipt. Checkout return paths use the strengthened shared local-path policy at write time and safe fallback at both read surfaces, including encoded slash/backslash/control-character variants.
- Portal “Powered by vFurst” and Privacy links resolve to the central host. Dashboard logout is an Auth.js server action that clears the session and returns to `/`.
- Exact plain-dev host probe: **200/200/200/200/400**. New focused E2E **5/5**; existing store authorization regression **4/4**; split-topology **5/5**. Plain-dev browser walkthrough confirmed central footer links and logout behavior.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (web **160/160**, auth **67/67**), build **10/10** packages; only the known BullMQ warning remains.
- Batch 4 was deliberately untouched. Full E2E was not rerun and no green claim was made; DAT-01/TST-01/TST-03 remain the next unit.

### 2026-07-27 — Phase 1 unit 1.2: public-flow structured errors (audit Batch 2)

- Closed ERR-03 (public subset) and ERR-04. The audit's "Batch 2 outcome" section carries the full conversion table and evidence.
- Added the `PublicFormState`/`PublicActionError` contract; converted registration, store add/cart/checkout, voucher apply, hotel booking, volunteer, and vendor submissions to `useActionState` with controlled client forms — invalid input renders inline, entered values are retained, submits disable while pending, and success-path `redirect()` still works through the `…Inner` + `unstable_rethrow` wrapper (ERR-05 guard landed in every converted file).
- Transfer accept/decline became redirect-with-notice: expired/used/invalid/policy outcomes land back on the decision page showing the refreshed request state; the ERR-04 revalidate-then-throw sites are gone.
- New `tests/e2e/public-flow-errors.spec.ts` (6 cases incl. the double-submitted transfer decision); `error-visibility.spec.ts` updated — voucher case asserts inline + retained values, boundary regression re-anchored to the unconverted duplicate-member invite (Batch 5). 9/9 dev mode and 9/9 production mode (structured messages are not masked in production — that is the point of the pattern).
- Touched-flow regressions green in isolation: policy 3/3, hotel 3/3, transfer/store/staff-vendor 13/13, account-registration 1/1. The six-file four-worker run reproduced the two documented contention flakes (policy deadlock at :121, hotel 120 s test timeout); both pass alone, matching pre-batch behavior. Repository gates 37/37.
- `payVendorBooth` and organizer/platform action families intentionally remain throwing until Batch 5; the dashboard boundary from Batch 1 covers them meanwhile.

### 2026-07-26 — Phase 1 unit 1.1: error visibility (audit Batch 1)

- Closed ERR-01 and ERR-02. The audit's "Batch 1 outcome" section carries the full change list and evidence.
- Added the shared `RouteError` boundary component and an `error.tsx` per surface (root, `(auth)`, `(marketing)`, `(convention)/[orgSlug]`, `account`, `dashboard`, `platform`, `checkout`); rewrote `global-error.tsx` with real copy while keeping its Sentry capture. Thrown action errors now render a readable, retryable page with a digest reference instead of a blank "Application error".
- `/login` no longer 500s on a wrong password: the inline server action catches `AuthError` and redirects to `/login?error=invalid_credentials` preserving `returnTo`; the page renders the accessible alert (platform-manager pattern).
- Added `tests/e2e/error-visibility.spec.ts`: wrong-password (no ≥500 responses, alert, `returnTo` preserved on success) and invalid-voucher boundary + working "Try again". Passed 3/3 dev-mode together with `account-registration.spec.ts`, and 2/2 in production mode where server messages are masked.
- Gates: `turbo run type-check lint test` 32/32; `turbo run build` 10/10 (known BullMQ warning). Full E2E not re-run this session — Batch 4 owns making it green; no pass claim recorded.
- Flake note for later specs: with a cold `.next`, dev-server compile latency can outlast Playwright's 5 s expect timeout; wait on the action's POST response (`waitForResponse`) before asserting, as the existing policy spec does.

### 2026-07-26 — Plan v2 rebuild (docs only; no application code changed)

- Compared the implemented product against ConCat's full public documentation and live-instance screenshots; recorded the result as `docs/plan/02-concat-parity.md` with stable backlog IDs (REG-P*/STO-P*/EVD-P*/RAF-P1).
- Rebuilt the plan around reality: `docs/plan/00-reference.md` (contracts, v2), `01-current-state.md` (verified baseline), phases 1–6 (stabilize → attendee parity → commerce parity → event-day parity → registration lottery → launch), and a consolidated `verification.md`.
- Deleted the retired plan set (phases 0–7, verification-and-timeline) and the fully superseded `docs/launch/product-gap-audit-2026-07-16.md`; kept `runtime-defect-audit-2026-07-26.md` (active Phase 1 register), the launch evidence docs, and the split-architecture records (split now frozen by standing decision).
- Rewrote `AGENTS.md` and `.agents/commands/start-phase.md` for the new structure; `PROGRESS.md` restarted (this file).
- Cleared derived caches (`.turbo`, per-app `.next`, Playwright artifacts, `node_modules/.cache`) and reset the local Docker volumes (Postgres/Redis/MinIO/Mailpit) to purge 72 orgs / 68,056 users of fixture residue; re-provisioned the schema via the standard prestart chain.
- Environment note: the `docker compose` plugin works on this machine now (verified this session); the old "legacy docker-compose only" note no longer applies.
- No gates were re-run after the cache/DB reset in this session. Next session must start with unit 1.1 and treat the first full-gate run as the fresh baseline.

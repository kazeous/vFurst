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
| 1 - Core Infrastructure | Remediation in progress | Managed-tenant containment, the 42-model lifecycle schema, safe legacy-tenant backfill, hashed single-use invitations, separately guarded `/platform` routes, platform-only lifecycle enforcement, and audited custom-domain activation are implemented. |
| 2 - Registration & Hotel | Remediation in progress | Event/tier/add-on, registration/note/transfer, store/order, hotel block/booking, voucher-backed registration, event-day walk-in, and provider payment transitions now derive stored authority and pass cross-tenant/concurrency regressions. VND walk-in/card-terminal collection is currency-correct and atomic; standalone phase-completion evidence remains reopened. |
| 3 - Store & Add-ons | Remediation in progress | Product CRUD, organizer refunds, cart tenant integrity, voucher creation/application/fulfillment integrity, VND product/voucher inputs, and product-image validation are remediated and covered. Other add-on-adjacent action families remain. |
| 4 - Volunteers & Vendors | Remediation in progress | Staff/vendor resources now use stored-resource authorization, public applications are portal/event-bound, vendor uploads are constrained, and VND booth inputs are corrected with cross-tenant regression coverage. Remaining Phase 4 completion evidence has not been rerun as a standalone phase gate. |
| 5 - Advanced Features | Audit reopened | Badge render artifacts are persisted and exposed through PDF/WebUSB controls, print timestamps require successful/direct or explicit PDF confirmation, cashier payment/currency behavior is remediated, and raffle mutations now derive access from the stored raffle/event with enforced prize configuration and quantities. Recipient accept/decline, actual image-layer rendering, and physical printer evidence remain incomplete. |
| 6 - SaaS Layer | Audit reopened | API-key/outbound-webhook security, tenant lifecycle, custom-domain activation, global payment operations, currency-separated fee reporting, and shared Redis rate limits now use their intended tenant/control-plane boundaries. Remaining standalone Phase 6 completion evidence has not been rerun. |
| 7 - Launch | Blocked | Managed containment, resource-derived authorization, fail-closed callbacks, lifecycle/control-plane separation, payment safety, shared rate limits, and bounded Prisma pools have automated evidence. The former load-test connection exhaustion is closed, but the latest 500/50 full run still misses the latency gate at p95 1.58s; external beta/live/Sentry/SePay Sandbox/screen-reader evidence also remains open. |

Legend: Not started - In progress - Audit reopened - Blocked - Verified complete

## Session log

### 2026-07-14 - Phase 7, bound Prisma connections and rerun the 500/50 proof
- Added a production database connection contract:
  - One Prisma singleton is reused per process in every environment. Runtime URLs receive a validated `connection_limit` and `pool_timeout`; the launch default is four connections per process and a 20-second timeout.
  - Added `DIRECT_DATABASE_URL` for schema/backfill administration and routed the existing managed-tenancy/payment-lock scripts through it while retaining `DATABASE_URL` fallback for local compatibility.
  - Launch readiness now validates runtime/direct Postgres URLs, rejects a pooler-marked direct URL, and verifies `(web + worker) x connection limit` stays within the configured application budget. The load runner also checks the budget against live Postgres max/reserved capacity before build or seed.
  - Local Postgres explicitly advertises `max_connections=100`; the measured usable capacity is 97. The steady launch default is six web replicas plus one worker x pool 4 = 28 application connections, within budget 80.
- Removed load-path waste without weakening authorization or the load target:
  - Public convention shell and registration reads use 15-second cached public projections.
  - Auth.js is memoized only within a request. Its current-user query now includes membership/workspace/event data once, so dashboard and event layouts reuse the same fresh authorization snapshot instead of querying it again.
  - Check-in loads at most 25 rows and supports server-filtered search; check-in mutations already invalidate the affected paths.
  - The load script records per-flow duration trends while retaining the original overall p95 <1.5s, checks >99%, and HTTP errors <1% gates.
- Load evidence:
  - The first bounded 16-replica/pool-4 full run completed 87,437 requests with 0.00% HTTP failures and 174,871/174,871 checks; Prisma `P2037` was eliminated, while p95 remained 3.16s.
  - Topology diagnostics found six replicas to be the best local host sizing; 4, 8, and 16 processes produced lower throughput or worse tail latency on the 8-core/16-thread proof host.
  - The latest full diagnostic used 1,500 registrations, 500 registration VUs, 50 check-in VUs, six replicas, pool 2, and a 20-second timeout. It completed 123,831 HTTP requests with 0.00% failures and 247,659/247,659 checks. Registration p95 was 1.52s, check-in p95 2.49s, and overall p95 1.58s. Pool 2 was not retained: the concurrent E2E suite exposed unacceptable request queuing, so the supported default remains pool 4.
  - Connection exhaustion is therefore remediated and capacity-proofed. The launch load gate remains failed solely on the unchanged p95 <1.5s latency threshold; no pass claim was restored.
- Verified:
  - Root tests passed 88/88 web, 21/21 worker, 12/12 database, and 1/1 email tests. Repository type-check, lint, Prisma validation, production build, and `npm audit --audit-level=moderate` (0 vulnerabilities) passed.
  - Focused production-mode check-in/accessibility E2E passed 2/2 after retaining the bounded 25-row list. Full production-mode Chromium E2E passed 79/79 with four workers; expected server logs record deliberately rejected cross-tenant and validation attempts.
  - Launch readiness accepts both Postgres URLs and reports bounded database demand of 28 connections (six web + one worker, pool 4) within budget 80. It correctly remains failed on 11 gates: seven local Stripe/Sentry values, two externally verified beta conventions, the full latency proof, physical screen-reader proof, and a live launch URL.
- Remaining issues / blockers:
  - Do not deploy. Reduce registration/check-in tail latency by at least 80ms on a repeatable production-like stack and rerun the exact 500/50 full proof. External beta/live/Sentry/SePay Sandbox/screen-reader evidence, recipient transfer acceptance, badge image rendering, and physical printer proof also remain open.
- Next session should:
  - Treat tail latency as the next separately reviewable performance unit. Profile server CPU/render time and production proxy/host contention with per-flow trends, optimize the measured cause, and require a fresh full threshold-passing run before changing load evidence to passed.

### 2026-07-14 - Phase 7, share production rate limits across replicas
- Replaced process-local safety counters with one production Redis contract:
  - Added an atomic Lua fixed-window counter using Redis `INCR`, `PEXPIRE`, `PTTL`, and server `TIME`, so all web replicas consume one quota and process restart cannot reset an active window.
  - SHA-256 hashes every rate-limit subject before storage. Existing scopes remain per IP for Auth.js/provider callbacks, per presented API key for REST calls, and per user/tenant/resource identity for payment and refund actions.
  - Auth, API-key, payment, and refund controls fail closed with a retryable unavailable response/error when Redis is down. Signed, idempotent Stripe and SePay callbacks fail open while logging degraded protection so a Redis outage cannot discard settlement events.
  - Added the missing SePay webhook quota and migrated Auth.js, Stripe, public API keys, registration/hotel/cart/vendor checkout, and registration/store refund paths to the shared async counter.
- Added production configuration and regression evidence:
  - Added `ioredis` to the web workspace, documented the shared prefix and all five quota variables, and made launch readiness validate a Redis URL plus positive quotas.
  - E2E runs now pass one Redis URL and a unique counter prefix to the Next server and Playwright, preventing quota leakage between suites.
  - Unit coverage proves hashed subjects, shared quota state, and fail-open/fail-closed policies. A real-Redis Playwright test uses two independent clients and 24 concurrent increments to prove exactly one atomic quota plus TTL expiry.
  - Updated the reference, historical full-system audit, security audit, go-live checklist, and load evidence. The process-local production rate-limit finding is closed against the current inventory.
- Verified:
  - Focused shared-rate-limit and payment/webhook/API critical-path E2E passed 17/17.
  - Full production-mode Chromium E2E passed 79/79 with four workers. Expected server logs record deliberately rejected cross-tenant and validation attempts.
  - Root tests passed 88/88 web unit tests, 21/21 worker tests, 8/8 database tests, and 1/1 email test.
  - Repository-wide type-check, lint, Prisma validation, `git diff --check`, and production builds passed. The existing BullMQ dynamic-dependency build warning remains non-blocking.
  - `npm audit --audit-level=moderate` passed with zero vulnerabilities.
  - Launch readiness recognizes Redis and all five rate-limit quotas; it now correctly reports 11 failures after the load evidence update: seven local Stripe/Sentry configuration values, the externally verified two-beta-convention gate, the latest full-target load proof, physical screen-reader proof, and a live launch URL.
  - The first load rerun built and seeded 1,500 registrations but could not see Docker inside the sandbox. The approved outside-sandbox rerun reached the full 500-registration/50-check-in, 16-replica k6 profile, then failed: 94.52% HTTP errors, p95 2.88s, and 52.54% checks passed. Server evidence is Prisma `P2037` / Postgres connection exhaustion, not a rate-limit rejection. The previous July 8 pass is retained only as historical evidence.
- Remaining issues / blockers:
  - Do not deploy. The 16-replica database connection budget/pooling must be remediated and the full load target rerun. Recipient transfer acceptance, badge image rendering, physical printer proof, and external beta/live/Sentry/SePay Sandbox/screen-reader evidence also remain open.
- Next session should:
  - Treat database connection capacity as the next separately reviewable launch unit: inventory Prisma connection counts across 16 replicas, configure a bounded/pooler-compatible production contract, add readiness/operations evidence, and rerun the exact 500-registration/50-check-in load proof before restoring a pass claim.

### 2026-07-14 - Phase 7, serialize active payment attempts and provider callbacks
- Enforced one authoritative payment attempt per pending order:
  - Added a nullable unique `PaymentAttempt.activeOrderId` database lock. `PENDING` and `REVIEW` attempts hold the lock; `PAID`, `EXPIRED`, `FAILED`, and `CANCELLED` transitions release it.
  - Added a shared serializable reservation primitive. Concurrent starts for the same provider converge on one attempt, while Stripe/SePay races allow only the winning provider to proceed. Expired attempts release their lock and review attempts block all retries.
  - Added safe startup preparation/backfill scripts that add the nullable columns/enum to legacy payment tables, expire stale attempts, deterministically cancel duplicates, claim one lock per order, and create the unique indexes before normal Prisma synchronization. Greenfield databases skip preparation and let Prisma create the current schema.
  - The exact web `prestart` chain completed twice with zero expired attempts, duplicates, or new claims on the second run, proving the preparation, Prisma sync, managed-tenant backfill, and payment-lock backfill are repeatable.
- Bound checkout and settlement to the exact attempt:
  - Stripe Checkout uses the attempt UUID as its idempotency key and stores `paymentAttemptId` in Session and PaymentIntent metadata. Concurrent creators reuse the same remote session; a session that loses database authority is expired instead of being exposed.
  - Stripe return handling, Checkout Session callbacks, PaymentIntent callbacks, and SePay transactions settle only an unexpired `PENDING` attempt with the expected provider, order, amount, currency, and active lock. Paid/refund replays remain idempotent.
  - A stale callback cannot fulfill an order owned by a newer attempt. Stale provider captures, including a Stripe capture after SePay already paid, create one deduplicated `STALE_ATTEMPT` platform exception instead of changing the paid order.
  - SePay account/amount/late-payment exceptions atomically cancel any competing provider attempt, claim the order lock as `REVIEW`, and prevent further payment. Platform resolution releases the review lock or repoints the order to a remaining authoritative attempt.
  - Checkout UI/status polling prioritizes `REVIEW`, hides alternate providers while review is open, and resumes only the authoritative Stripe session. The expiry worker never releases review holds and clears locks when pending attempts expire.
- Added regression and migration evidence:
  - Database script tests cover greenfield/legacy preparation, deterministic deduplication, expiry, and lock claiming.
  - Database-backed E2E covers six concurrent same-provider starts, a mixed Stripe/SePay race, direct uniqueness enforcement, review blocking, expired-attempt rollover, stale Stripe callbacks, cross-provider double-capture exceptions, signed replay, and atomic SePay exception takeover.
  - Updated the reference model, historical audit remediation note, security audit, and go-live checklist; `PAY-01` is closed against the current repository inventory.
- Verified:
  - Full production-mode Chromium E2E passed 78/78 with four workers. Expected server logs record deliberately rejected cross-tenant and validation attempts.
  - Root tests passed 84/84 web unit tests, 21/21 worker tests, 8/8 database tests, and 1/1 email test.
  - Repository-wide type-check, lint, Prisma validation, `git diff --check`, and production builds passed. The existing BullMQ dynamic-dependency build warning remains non-blocking.
  - `npm audit --audit-level=moderate` passed with zero vulnerabilities.
  - Launch readiness correctly remains failed on 10 configuration/external gates: local Stripe and Sentry values, two externally verified beta conventions, physical screen-reader proof, and a live launch URL.
  - The required 500-registration/50-check-in load rerun seeded its isolated 1,500-registration local fixture but could not start k6 because Docker access is outside the Codex sandbox; the escalation was rejected by the environment usage limit. No load-pass claim was added. The previously documented full-target proof remains the latest load evidence.
- Remaining issues / blockers:
  - Do not deploy. Shared production rate limiting, recipient transfer acceptance, badge image rendering, physical printer proof, and external beta/live/Sentry/SePay Sandbox/screen-reader evidence remain open.
- Next session should:
  - Replace process-local auth/payment/webhook/API counters with one shared production rate-limit store, define fail-open/fail-closed behavior by route family, preserve tenant/key scopes, add multi-instance regressions, and rerun the repository gates.

### 2026-07-14 - Phase 7, make fee reporting currency-safe
- Replaced the single mixed-money fee total with one shared currency-bucket contract:
  - Added a pure database-package calculator used by both the web report and reconciliation worker, so USD cents and VND whole dong are never added together.
  - USD attendee/hotel fees remain $1.00; VND attendee/hotel fees now use the centrally configured SePay values. Store/vendor fees remain 1% inside each currency bucket.
  - Mixed registration/hotel orders allocate the collected platform fee sequentially, so one order fee cannot be counted once for each item family. Comped attendee and discrepancy counts also remain currency-scoped.
  - Reconciliation output now returns independent currency reports and identifies paid orders whose currency differs from their event instead of silently coercing them into the event currency.
- Corrected organizer and event reporting surfaces:
  - Organization billing renders an independent summary, breakdown, discrepancies, details, and fee history for each currency, with provider-neutral Stripe/central VND settlement copy.
  - Event analytics requests an event-scoped fee report rather than reusing the whole organization's report. Revenue, fee cards, and chart inputs exclude wrong-currency orders and show a review warning when mismatches exist.
  - Event overview and portfolio revenue now include only paid orders whose currency matches the immutable event currency; pending and mismatched orders no longer inflate the displayed totals.
  - Analytics CSV groups metrics by currency, labels USD as cents and VND as whole dong, includes the order currency, and emits one row per order so a platform fee is not repeated for every order item.
- Added regression evidence:
  - Added four pure calculator cases covering independent USD/VND totals, configured VND fees, non-duplicated mixed-order allocation, currency-scoped comped attendees, and empty requested buckets.
  - Added a database-backed USD/VND organizer fixture proving separate billing reports, event-scoped analytics, and currency-explicit CSV output. Updated the existing cross-tenant export suite for the new CSV contract.
- Verified:
  - Full production-mode Chromium E2E passed 72/72 with four workers. Expected server logs record deliberately rejected cross-tenant and validation attempts.
  - Root tests passed 84/84 web unit tests, 21/21 worker tests, 5/5 database tests, and 1/1 email test.
  - Repository-wide type-check, lint, Prisma validation, `git diff --check`, and production builds passed. The existing BullMQ dynamic-dependency build warning remains non-blocking.
- Remaining issues / blockers:
  - Do not deploy. Payment-attempt serialization, shared production rate limiting, recipient transfer acceptance, badge image rendering, physical printer proof, and external beta/live/Sentry/SePay Sandbox/screen-reader evidence remain open.
- Next session should:
  - Take payment-attempt serialization as the next separately reviewable payment unit: inventory concurrent checkout/attempt creation and callback transitions, enforce one authoritative active attempt/order transition under races, add provider and replay regressions, and rerun the repository gates.

### 2026-07-14 - Phase 7, separate domain activation, global payments, and managed acquisition
- Completed the domain control-plane boundary:
  - Organizer organization settings now only submit `requestedCustomDomain`, display platform-owned request/activation state, and show the required CNAME/TXT records. The organizer DNS-check action and activation controls were removed.
  - Added `/platform/domains` with pending-request inventory, DNS ownership verification, active-tenant-only routing activation, duplicate-domain protection, serialized stale-state checks, and verified/activated actor timestamps.
  - Fixed the existing custom-host resolver defect that rejected dotted hostnames after middleware rewrite. Portal navigation now distinguishes platform paths from managed subdomains/custom hosts, and paid public flows move to the canonical platform checkout while preserving functional return paths.
- Completed the payment control-plane boundary:
  - Added `/platform/payments` for global Stripe/SePay enablement, central SePay account/fee settings, payment-exception resolution, manual SePay refund records, open organizer settlement, recent payouts, and the global payout CSV.
  - Removed all global payment queries, forms, and conditional platform-admin rendering from `/dashboard/settings`; that page is now membership-scoped organization/event navigation only.
  - Payment actions revalidate and return to `/platform/payments`. The canonical payout export moved to `/platform/payments/payouts/export`; the guarded legacy dashboard URL redirects platform administrators and remains unavailable to organizers.
  - Organizer Stripe Connect onboarding, payout-bank details, tenant billing/reconciliation, and tenant-scoped operational refunds remain in their organizer routes.
- Aligned acquisition with managed tenancy:
  - Replaced self-service “start organizing/create your workspace” marketing promises with managed-access CTAs and added `/request-access` with a configurable sales contact.
  - Public registration now states that it creates an attendee identity only; organization access comes from a platform-issued owner invitation.
  - Reviewed and intentionally updated the desktop/mobile marketing visual baselines for the managed-onboarding copy.
- Added regression evidence:
  - Added a serial organizer/platform E2E suite proving request-only domain behavior, organizer denial from domain/payment/export controls, platform navigation and activation ownership, activation audit persistence, custom-host root/registration routing, and the platform payout export.
  - Added four unit cases for platform-path, managed-subdomain, exact custom-domain, and lookalike-host portal roots. Updated launch, export, marketing, and visual assertions to the separated surface contract.
  - Reverified signed SePay fulfillment and signed Stripe completion/refund settlement while providers or tenants are disabled; moving the administration UI did not weaken existing callback completion.
- Verified:
  - Full production-mode Chromium E2E passed 70/70 with four workers. Expected server logs record deliberately rejected cross-tenant and validation attempts.
  - Root tests passed 84/84 web unit tests, 21/21 worker tests, 1/1 database backfill test, and 1/1 email test.
  - Repository-wide type-check, lint, Prisma validation, `git diff --check`, and production builds passed. The existing BullMQ dynamic-dependency build warning remains non-blocking.
  - `npm audit --audit-level=moderate` passed with zero vulnerabilities.
- Remaining issues / blockers:
  - Do not deploy. Mixed-currency fee reporting, payment-attempt serialization, shared production rate limiting, recipient transfer acceptance, badge image rendering, physical printer proof, and external beta/live/Sentry/SePay Sandbox/screen-reader evidence remain open.
- Next session should:
  - Take mixed-currency fee/reporting correctness as the next separately reviewable payment unit: inventory every aggregate/export/chart that combines money, group and label values by currency without adding unlike units, add USD/VND regression fixtures, and rerun the repository gates. Keep payment-attempt serialization as the following logical unit.

### 2026-07-14 - Phase 7, separate the platform control plane and enforce tenant lifecycle
- Separated platform operations from organizer workspaces:
  - Added a `PLATFORM_ADMIN`-only `/platform` shell with overview, tenant inventory, provisioning, tenant detail, owner-invitation retry, and lifecycle controls. Provisioning now lands on the new platform tenant detail instead of the organizer dashboard.
  - Moved the all-tenant organization list/create experience out of `/dashboard`. Guarded legacy list/create URLs redirect platform admins to the control plane and remain `404` for organizers.
  - `/dashboard` now requires at least one real organization membership. A platform admin with no membership is redirected to `/platform`; a public account receives `404`; a platform admin who separately holds an organizer membership may still enter only that membership-scoped workspace.
  - Removed the global organization inventory link from the organizer navigation, changed the organization switcher fallback to the dashboard, and added a clear platform link only for platform admins.
- Implemented auditable, non-destructive lifecycle transitions:
  - Added one lifecycle policy for `PROVISIONING -> ACTIVE/RETIRED`, `ACTIVE -> SUSPENDED/RETIRED`, `SUSPENDED -> ACTIVE/RETIRED`, and terminal `RETIRED`.
  - Activation requires at least one accepted `OWNER` membership. Platform mutations use serializable transactions, compare the previous state to prevent stale updates, and record the platform actor/timestamp.
  - Tenant detail shows retained owner/member/event/registration/order inventory, the current lifecycle state, the last actor, and the valid next transitions. Retirement changes state only and deletes no tenant records.
- Enforced lifecycle state at server boundaries:
  - Organizer mutation guards now require an `ACTIVE` organization while organization/event pages remain readable with a suspended/provisioning/retired warning. Event creation lists only active memberships.
  - Public tenant resolution, custom-host routing, registrations, hotel bookings, carts, vouchers, Stripe Connect onboarding, and new payment-attempt starts require an active organization. REST API keys return a controlled `403 organization_inactive` for inactive tenants.
  - Explicit safety/settlement exceptions remain usable while inactive: signed Stripe/SePay callbacks, existing checkout/status reads, fee reconciliation, organizer refunds, invitation/member revocation, and API-key/webhook deletion. Signed Stripe completion and refund callbacks were reverified after the tenant itself was suspended.
- Added regression evidence:
  - Added pure lifecycle tests for transition allowlists, owner-required activation, active-state assertion, and terminal retirement.
  - Added three database-backed platform lifecycle E2E cases covering ownerless activation denial, suspension of portal/API/new activity, readable organizer data and reconciliation during suspension, reactivation, terminal retirement, and exact record-count preservation.
  - Updated all established E2E tenant fixtures to opt into `ACTIVE`, migrated provisioning expectations to `/platform`, and expanded persona/legacy-route tests for platform admin, owner, member, and public accounts.
- Verified:
  - Full production-mode Chromium E2E passed 68/68 with four workers. Expected server logs record deliberately rejected cross-tenant and validation attempts.
  - Root tests passed 80/80 web unit tests, 21/21 worker tests, 1/1 database backfill test, and 1/1 email test.
  - Repository-wide type-check, lint, Prisma validation, `git diff --check`, and production builds passed. The existing BullMQ dynamic-dependency build warning remains non-blocking.
- Remaining issues / blockers:
  - Do not deploy. Platform custom-domain verification/activation and global payment/refund/payout/exception surfaces still need to move behind the control-plane boundary.
  - Mixed-currency reporting, payment-attempt serialization, shared production rate limiting, recipient transfer acceptance, badge image rendering, physical printer proof, and external beta/live/Sentry/SePay Sandbox/screen-reader evidence remain open.
- Next session should:
  - Implement the domain/payment boundary unit: keep organizer custom-domain changes request-only, add platform verification/activation and audit controls, move global payment configuration/refund/payout/exception operations out of `/dashboard`, and add organizer/platform persona regressions. Keep mixed-currency reporting and payment-attempt serialization as separately reviewable follow-ups.

### 2026-07-14 - Phase 7, add managed organization lifecycle schema and invitation onboarding
- Reached the managed-provisioning 42-model target without deleting existing tenant data:
  - Added `OrganizationStatus` (`PROVISIONING`, `ACTIVE`, `SUSPENDED`, `RETIRED`), lifecycle actor/timestamp fields, staged custom-domain request/status/audit fields, and the `OrgInvitation` model with normalized email, requested role, unique SHA-256 token hash, inviter, expiry, acceptance, and revocation state.
  - New organizations default to `PROVISIONING`. The provisioning action explicitly records the platform administrator and creates a time-limited owner invitation transactionally; it no longer grants the platform operator an implicit `OrgMember`.
  - Added an idempotent startup backfill after Prisma schema synchronization. It activated 31 legacy local organizations whose lifecycle marker was null, preserved one already-routed custom domain as active, and returned 0/0 on repeat execution. Explicitly provisioned tenants retain their `PROVISIONING` marker.
  - Existing users, memberships, registrations, events, orders, and settlement records were preserved. The additive schema applied locally without `--accept-data-loss`.
- Replaced direct membership grants with real invitation onboarding:
  - Owner/admin member invitations no longer upsert a bare `User` or create/update `OrgMember`. Raw 256-bit tokens are emailed once; only their SHA-256 hashes are stored.
  - Acceptance requires an authenticated account with the exact normalized recipient email and atomically claims the unexpired/unrevoked token before creating one membership. Accepted, revoked, expired, wrong-email, suspended/retired-tenant, and replay cases fail safely.
  - Added pending-invitation visibility and revocation. Organization admins cannot invite or revoke owner invitations; owners retain that authority.
  - Added a public invitation page plus safe login/register return paths. Public registration remains an identity-only flow and grants no organizer access.
  - Invitation email rendering escapes HTML and removes header newlines. Delivery failure revokes the unusable invitation and does not grant membership.
- Staged the custom-domain boundary for the later platform control-plane unit:
  - Organizer settings now write `requestedCustomDomain` and show request/active state; they no longer write the active routed `customDomain` field.
  - DNS checking reads the stored request rather than a submitted hostname. Platform verification/activation UI remains intentionally separate work.
- Added regression evidence:
  - Added pure tests for token entropy/hash behavior, normalization, invitation state, safe auth return paths, backfill predicates, and escaped invitation email output.
  - Added seven database-backed E2E cases covering public inspection without membership, wrong-email denial, expiry, revocation, hash-only member invites, atomic acceptance/replay prevention, and platform provisioning without implicit membership.
  - Updated the previous organization CRUD critical-path expectation to the managed provisioning contract.
- Verified:
  - Local Prisma schema synchronized successfully and the exact web `prestart` hook completed with an idempotent 0/0 repeat backfill; Prisma validates and the schema contains 42 models.
  - Full production-mode Chromium E2E passed 65/65 with four workers. Expected server logs record deliberately rejected cross-tenant and validation attempts.
  - Root tests passed 77/77 web unit tests, 21/21 worker tests, 1/1 database backfill test, and 1/1 email test; repository-wide type-check, lint, Prisma validation, `git diff --check`, script syntax checks, docs/worker/web production builds, and `npm audit --audit-level=moderate` passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
  - Launch readiness still fails 11 expected environment/external/open-audit gates: Stripe/Sentry/live URL configuration, two verified beta conventions, security-audit closure, and physical screen-reader evidence.
- Remaining issues / blockers:
  - Do not deploy. `/platform/*` separation, platform-only lifecycle transitions, and suspension/retirement enforcement remain required before the managed tenant boundary is complete.
  - Platform custom-domain verification/activation, global payment surface separation, mixed-currency reporting, payment-attempt serialization, shared production rate limiting, recipient transfer acceptance, badge image rendering, physical printer proof, and external launch evidence remain open.
- Next session should:
  - Implement the separately guarded `/platform/*` control plane and migrate all-tenant provisioning/inventory plus organization lifecycle transitions into it. Keep `/dashboard/*` membership-only, enforce lifecycle state for new tenant activity while preserving signed callbacks/reconciliation/refunds/settlement, and add legacy-route/persona regressions. Keep domain/payment boundary migration as its following logical unit.

### 2026-07-14 - Phase 7, make Stripe inbound webhooks fail closed
- Remediated the `SEC-03` P0 webhook path:
  - Removed the unsigned JSON fallback from the Stripe route. The handler now processes only the exact raw request body returned by Stripe SDK signature verification.
  - Missing, malformed, padded, short, or public placeholder webhook secrets fail closed with `503`; missing signatures and invalid, stale, or raw-body-mismatched signatures return controlled `400` responses before fulfillment code runs.
  - The route no longer returns internal processing messages to callers. Processing failures are logged server-side and return a generic `500` response.
  - Signed `checkout.session.completed`, `payment_intent.succeeded`, and `charge.refunded` callbacks remain independent of new-checkout provider enablement and reuse the existing idempotent paid/refund transitions. This preserves safe settlement of already-created orders after Stripe is disabled.
- Hardened configuration and launch evidence:
  - The E2E runner supplies one explicit Stripe test key/signing secret to both the Next.js server and Playwright process, without adding a runtime signature bypass.
  - Launch readiness now requires non-placeholder Stripe secret-key and webhook-signing values and requires the Stripe webhook security spec artifact. Empty process values may fall back to dotenv values, while explicit non-empty values retain precedence.
  - Updated the security audit, PCI SAQ A notes, and go-live checklist to record fail-closed signatures, provider-disabled settlement, current remediations, and the remaining launch blockers.
- Added regression evidence:
  - Added ten unit cases covering missing/placeholder/short/padded secrets, missing/invalid/stale signatures, raw-body mismatch, and a valid signed event.
  - Added three database-backed E2E cases proving unsigned/forged/stale events leave pending orders untouched, signed Checkout/PaymentIntent events settle once while Stripe is disabled, and signed refunds reverse idempotently while disabled.
  - The default local readiness run correctly rejects the placeholder Stripe values currently present in `.env.local`. A process-isolated run with the valid local test values passes both Stripe checks while still failing the nine unrelated/external launch gates.
- Verified:
  - Focused Stripe webhook E2E passed 3/3 in development mode.
  - Full production-mode Chromium E2E passed 58/58 with four workers; expected server logs record deliberately rejected authorization and validation attempts.
  - Root tests passed 73/73 web unit tests and 21/21 worker tests; repository-wide type-check, lint, Prisma validation, `git diff --check`, script syntax checks, docs build, worker build, and production web build passed.
  - `npm audit --audit-level=moderate` passed with zero vulnerabilities. The existing BullMQ dynamic-dependency build warning remains non-blocking.
- Remaining issues / blockers:
  - Do not deploy. The full security/launch gate remains blocked by organization lifecycle/invitations, `/platform` surface separation, mixed-currency fee reporting, payment-attempt serialization, shared production rate limiting, and external launch evidence.
  - `.env.local` still contains placeholder Stripe values; real local forwarding requires replacing them with the active Stripe CLI/test-mode values. No secret file was changed in this unit.
  - Domain/payment surface boundaries, the 42-model target schema, recipient transfer acceptance, badge image rendering, physical printer proof, and external webhook consumer verification remain later units.
- Next session should:
  - Start the lifecycle/invitation implementation order with an actual-schema inventory, additive `Organization.status`/domain lifecycle fields plus `OrgInvitation`, a safe existing-tenant backfill, and hashed invitation primitives/tests. Keep `/platform` route migration as a separately reviewable unit.

### 2026-07-14 - Phase 7, secure exports and close the current resource-action sweep
- Completed the final current-inventory `SEC-02` sweep:
  - Registration and analytics CSV routes now authorize the stored event independently of dashboard layouts. Unrelated owners, ordinary members, public users, and platform admins without organizer membership receive a controlled denial instead of event data.
  - Registration rows require matching registration, tier, event, and organization relationships. Analytics rows apply the same registration checks and require orders/items to match the authorized event organization, excluding internally poisoned cross-tenant relationships.
  - The global open-ledger export remains platform-only and now uses the controlled platform page guard, so organizer accounts cannot turn the route into a server error or read settlement data.
  - Added a shared CSV serializer with spreadsheet-formula neutralization for user-controlled strings, quote escaping, CRLF rows, safe filenames, `private, no-store`, and `nosniff` response headers. Registration, analytics, and payout exports use the shared implementation.
  - Found and remediated the remaining hidden-tenant mutation in email templates: the action now authorizes the stored event ID, reloads it with the derived organization constraint, and no longer accepts a hidden organization ID.
  - Re-inventoried remaining organization-scoped actions and upload paths. The remaining `orgId` authorization helpers operate on that same organization resource (Stripe Connect, organization/domain settings, and fee reconciliation), while branding, product, and vendor uploads are already event/resource-bound and policy-constrained. No additional cross-resource hidden-tenant mutation was found, so `SEC-02` is closed against the current repository inventory.
- Added regression evidence:
  - Added a serial Org A/Org B export suite covering public redirects, owner/admin access, ordinary-member denial, cross-tenant direct URLs, platform-admin settlement access without implicit organizer membership, formula neutralization, no-store headers, and exclusion of deliberately poisoned registration/order relationships.
  - Added a tampered email-template action case proving an Org A owner cannot overwrite Event B after changing the submitted event ID.
  - Added nine unit cases for dangerous spreadsheet prefixes, negative numeric preservation, quote escaping, and CRLF serialization.
- Verified:
  - Focused export/action E2E passed 5/5 in development mode.
  - Full production-mode Chromium E2E passed 55/55 with four workers; expected server logs record deliberately rejected cross-tenant mutations.
  - Root tests passed 63/63 web unit tests and 21/21 worker tests; repository-wide type-check, lint, Prisma validation, `git diff --check`, docs build, worker build, and production web build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
- Remaining issues / blockers:
  - `SEC-03` unsigned inbound Stripe webhook handling remains the next P0 blocker; do not deploy.
  - Production API/auth/payment rate limits remain process-local, and the external webhook delivery/consumer checkpoint remains incomplete.
  - Invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, mixed-currency reporting, payment-attempt serialization, the 42-model target schema, recipient transfer acceptance, badge image rendering, physical printer proof, and external Phase 7 gates remain later units.
- Next session should:
  - Remediate and verify inbound Stripe webhook handling as a fail-closed, signature-required `SEC-03` unit. Keep invitations/schema and surface migration as separate logical units.

### 2026-07-14 - Phase 7, secure API keys and outbound webhook delivery
- Remediated the API-key/outbound-webhook `SEC-02` family and the outbound SSRF/integrity follow-up:
  - Added shared API-key and webhook-endpoint guards. Scope update/revoke and endpoint update/delete/test operations now authorize the stored key or endpoint and derive the organization from it; resource-targeted forms no longer submit an organization ID.
  - Creation remains explicitly organization-scoped and membership-guarded. API key and generated webhook signing secret disclosure moved from query strings into one-time client action state, so raw credentials are not written to route URLs, while the database continues to retain only the API-key hash.
  - Webhook creation/update requires a public HTTPS DNS hostname, rejects URL credentials, IP literals, localhost/private suffixes, and fragments, and requires stronger user-supplied signing secrets. Embedded and external webhook docs now record the one-time credential and delivery-verification contracts.
  - Domain events now fan out into one durable job per active subscribed endpoint. Each job receives a unique delivery ID and creation timestamp that remain stable across BullMQ retries, avoiding one failed endpoint replaying earlier successful endpoints and giving consumers a reliable deduplication key.
  - The worker reloads exactly one endpoint by stored endpoint/organization before delivery. Normal jobs recheck active/subscription state; an explicitly authorized `webhook.test` may exercise a paused/unsubscribed endpoint without widening tenant access.
  - Delivery resolves every DNS answer and rejects the target if any address is local, private, link-local, reserved, documentation, multicast, or IPv4-mapped private space. The selected public address is pinned for the HTTPS connection while preserving TLS SNI/Host verification; redirects are not followed and requests time out after ten seconds.
  - Aligned web/worker Redis URL handling for database index, credentials, and TLS, and excluded compiled worker `dist` tests from Vitest discovery so local verification remains deterministic after a build.
- Added regression evidence:
  - Added Org A/Org B browser fixtures covering foreign-organization key/endpoint creation, foreign key scope/revoke operations, foreign endpoint update/test/delete operations, one-time secret display without URL leakage, private target rejection, valid paused-endpoint test queueing, API scope denial, and REST event list/detail tenant containment.
  - Added web unit coverage for target normalization and endpoint-per-job fan-out. Added worker coverage for private/mixed DNS rejection, retry-stable signed envelopes, tenant-bound endpoint loading, paused test delivery, DNS-address pinning, TLS/Host preservation, timeout setup, and redirect rejection.
- Verified:
  - Focused API-key/webhook E2E passed 4/4 in development mode.
  - Full production-mode Chromium E2E passed 50/50 with four workers; expected server logs record the deliberately rejected cross-tenant attempts.
  - Root tests passed 54/54 web unit tests and 21/21 worker tests; repository-wide type-check, lint, Prisma validation, `git diff --check`, docs build, worker build, and production web build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
- Remaining issues / blockers:
  - `SEC-02` remains open for exports and any unremediated action/upload surfaces discovered by the remaining inventory. `SEC-03` unsigned inbound Stripe webhook handling remains open; do not deploy.
  - Production API/auth/payment rate limits are still process-local, and a real external HTTPS webhook delivery/consumer verification checkpoint has not been performed in this local unit.
  - Invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, mixed-currency reporting, payment-attempt serialization, the 42-model target schema, and external Phase 7 gates remain later units.
- Next session should:
  - Inventory and remediate registration/analytics/payout exports and any remaining bare resource action surfaces as the final `SEC-02` sweep. Keep inbound Stripe webhook fail-closed verification as the next separately reviewable P0 unit.

### 2026-07-14 - Phase 7, secure raffle and voucher resources
- Remediated the raffle/voucher `SEC-02` family and related voucher-integrity paths:
  - Added a shared raffle guard that derives organization/event access through the stored raffle and rejects internally inconsistent raffle/event tenant links. Raffle entry, confirmed-registration auto-entry, and winner draws no longer trust submitted organization/event IDs.
  - Raffle creation authorizes the stored event and copies its authoritative tenant. Prize configuration now requires at least one prize, unique names, positive integer quantities, a selected prize stored on that raffle, and remaining quantity before a winner can be recorded.
  - Voucher creation and bulk generation authorize the stored event, derive its organization/currency, validate every restricted registration tier against that event, normalize codes, validate percentage/amount/max-use/expiry fields, and preserve VND flat discounts as whole dong.
  - Public store voucher application derives the event from the authenticated user's stored cart, verifies cart/event/voucher tenant consistency, and rejects registration-only or comp vouchers. Removed redundant hidden tenant/event inputs from the affected raffle, voucher, and cart forms.
  - Public registration now verifies voucher tenant/event integrity before creating an attendee. Paid fulfillment validates order/event/voucher relationships, increments only a matching voucher, and refunds decrement voucher usage after a successful paid-order reversal.
- Added regression evidence:
  - Added serial Org A/Org B browser fixtures covering event-tampered raffle/voucher creation, foreign raffle entry/auto-entry/draw mutations, invalid prize injection, foreign voucher tier restrictions, user-owned foreign-cart injection, valid VND voucher persistence, and an internally poisoned public-registration voucher.
  - Rejected mutations are asserted not to create attacker-controlled users, registrations, orders, raffles, voucher codes, winner history, or cross-tenant cart changes.
- Verified:
  - Focused raffle/voucher E2E passed 5/5 in development mode.
  - Full production-mode Chromium E2E passed 46/46 with four workers; expected server logs record the deliberately rejected cross-tenant and invalid-prize/voucher attempts.
  - Root tests passed 43/43 web unit tests plus 1/1 worker test; repository-wide type-check, lint, Prisma validation, `git diff --check`, and production build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
- Remaining issues / blockers:
  - `SEC-02` remains open for API keys/webhooks, exports, and other unremediated upload/action families. `SEC-03` unsigned Stripe webhook handling also remains open; do not deploy.
  - Concurrent voucher max-use reservation is not yet modeled; invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, mixed-currency reporting, production rate limiting, and the 42-model target schema remain later logical units.
  - Badge image layers, recipient transfer accept/decline, physical printer evidence, and external Phase 7 gates remain incomplete. No deployment was attempted.
- Next session should:
  - Inventory and remediate API-key/webhook management and delivery as the next stored-resource authorization/signature unit. Keep exports and Stripe inbound webhook verification as separately reviewable logical units if the inventory confirms distinct boundaries.

### 2026-07-14 - Phase 7, secure badge/check-in resources and expose real print artifacts
- Remediated the badge/check-in `SEC-02`, cashier `FIN-02`, and reachable-output portion of `FUNC-01`:
  - Added shared badge-template and badge guards that derive organization/event access through stored relationships and reject inconsistent badge, template, registration, type, or event tenant links. Template save, batch generation, per-badge rendering, print confirmation, and check-in no longer trust submitted organization IDs.
  - Badge template defaults accept only registration types stored under the same event. Batch generation requires the stored template and event to match, and worker jobs filter through consistent organization/template/registration/event relationships before rendering or persisting anything.
  - Added persisted `pdfUrl`, `zplData`, and `generatedAt` badge fields. The worker now stores its uploaded PDF URL and per-badge ZPL output in the database, with unit coverage proving those artifacts are written after rendering.
  - Added reusable dashboard print controls: Chrome/Edge can send stored ZPL through WebUSB; every supported browser can open the generated PDF; `printedAt` is written only after direct printer success or an explicit "Confirm PDF printed" action. Removed the old reprint action that merely wrote a timestamp without printer output.
  - Staff, cashier, and express check-in surfaces show render/print state and use the same output controls. Express lookup no longer matches an empty scan, and check-in rejects cancelled/transferred registrations while avoiding duplicate check-in webhooks.
  - Rebuilt walk-in cashier as one database transaction covering attendee, checked-in registration, paid order/order item, and unprinted badge. Event/type/tenant/currency are stored-resource-derived, USD uses cents, VND uses whole dong and the configured VND registration fee, and both cash and external-card-terminal options explicitly represent already-collected payment rather than leaving a checked-in attendee on a pending card order.
  - Applied the additive badge artifact fields to the local PostgreSQL schema with Prisma DB push.
- Added regression evidence:
  - Added Org A/Org B browser fixtures for foreign registration check-in, foreign badge-template save and batch generation, foreign print confirmation, foreign cashier tier injection, successful local PDF confirmation, and a valid VND external-card-terminal walk-in whose order is paid/whole-dong while the badge remains unprinted.
  - Added a worker unit test that verifies tenant-consistent loading, PDF upload URL persistence, per-badge ZPL persistence, and generated timestamp storage.
- Verified:
  - Focused badge/check-in E2E passed 4/4 in development mode.
  - Full production-mode Chromium E2E passed 41/41 with four workers; expected server logs record the deliberately rejected cross-tenant mutation attempts.
  - Root tests passed 43/43 web unit tests plus 1/1 worker test; repository-wide type-check, lint, Prisma validation, `git diff --check`, and production build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
- Remaining issues / blockers:
  - `SEC-02` remains open for raffles/vouchers, API keys/webhooks, exports, and other unremediated upload/action families. `SEC-03` unsigned Stripe webhook handling also remains open; do not deploy.
  - Badge image layers still render placeholders, recipient transfer accept/decline and physical WebUSB/PDF printer evidence remain incomplete, and no deployment was attempted.
  - Invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, mixed-currency reporting, production rate limiting, and the 42-model target schema remain later logical units.
- Next session should:
  - Inventory and remediate raffles/vouchers as the next stored-resource authorization unit. Keep API keys/webhooks, exports, image-layer rendering, and recipient transfer acceptance as separate logical units.

### 2026-07-14 - Phase 7, derive staff, volunteer, and vendor authorization from stored resources
- Remediated the staff/vendor `SEC-02`, vendor-upload `SEC-04`, and related `FIN-02` family:
  - Added shared guards for departments, staff roles, volunteer applications, staff assignments, and vendor applications. Organizer mutations now derive the authoritative organization/event/currency through the stored resource and reject internally mismatched tenant relationships instead of trusting hidden organization/event values.
  - Department leads must be members of the event organization. Assignment/approval flows require the application and role to belong to the same department/event; bulk volunteer/vendor reviews validate every selected ID before writing; booth assignment derives its event from the stored vendor application.
  - Public volunteer/vendor submissions now resolve the organization from the portal slug, bind to that portal's first published event, and derive tenant fields server-side. Volunteer department selection and vendor table selection must belong to that event, and vendor success/payment lookups are portal/event scoped.
  - Removed redundant hidden `orgId`/`eventId` inputs from resource-targeted staff/vendor forms and drag/drop assignment payloads. Event IDs remain only where the event itself is the creation or bulk-operation resource.
  - Added a vendor-document policy distinct from product images: at most five files, 10 MB each, PDF/PNG/JPEG/WebP only, metadata checks before byte reads, magic-byte verification, HTTP(S)-only URLs, and generated extension-safe object names. Invalid files are rejected before a vendor user/application is created.
  - Booth table, amenity, and approval editors now preserve VND whole-dong values and use whole-number steps instead of dividing by 100.
- Added regression evidence:
  - Added Org A/Org B browser fixtures covering public department tampering and success disclosure, foreign department/role/application/assignment mutations, mixed-tenant vendor bulk review, foreign booth assignment, unsupported/forged vendor files, and valid VND booth configuration round-tripping.
  - Added unit coverage for vendor file type, size, signature, and URL policy.
- Verified:
  - Focused staff/vendor-resource E2E passed 5/5 in development mode.
  - Full production-mode Chromium E2E passed 37/37 with four workers; expected server logs record the deliberately rejected mutation and upload attempts.
  - Root unit tests passed 43/43; repository-wide type-check, lint, Prisma validation, and production build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
  - `git diff --check` passed before this progress update and will be repeated before commit.
- Remaining issues / blockers:
  - `SEC-02` remains open for badges/check-in, raffles/vouchers, API keys/webhooks, exports, and other unremediated upload/action families. `SEC-03` unsigned Stripe webhook handling also remains open; do not deploy.
  - Remaining VND cashier/payment correctness, invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, and the 42-model target schema remain later logical units.
- Next session should:
  - Inventory and remediate badges/check-in as the next event-day stored-resource authorization unit. Keep raffles/vouchers and API keys/webhooks as separate logical units.

### 2026-07-14 - Phase 7, derive hotel block and booking authorization from stored resources
- Remediated the hotel `SEC-02` family and the hotel portion of `FIN-02`:
  - Added shared `requireHotelBlockAccess(blockId)` and `requireHotelBookingAccess(bookingId)` guards. Block updates and booking cancellations now derive tenant/event/currency from the stored block or booking relationship instead of submitted organization/event values.
  - Hotel block creation authorizes the stored event first and copies its authoritative organization/currency. Public booking requires the block to belong to the submitted portal event, requires that event to be published, rejects internally mismatched block/event tenant records, and writes the booking/order/order item with the event's authoritative organization and event ID.
  - Removed redundant hidden `orgId` fields from organizer/public hotel forms. Public success lookup now scopes the booking through its block's organization, preventing one tenant portal from disclosing another tenant's booking.
  - Hotel rate editors now use currency-aware VND whole-dong inputs and preserve existing VND values without dividing by 100.
- Added regression evidence:
  - Added Org A/Org B fixtures covering public success disclosure, cross-event public booking tampering, event-tampered block creation, foreign block update, foreign booking cancellation, and a valid zero-value VND hotel booking whose order remains event-scoped.
- Verified:
  - Focused hotel-resource E2E passed 3/3 in development mode.
  - Full production-mode Chromium E2E passed 32/32 with four workers; expected server logs record the deliberately rejected hotel mutation attempts.
  - Root unit tests passed 34/34; repository-wide type-check, lint, Prisma validation, and production build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
  - `git diff --check` passed before this progress update and will be repeated before commit.
- Remaining issues / blockers:
  - `SEC-02` remains open for staff/vendors, badges/check-in, raffles/vouchers, API keys/webhooks, exports, and uploads outside product images. `SEC-03` unsigned Stripe webhook handling also remains open; do not deploy.
  - Remaining VND cashier/payment correctness, invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, and the 42-model target schema remain later logical units.
- Next session should:
  - Inventory and remediate the staff/volunteer/vendor action family with stored-resource authorization and Org A/Org B tests. Keep badges/check-in as a separate event-day unit.

### 2026-07-14 - Phase 7, derive store, product, order, and cart authorization from stored resources
- Remediated the next `SEC-02` and product-upload family:
  - Added shared `requireStoreProductAccess(productId)` and `requireOrderAccess(orderId)` guards. Product updates/deletes and full/partial refunds now derive tenant, event, currency, and rate-limit scope through the stored resource and its event; submitted hidden `orgId`/`eventId` values are no longer trusted.
  - Product creation authorizes the stored event first, then copies the event's authoritative organization and currency. Public cart additions derive the event and organization from the stored product, reject unpublished or internally mismatched products, and keep cart/item tenant fields authoritative.
  - Cart checkout rejects carts whose organization does not match their event, rejects product items from another event/tenant, rejects foreign vouchers, and creates orders/order items from the event's authoritative organization.
  - Product image uploads now allow only PNG/JPEG/WebP, enforce a 5 MB per-file and eight-image policy before reading file bytes, verify magic bytes, validate HTTP(S) image URLs, and use generated extension-safe object names. The product forms advertise the same policy and no longer send redundant hidden tenant fields.
  - Store price/surcharge editors now preserve VND whole-dong values instead of dividing them as USD cents. Refund amount controls use the event/order currency step and placeholder.
- Added regression evidence:
  - Added Org A/Org B fixtures covering event-tampered product creation, foreign product update/delete, foreign full/partial refunds, a poisoned user cart with mismatched tenant/event, and unsupported/forged product image uploads.
  - Added unit coverage for upload type/size/signature/URL policy and USD/VND input round-tripping.
- Verified:
  - Focused store-resource E2E passed 4/4 in development mode.
  - Full production-mode Chromium E2E passed 29/29 with four workers; expected server logs record the deliberately rejected store/cart/image mutation attempts.
  - Root unit tests passed 34/34; repository-wide type-check, lint, Prisma validation, and production build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
  - `git diff --check` passed before this progress update and will be repeated before commit.
- Remaining issues / blockers:
  - `SEC-02` remains open for hotel, staff/vendors, badges/check-in, raffles/vouchers, API keys/webhooks, exports, and uploads outside product images. `SEC-03` unsigned Stripe webhook handling also remains open; do not deploy.
  - Hotel/VND cashier/payment correctness, invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, and the 42-model target schema remain later logical units.
- Next session should:
  - Inventory and remediate the hotel block/booking mutation family with stored-resource authorization and Org A/Org B tests. Keep staff/vendors as a separate unit.

### 2026-07-14 - Phase 7, derive registration, note, and transfer authorization from stored resources
- Remediated the second `SEC-02` action family:
  - Added shared registration and attendee-note access guards that derive the organization through each stored resource's event instead of trusting hidden form fields.
  - Status, cancellation, refund, confirmation-email, tier-upgrade, attendee-note, and all transfer mutations now authorize the stored registration first and reuse its authoritative event, organization, tier, and user relationships.
  - Tier upgrades require the target tier to belong to the source registration's event. Bulk updates reject duplicate, missing, or foreign registration IDs before any write and scope the mutation to the authorized event and organization.
  - Public registration creation derives the organization from the published event. The public success lookup is organization-scoped so one tenant portal cannot disclose another tenant's registration by ID.
  - Removed redundant hidden organization/event fields from affected forms and corrected the previously swapped Confirm and Resend email form labels.
- Added regression evidence:
  - Added self-contained Org A/Org B tests for the public success lookup, direct registration URLs, status/refund/email actions, tier upgrades, bulk actions, attendee notes, and all three transfer paths.
  - The tests submit the actual React server actions with tampered IDs and verify that neither tenant's protected resources are modified and no attacker-controlled transfer records or users are created.
- Verified:
  - Full production-mode Chromium E2E passed 25/25 with four workers; expected server logs record the deliberately rejected cross-tenant mutation attempts.
  - Root unit tests passed 24/24; repository-wide type-check, lint, Prisma validation, and production build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
  - `git diff --check` passed after the progress update.
- Remaining issues / blockers:
  - `SEC-02` remains open for store/hotel, staff/vendors, badges/check-in, raffles/vouchers, API keys/webhooks, exports, and uploads. `SEC-03` unsigned Stripe webhook handling also remains open; do not deploy.
  - Invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, and the 42-model target schema remain later logical units.
- Next session should:
  - Inventory and remediate the store/product/order mutation family with stored-resource authorization and equivalent Org A/Org B tests. Keep hotel separate if the inventory shows it is a distinct large unit.

### 2026-07-14 - Phase 7, derive event, tier, and add-on authorization from stored resources
- Remediated the first `SEC-02` action family:
  - Replaced event update/status/delete authorization based on a submitted organization with `requireEventAccess(eventId)`. Revalidation paths now also use the organization stored on the authorized event.
  - Added resource-derived registration-tier and add-on guards. Tier update/delete derives the event and tenant from the stored tier; add-on update/delete derives them through the stored add-on and registration tier.
  - Tier creation now authorizes its stored event and copies the authoritative event `orgId`/currency. Add-on creation authorizes its stored registration tier and copies the authoritative event tenant/currency.
  - Tier reordering now requires an authorized event, rejects missing/duplicate/foreign tier IDs, and scopes every update to that event.
  - Removed redundant hidden `orgId`/`eventId`/`typeId` fields from the affected mutation forms. Creating an event still accepts `orgId` because no target event exists yet, then verifies the caller's owner/admin membership.
- Added regression evidence:
  - Added self-contained Org A/Org B mutation tests that tamper event, tier, and add-on IDs on an owned page and submit the actual React server actions.
  - Covered event status/settings, tier create/update/delete, and add-on create/update/delete. Every attempted foreign write was rejected and assertions proved both tenants' resources remained unchanged.
- Verified:
  - Focused event-resource authorization E2E passed 3/3 in development mode.
  - Full production-mode Chromium E2E passed 20/20 with four workers; expected server logs record the deliberately rejected mutation attempts.
  - Root unit tests passed 24/24; repository-wide type-check, lint, Prisma validation, and production build passed. The existing BullMQ dynamic-dependency warning remains non-blocking.
  - `git diff --check` passed. The pre-existing `.idea/.name` modification remains untouched and excluded.
- Remaining issues / blockers:
  - `SEC-02` remains open for registration/notes/transfers, store/hotel, staff/vendors, badges/check-in, raffles/vouchers, API keys/webhooks, exports, and uploads. `SEC-03` unsigned Stripe webhook handling also remains open; do not deploy.
  - Invitations/lifecycle, `/platform` surface separation, domain/payment boundaries, and the 42-model target schema remain later logical units.
- Next session should:
  - Remediate the registration/attendee-note/transfer mutation family using stored registration/event ownership and add equivalent Org A/Org B mutation tests. Keep store/hotel and later families for separate logical commits.

### 2026-07-14 - Phase 7, contain tenant provisioning and organizer access
- Implemented the first managed-tenant containment unit:
  - Restricted organization listing and provisioning pages plus the `createOrganization` server action to `PLATFORM_ADMIN` users. The platform administrator is temporarily assigned as the new tenant owner until the planned owner-invitation workflow exists.
  - Added shared platform, organization, and event access helpers; page guards return a controlled 404 for unauthorized direct URLs while server actions retain explicit permission errors.
  - Added a common organization layout guard and event layout guard so nested organizer pages cannot disclose a foreign tenant merely by changing the URL.
  - Scoped the dashboard workspace, event portfolio, and create-event organization selector to `OWNER`/`ADMIN` memberships. Removed organization provisioning navigation/actions from organizer and public accounts.
  - Added a self-contained Playwright persona matrix covering a platform administrator without membership, an organization owner, a `MEMBER`, and a public account, including cross-tenant direct-URL checks.
- Stabilized verification:
  - Made the root test task build workspace dependencies first so a clean repository resolves `@vfurst/db` without relying on stale `dist` output.
  - Fixed Playwright at four workers, matching the proven local concurrency ceiling, and refreshed the two desktop organizer snapshots intentionally changed by removing the organization-provisioning navigation item.
- Verified:
  - Focused tenant containment E2E passed 4/4.
  - Full Chromium E2E passed 17/17 with four workers, including SePay and visual regression coverage.
  - Root unit tests passed 24/24; repository-wide type-check, lint, Prisma validation, and production build passed. The existing BullMQ dynamic-dependency build warning remains non-blocking.
  - `git diff --check` passed. The pre-existing `.idea/.name` modification remains untouched and excluded.
- Remaining issues / blockers:
  - Do not deploy. This unit contains the broad self-service/global-inventory exposure but does not yet prove that every UUID-based mutation derives its tenant from the target resource (`SEC-02`). Unsigned Stripe webhook handling (`SEC-03`) also remains open.
  - Owner invitations, organization lifecycle/status, the dedicated `/platform` control plane, and the 42-model target schema belong to later logical units.
- Next session should:
  - Implement one resource-derived authorization unit from the Phase 7 remediation plan, starting with an inventory of event/ticket/add-on mutation families and cross-tenant regression tests. Do not start invitation/schema or route-migration work in the same session.

### 2026-07-14 - Phase 7, replace self-service SaaS plan with managed tenant provisioning
- Replaced the incorrect product contract:
  - Defined vFurst as managed/invite-only multi-tenant B2B SaaS: public accounts are identities only, organizations are platform-provisioned tenants, and organizer access requires explicit membership.
  - Separated the platform control plane (`/platform/*`), membership-scoped organizer workspace (`/dashboard/*`), public account area, and public tenant subdomain/custom-domain portal.
  - Added the target role matrix, organization lifecycle, single-use owner/member invitations, resource-derived authorization rules, suspension/settlement behavior, and 42-model target schema to `docs/plan/00-reference.md`.
- Reconciled cross-phase planning:
  - Replaced self-service organization CRUD in Phase 1 with platform provisioning, owner invitation acceptance, organization-scoped member management, and central authorization helpers.
  - Changed Phase 6 custom domains from organizer activation to organizer request plus platform verification/activation; tenant-bound API/webhook authorization is explicit.
  - Added the Phase 7 P0 remediation boundary, separated payment control plane, managed-sales marketing, beta onboarding, persona matrix, and completion gates.
  - Updated the verification plan, beta runbook, and go-live checklist so public signup, cross-tenant isolation, invitations, lifecycle, domains, payments, and suspension behavior are mandatory gates.
- Verified:
  - Searched maintained docs for the superseded organizer self-service assumptions and reconciled the remaining historical audit references without rewriting past evidence.
  - `git diff --check` passed for the documentation update.
  - No application code, database schema, or tests were changed or run in this documentation-only session.
- Remaining issues / blockers:
  - The running code still allows any authenticated user to create an organization and still mixes platform/organizer surfaces. The plan change does not mitigate the vulnerability by itself; deployment remains blocked.
- Next session should:
  - Implement the first containment unit only: require `PLATFORM_ADMIN` for organization provisioning/list routes, remove organizer tenant-creation UI, scope event creation options to memberships, add the shared organization route guard, and add direct-URL/persona regression tests before moving to invitations or route migration.

### 2026-07-13 - Phase 7, plan reconciliation and full-system audit
- Updated planning:
  - Replaced the stale duplicated monolithic plan with a maintained architecture/status index pointing to the canonical split phase files.
  - Reconciled the complete Operational Calm redesign, tenant-safe `(convention)/[orgSlug]` route contract, provider-neutral Stripe/SePay checkout, 41-model schema, scoped event-day PWA behavior, and current launch gates across `docs/plan/`.
  - Verified 95/95 literal `[NEW]` artifact paths and 41/41 maintained Prisma models exist.
  - Committed the planning update as `7bef1e0` (`docs(plan): reconcile ui and payment architecture`).
- Audited:
  - Recorded the complete evidence and remediation boundary in `docs/launch/full-system-audit-2026-07-13.md`.
  - Reopened the prior clean security claim: three organization pages disclose cross-tenant data, and many single-record actions authorize a submitted organization before mutating an unscoped foreign UUID.
  - Found the Stripe webhook fails open when its secret/signature is absent; launch readiness does not validate Stripe/SePay/checkout secrets.
  - Found organization billing/reconciliation mixes USD cents with VND whole đồng, VND organizer editors/cashier use USD conversions, and active payment-attempt locking is not atomic.
  - Found unbounded/type-unrestricted store/vendor uploads, badge PDF/ZPL/WebUSB output not wired to the UI, and no recipient accept/decline transfer workflow.
  - Noted process-local rate limiting and the unimplemented Server-Sent Events architecture promise as follow-up decisions.
- Verified:
  - `npm run type-check`, `npm run lint`, `npm run db:validate`, and `npm run build` passed; build retained the known BullMQ dynamic-import warning.
  - `npm run test` passed 24/24 web unit tests; DB/email/worker still have no test files.
  - `npm run test:e2e` passed 13/13 Chromium tests.
  - `npm audit --audit-level=moderate` passed with 0 vulnerabilities.
  - A fresh k6 smoke rerun was not authorized because local k6 is absent and the Docker fallback would inject local test credentials into a public third-party container. Prior July 13 smoke evidence remains recorded.
  - `npm run check:launch` failed as expected for missing Sentry values, beta evidence, physical screen-reader evidence, and live URL; the corrected security audit is now an additional blocker.
- Cleaned:
  - Removed the repository npm cache, root/workspace Turbo caches, Next.js build cache, generated workspace `dist` directories, Playwright/test/coverage output, generated service-worker artifacts, TypeScript build metadata, and all 17 root log/error files.
  - Verified no targeted cleanup artifact or workspace `.log` file remains. Preserved dependencies, database backups, environment files, and the pre-existing `.idea/.name` modification.
- Remaining issues / blockers:
  - Do not deploy. Remediate the P0 tenant authorization and fail-open Stripe webhook findings first, then the financial/payment/upload findings, and add regression tests before repeating the audit.
  - Complete badge printing and recipient transfers before claiming the entire planned product is fulfilled.
  - External Phase 7 blockers remain: two beta conventions, live verification, production Sentry, real SePay Sandbox evidence, and physical NVDA/VoiceOver evidence.
- Next session should:
  - Start with `SEC-01` through `SEC-03` in the full-system audit: add organization route guards, centralize resource-derived tenant authorization across actions, make Stripe signature verification fail closed, and add cross-tenant/unsigned-webhook tests. Do not deploy before those gates pass.

### 2026-07-13 - Phase 7, create-event navigation crash
- Diagnosed:
  - The rebuilt organizer shell parsed the reserved `/dashboard/events/new` create route as if `new` were an event ID. This exposed event-only navigation and generated `/dashboard/events/new/staff`, where dynamic event pages attempted to query `new` as a UUID and produced the production Server Components error.
  - Browser-blocked monitoring requests visible in the report were unrelated to the application failure.
- Fixed:
  - Centralized dashboard event/organization route-context parsing and excluded reserved create-route segments from resource context.
  - Added a static `/dashboard/events/new/[...invalid]` 404 route plus a dynamic event-layout guard, preventing invalid create-route children from reaching event authorization or data queries.
  - Added unit coverage for reserved route parsing and an authenticated production-mode Playwright regression for the exact create-event-to-Staff failure path.
- Verified:
  - Web unit suite passed with 24/24 tests; web type-check and lint passed.
  - The optimized web production build passed with the existing non-blocking BullMQ dynamic-import warning.
  - Targeted production-mode Playwright passed 1/1; `/dashboard/events/new` showed workspace navigation, `/dashboard/events/new/staff` returned 404, and the server emitted no Prisma UUID or Server Components error.
- Remaining issues / blockers:
  - The fix is local until pushed and redeployed. Existing Phase 7 external blockers remain unchanged: beta-convention evidence, production monitoring configuration, real SePay Sandbox evidence, live verification, and a physical NVDA or VoiceOver pass.
- Next session should:
  - Push and redeploy this fix, then verify the production create-event page and invalid nested URL before continuing the outstanding Phase 7 evidence work.

### 2026-07-13 - Phase 7, complete “Operational Calm” UI/UX rebuild
- Built:
  - Replaced the nested dashboard navigation with one responsive organizer shell: organization/event switchers, grouped two-action event navigation, active states, breadcrumbs, collapsible desktop rail, accessible mobile drawer, user menu, and Ctrl/Cmd-K command palette with focus restoration.
  - Established the light-only Geist design system and approved warm-canvas/teal semantic tokens, operational density, responsive table/form conventions, local Radix/shadcn primitives, reduced-motion behavior, standardized status/empty/loading affordances, typed `ActionResult`, and centralized English date/formatting helpers.
  - Rebuilt dashboard home, event/list/overview/registration/analytics/settings reference surfaces and applied the system across commerce, hotel, staff, vendors, raffle, badges, designer, check-in, cashier, and express kiosk families. Event-day routes now use dedicated focus layouts and scoped offline-service-worker behavior.
  - Added migration-free `settings.branding` parsing/merging, safe PNG/JPEG/WebP upload limits, contrast-derived event accent tokens, organization/initials/system-pattern fallbacks, branding settings preview, and the updated reference JSON contract.
  - Rebuilt the public convention shell, guided Ticket → Attendee/Add-ons → Review/Payment registration, branded Stripe/SePay checkout, portal/store/application framing, marketing home, shared marketing/footer shell, auth framing, and docs navigation while preserving existing actions, URLs, permissions, APIs, and payment fulfillment.
  - Added serious/critical axe scans, keyboard/focus tests, mobile drawer and 390px overflow checks, responsive registration coverage, and ten stable desktop/mobile screenshot baselines for marketing home, event overview, registrations, public portal, and checkout.
  - Disabled Serwist bundling during development and global auto-registration in all modes; production offline support is registered only by check-in/kiosk surfaces. Updated the launch load wrapper to honor `VFURST_LOAD_PROFILE` and made failed k6 content checks fail the gate.
- Verified:
  - Repository-wide `npm run type-check`, `npm run lint`, `npm run test`, and `npm run db:validate` passed; the web unit suite has 19/19 passing tests including branding preservation/fallback/contrast coverage.
  - `npm run build` passed for all workspaces. The existing BullMQ dynamic-import warning remains non-blocking.
  - Production-mode Playwright passed 13/13 tests with four workers, including registration fulfillment, vendor application, organizer CRUD/settings authorization, check-in, mobile responsiveness, axe scans, visual baselines, SePay QR, signed webhook fulfillment, and payment polling.
  - Docker-backed k6 smoke passed 157/157 checks with 0% failed HTTP requests and 48.74 ms p95 response time.
  - Visual/manual evidence covers 1440×900 and 1024×768 without horizontal overflow; Playwright covers 390×844 and confirms 44px mobile actions. The in-app browser's viewport floor prevented an additional manual 390px resize, so the 390px evidence is automated rather than a second manual capture.
  - Changes are organized on `codex/operational-calm-rebuild` in conventional logical commits. The pre-existing `.idea/.name` worktree modification was preserved and excluded.
- Remaining issues / blockers:
  - No production cutover or deployment was performed, as required. External Phase 7 blockers remain: beta-convention evidence, live verification after an eventual full cutover, production monitoring/Sentry configuration, real SePay Sandbox evidence, and a physical NVDA or VoiceOver pass.
- Next session should:
  - Review the branch and screenshot baselines, then schedule the all-at-once deployment only after the external monitoring, beta, payment-sandbox, and physical screen-reader evidence is ready.

### 2026-07-13 - Phase 7, marketing homepage layout repair
- Diagnosed:
  - The text-only replacement for the removed homepage hero image was rendered as an uncontained grid child and referenced four undefined `--vf-*` CSS variables. Its border, background, and shadow therefore disappeared while its content stretched to the viewport edge, producing the broken desktop layout seen in production.
- Built:
  - Reworked the homepage hero into a centered responsive two-column composition with a self-contained convention operations preview, clearer messaging hierarchy, and compact proof-point treatment.
  - Refined the shared marketing navigation, calls to action, feature cards, and mobile breakpoints to match the repaired hero without changing the existing routes or product capabilities.
  - Updated the launch accessibility assertion for the new preview label and added focused homepage coverage for preview visibility and mobile horizontal containment.
- Verified:
  - `npm run type-check --workspace @vfurst/web` passed.
  - `npm run lint --workspace @vfurst/web` passed with the existing three `<img>` warnings in convention store, checkout QR, and dashboard store pages.
  - `npm run test:e2e -- tests/e2e/home.spec.ts` passed with 2/2 Chromium tests, including the new 390px mobile containment check.
  - `npm run build --workspace @vfurst/web` passed. The known BullMQ dynamic dependency warning and database/Redis connection-refused diagnostics remained because the local Docker services were stopped.
  - In-app browser QA passed at 1440×900 and 390×844: the hero stayed centered, no horizontal overflow was present, the navigation collapsed correctly on mobile, and the browser console contained no errors.
- Remaining issues / blockers:
  - Phase 7 external launch blockers remain unchanged: beta-convention evidence, live marketing verification after redeploy, production Sentry env, and physical screen-reader pass.
- Next session should:
  - Redeploy the homepage repair and verify the production root URL at desktop and mobile widths, then continue the existing SePay Sandbox and launch-evidence work.

### 2026-07-12 - Phase 7, production login schema synchronization fix
- Diagnosed:
  - The shared Sentry issue reports an Auth.js `CallbackRouteError` on `POST /login` immediately after the SePay commit.
  - The commit added required Prisma columns including `User.platformRole`, while the production checklist still depended on a manual `prisma db push`. The deployed login page returned 200, but credential authorization queried the new user shape before production had applied the additive schema.
- Fixed:
  - Added a web `prestart` schema synchronization hook and a root `npm start` entry point so both root and workspace Coolify startup paths run `prisma db push --skip-generate` before Next.js starts.
  - Removed the unnecessary unique constraint on nullable checkout-token hashes and replaced it with a normal index. This avoids Prisma's `--accept-data-loss` gate while preserving lookup performance.
  - Kept the safety boundary: startup never supplies `--accept-data-loss`, so destructive schema changes fail deployment rather than applying automatically.
  - Updated the launch checklist with the automatic synchronization and required production database DDL permission.
- Verified:
  - The exact web `prestart` command synchronized the existing local database successfully.
  - A temporary empty PostgreSQL database was created, bootstrapped through the new deployment command, and checked for `users.platformRole` and `events.currency`; both columns existed. The temporary database was then removed.
- Next session should:
  - Redeploy this fix, confirm the prestart log reports the production database is in sync, then verify credential login and the dashboard before enabling SePay.

### 2026-07-11 - Phase 7, platform-controlled SePay QR payments
- Built:
  - Added platform roles with a grant/revoke CLI, immutable event/order currency, provider-neutral payment metadata, secure checkout-token context, provider attempts, webhook deduplication, payment exceptions, organizer ledgers, payouts, and manual refund records.
  - Added the shared `/checkout/[orderId]` flow for registration, cart/store, hotel, and vendor orders. USD uses Stripe; configured VND events can offer embedded SePay VietQR and Stripe; zero-value orders still auto-complete; unavailable providers do not create new paid orders or reservations.
  - Added exact whole-dong VND parsing/formatting, dynamic compact VietQR rendering, accessible bank-transfer fallback details, three-second status polling, 30-minute reservations, inventory release, and provider-switch locking during active attempts.
  - Refactored paid fulfillment into an atomic provider-neutral transition shared by Stripe and SePay, including idempotent SePay organizer ledger credits and fulfillment reversal for manual refunds.
  - Added HMAC-SHA256 SePay webhook verification over the raw body, five-minute replay protection, exact transfer matching, duplicate acceptance, manual-review exceptions, API v2 cursor reconciliation every 15 minutes, and one-minute expired-checkout cleanup.
  - Extended platform-admin settings with independent Stripe/SePay switches, SePay readiness and bank configuration, VND registration/hotel fees, settlement CSV export, validated payouts, manual SePay refunds, and exception resolution. Added organizer payout bank details to organization settings.
  - Updated currency-aware public/dashboard displays, legal/pricing/reference content, onboarding, and the SePay rollout runbook. Added production-mode E2E support and fixed cached check-in timestamp normalization discovered during verification.
- Verified:
  - Backed up the local PostgreSQL database to the ignored `.backups/` directory before applying the additive schema; `prisma validate`, `prisma generate`, and local `prisma db push --accept-data-loss` passed (the acknowledged warning was the new nullable unique checkout-token hash).
  - Repository-wide `npm run type-check`, `npm run lint`, `npm run test`, and `npm run build` passed. Unit suite: 13 tests, including currency units, provider eligibility/maintenance, checkout tokens, payment codes, VietQR parameters, signatures/timestamps, and ledger math.
  - Production-mode full Playwright suite passed with 10/10 tests using one worker. Coverage includes settings authorization, all existing launch surfaces, zero-value fulfillment, embedded SePay QR, exact signed webhook response, polling success navigation, organizer ledger persistence, and continued callback processing after SePay is disabled.
  - Official SePay documentation was rechecked for embedded VietQR parameters, raw-body HMAC format, five-minute timestamp protection, API v2 pagination/cursors, and the distinct Sandbox API base URL; reconciliation selects the Sandbox or Production host from `SEPAY_ENV`.
- Remaining issues / blockers:
  - Real SePay Sandbox webhook/API simulation was not possible without project Sandbox credentials and account IDs. SePay remains disabled by default and cannot be enabled until secrets and non-secret account configuration are complete.
  - The first real platform administrator still must be granted by email during rollout, after choosing the production operator account.
  - Phase 7 external launch blockers remain: beta-convention evidence, live marketing verification, production Sentry env, and physical screen-reader pass.
- Next session should:
  - Configure SePay Test mode credentials/account/payment-code prefix, run exact/duplicate/underpaid/overpaid/unmatched/late simulations plus reconciliation, then follow `docs/sepay-rollout.md` before enabling production SePay.

### 2026-07-11 - Phase 7, functional dashboard settings
- Built:
  - Replaced the inert dashboard `Settings` hash link with a real `/dashboard/settings` organizer hub and corrected sidebar active-state matching.
  - Added an owner/admin-scoped settings hub that lists manageable organizations and their events, links to existing organization settings, and links to the new event settings page.
  - Added event detail and registration-control editing for name, slug, description, venue, dates, manual approval, transfers, and per-user registration limits, plus a shortcut to email-template settings and a saved-success state.
  - Added validated event settings parsing and JSON merge helpers so core setting updates preserve vendor configuration, email templates, raffle history, and other unrelated event settings.
  - Added route-level owner/admin checks to organization settings, event settings, and event email-template settings.
  - Added focused validation/merge unit coverage and a settings E2E scenario covering navigation, membership filtering, access rejection, persistence, and JSON preservation.
- Verified:
  - `npm run type-check --workspace @vfurst/web` passed.
  - `npm run test --workspace @vfurst/web` passed with 6 focused tests.
  - `npm run lint --workspace @vfurst/web` passed with the existing two `<img>` warnings on store product images.
  - `npm run build --workspace @vfurst/web` passed; the known BullMQ dynamic dependency warning and initial local database/Redis connection-refused logs remained because Docker was stopped during the build.
  - The targeted Playwright settings scenario passed against the Docker-backed local PostgreSQL service.
  - The full E2E command was attempted but stopped before the new serial settings scenario because two pre-existing launch checks failed: the marketing accessibility test could not find its expected hero image, and the public zero-dollar registration test did not reach its success URL. The settings scenario was then run and passed independently.
- Remaining issues / blockers:
  - Phase 7 external launch blockers remain unchanged: beta-convention evidence, live marketing verification, production Sentry env, and physical screen-reader pass.
  - The two unrelated full-suite E2E failures above remain to be reconciled with the current marketing asset and registration checkout behavior.
- Next session should:
  - Investigate the marketing hero-image expectation and zero-dollar registration E2E return flow, then rerun the complete E2E suite.

### 2026-07-11 - Phase 7, Coolify Nixpacks setup failure diagnosis
- Built:
  - No source changes; inspected the failed Coolify deployment log for commit `de5245935c23103db1875a2144a0034e72139844`.
- Verified:
  - Coolify cloned the expected domain-migration commit and generated the intended Nixpacks plan.
  - The Docker build stopped in step `#8`, `nix-env ... && nix-collect-garbage -d`, before `npm ci`, Turbo, or Next.js ran.
  - The log contains no application compile error, dependency-install error, explicit disk-full message, or nonzero Docker exit code; Coolify raised its own `DeploymentException` with code `0` immediately after Nix garbage-collection output ended without `#8 DONE`.
  - The local Windows Docker daemon was not running, so this session could not inspect the separate Coolify deployment host's disk, memory, or kernel OOM evidence.
- Remaining issues / blockers:
  - The deployment host or Coolify/Nixpacks orchestration interrupted the image build during toolchain provisioning. The exported log alone does not distinguish a transient orchestrator failure from host disk/memory pressure because it omits a Docker exit status and resource diagnostics.
- Next session should:
  - Retry once. If the build stops at the same Nix step, inspect the Coolify host with `df -h`, `df -i`, `free -h`, `docker system df`, and kernel OOM logs; prune Docker build cache only if those checks show pressure, otherwise upgrade/restart Coolify and retry before changing application code.

### 2026-07-11 - Phase 7, production domain migration
- Built:
  - Replaced the retired platform domain with `vfurst.reyuugames.com` across runtime defaults, tenant URL display, legal contact addresses, API/webhook contracts, and planning documentation.
  - Centralized platform-domain detection around `getRootDomain()` so every hostname at or below `vfurst.reyuugames.com` is rejected as a custom domain, including tenant hosts such as `{slug}.vfurst.reyuugames.com`.
  - Updated custom-domain CNAME instructions to derive `app.<root-domain>` from the shared production root-domain configuration.
  - Updated public API contract server URLs to use the deployed `/api/v1` path on `vfurst.reyuugames.com`.
  - Removed ignored, obsolete Docusaurus build/cache folders that still embedded the retired domain; the current docs builder continues to emit the verified `apps/docs/dist` output.
- Verified:
  - Confirmed tracked repository content contains no remaining references to the retired platform domain.
  - Confirmed the ignored local environment uses localhost for development and already points `VFURST_LAUNCH_URL` at `https://vfurst.reyuugames.com`.
  - Ran a focused `tsx` assertion confirming the production fallback, tenant-domain recognition, and unrelated custom-domain classification.
  - `npm run type-check --workspace @vfurst/web` passed.
  - `npm run lint --workspace @vfurst/web` passed with the existing two `<img>` warnings on store product images.
  - `npm run build --workspace @vfurst/docs` passed.
  - `npm run build --workspace @vfurst/web` passed; the known BullMQ dynamic dependency warning and local database/Redis connection-refused logs remain because local services were not running.
- Remaining issues / blockers:
  - Phase 7 external launch blockers remain unchanged: beta-convention evidence, live marketing verification, production Sentry env, and physical screen-reader pass.
- Next session should:
  - Redeploy with `NEXT_PUBLIC_ROOT_DOMAIN=vfurst.reyuugames.com` and the root app/auth/launch URLs set to `https://vfurst.reyuugames.com`, then verify a real tenant at `{slug}.vfurst.reyuugames.com`.

### 2026-07-09 - Phase 7, design-system documentation cleanup
- Built:
  - Removed remaining written references to the retired UI library from `PROGRESS.md` so the repo's planning and history notes consistently point future work at local shadcn/ui-style components.
- Verified:
  - Re-read `PROGRESS.md` before editing.
  - Ran a repo-wide case-insensitive search for the retired UI library name and found the remaining matches were only in `PROGRESS.md`.
- Remaining issues / blockers:
  - Phase 7 external launch blockers remain unchanged: beta-convention evidence, live marketing verification, production Sentry env, and physical screen-reader pass.
- Next session should:
  - Continue Phase 7 live/deployment verification or visually QA the shadcn-styled dashboard and public convention flows with seeded data.

### 2026-07-09 - Phase 7, shadcn/ui design-system migration
- Built:
  - Removed the retired UI library from the web app source by replacing its imports with local shadcn/ui-style primitives under `apps/web/src/components/ui`.
  - Added the shadcn baseline config and dependencies: `apps/web/components.json`, `apps/web/postcss.config.mjs`, Tailwind CSS 4, `@tailwindcss/postcss`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, and `lucide-react`.
  - Replaced the retired design-system theme/provider setup with app-owned CSS variables in `apps/web/src/app/globals.css` and simplified `apps/web/src/components/providers.tsx`.
  - Rebuilt the dashboard shell, stat cards, buttons, badges, cards, forms, empty state, segmented control, power search, and table surfaces on local shadcn/ui-style components.
  - Removed the retired UI package dependencies from the web workspace dependencies.
  - Updated current plan/reference and launch accessibility docs so future work points at shadcn/ui-style local components.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, and `docs/plan/phase-7-launch.md` before editing.
  - `npm run type-check --workspace @vfurst/web` passed.
  - `npm run lint --workspace @vfurst/web` passed with the existing `<img>` warnings on store product images.
  - `npm run build --workspace @vfurst/web` passed; build still reports the known BullMQ dynamic dependency warning, and local Redis/database connection-refused logs appeared because the local services were not running.
  - Started a local production server on `http://127.0.0.1:3000` and verified `/`, `/login`, and `/register` return HTTP 200 with Next CSS and no retired-library page text.
  - Confirmed no current source/package references to the retired design-system packages remain.
- Deviated from plan:
  - The original plan specified a different UI library. This session intentionally migrated the current implementation to local shadcn/ui-style components per user request and updated active plan docs accordingly.
- Remaining issues / blockers:
  - The migration preserves existing `vf-*` page layout classes and focuses on removing the retired design-system runtime dependency first; deeper UX redesign remains a follow-up.
  - Phase 7 external launch blockers remain unchanged: beta-convention evidence, live marketing verification, production Sentry env, and physical screen-reader pass.
- Next session should:
  - Visually QA the shadcn-styled dashboard and public convention flows with seeded data, then continue the existing Phase 7 deployment/live checkout verification path.

### 2026-07-09 - Phase 7, Coolify image export diagnosis
- Built:
  - Added a root `.dockerignore` so Docker/Nixpacks deployment contexts exclude `.git`, local caches, `node_modules`, Next/Turbo outputs, generated service workers, logs, test artifacts, and env files.
  - Documented the Coolify failure mode where Turbo/Next completes successfully but Docker fails while `exporting layers`.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, and `docs/plan/phase-7-launch.md` before editing.
  - Inspected `C:\Users\Kazeous\Downloads\deployment-xkum51s99jc0wgszza87hskx-all-logs-2026-07-09-07-54-27.txt`.
  - Confirmed the deployment used commit `7664f8058a0e83f9e501fb20c1ef3988084e3abc`.
  - Confirmed Turbo/Next build completed successfully in Coolify with `Tasks: 3 successful, 3 total`; the failure happened after `#16 exporting layers`, which points to Docker image export or host-resource pressure rather than a TypeScript/Next compile error.
  - Confirmed Sentry source-map upload still returns HTTP 403, but the configured build logs it as `[sentry] Source map upload failed` and continues to route generation/build completion.
- Remaining issues / blockers:
  - Redeploy after this commit and, if Docker still fails at `exporting layers`, prune unused Docker images/build cache or add disk to the Coolify host.
  - Sentry token/project permissions still need correction so source maps upload cleanly.
  - Phase 7 external launch blockers remain unchanged: beta-convention evidence, live marketing verification, production Sentry env, and physical screen-reader pass.
- Next session should:
  - Push/redeploy this Docker context cleanup, confirm the image exports and container starts, then verify the live store checkout success page.

### 2026-07-09 - Phase 7, checkout success bugfix
- Built:
  - Reworked the public store success return page so `?success=` renders a dedicated receipt/lookup state instead of continuing to show the product grid and live cart checkout panel.
  - Added Stripe Checkout `{CHECKOUT_SESSION_ID}` to cart checkout success URLs and verify that session on return before using it as a fallback fulfillment signal.
  - Hardened `markOrderPaid` so fulfillment side effects only run for a single `PENDING -> PAID` transition, preventing duplicate stock/cart/voucher mutations if Stripe webhook events and return-page verification overlap.
  - Added a compact receipt table layout for store order confirmations.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, and `docs/plan/phase-7-launch.md` before editing.
  - `npm run type-check --workspace @vfurst/web` passed via the Windows `npm.cmd` shim.
  - `npm run lint --workspace @vfurst/web` passed with the existing `<img>` warnings on store product images.
  - `npm run build --workspace @vfurst/web` passed; build still reports the known BullMQ dynamic dependency warning.
  - Started a local production server on `http://127.0.0.1:3000`, verified a store success URL returned HTTP 200 and no longer rendered `Checkout`, `Cart`, or `No products`, then stopped the temporary server.
- Remaining issues / blockers:
  - The deployed production store checkout flow still needs to be retested after this fix is deployed.
  - Phase 7 external launch blockers remain unchanged: beta-convention evidence, live marketing verification, production Sentry env, and physical screen-reader pass.
- Next session should:
  - Deploy this bugfix, run a real Stripe test checkout against the live convention store, and confirm the success page shows the receipt without a live cart or duplicate checkout path.

### 2026-07-08 - Phase 7, session 22
- Built:
  - Added a convention-route guard in `apps/web/src/lib/convention.ts` so static-file-like slugs such as `favicon.ico` do not query the organization table.
  - Documented the production database bootstrap step in `docs/launch/go-live-checklist.md`.
- Verified:
  - Re-read `PROGRESS.md` before continuing deployment diagnosis.
  - Opened the shared Sentry issue and confirmed the production exception is `PrismaClientKnownRequestError`: `public.organizations` does not exist during `prisma.organization.findFirst()`.
  - Confirmed the repo has `packages/db/prisma/schema.prisma` but no committed `packages/db/prisma/migrations` directory, so the first empty production database needs `npx prisma db push` rather than `prisma migrate deploy`.
  - Confirmed live `/login` returns HTTP 200 and `/api/auth/session` returns HTTP 200, while `/favicon.ico` currently produces a server error because the deployed build routes it through the convention slug path.
  - `npm run type-check --workspace @vfurst/web` passed via the Windows `npm.cmd` shim.
- Remaining issues / blockers:
  - Production PostgreSQL schema has not been initialized. Run `cd packages/db && npx prisma db push` in a Coolify shell/job using the same production `DATABASE_URL` as the web app.
  - After schema bootstrap, create the first admin/user account or seed production-safe launch data before expecting credential login to succeed.
- Next session should:
  - Run the production DB bootstrap in Coolify, redeploy the route-guard build if needed, then test login again and verify Sentry no longer reports missing-table errors.

### 2026-07-08 - Phase 7, session 21
- Built:
  - Hardened the web production build against clean Coolify/Nixpacks resolution by adding webpack extension aliases in `apps/web/next.config.ts`, allowing `.js` ESM specifiers in local TypeScript workspace packages to resolve to `.ts` source during the Next build.
  - Made Sentry source map upload failures best-effort during `next build` by adding a Sentry `errorHandler` that logs the upload error instead of aborting the deployment.
  - Added Coolify Sentry `403` guidance to `docs/launch/go-live-checklist.md`.
- Verified:
  - Re-read `PROGRESS.md` before diagnosing the Coolify deployment log.
  - Inspected `C:\Users\Kazeous\Downloads\deployment-u3lsmwuqw6ykkgv7ule1pcym-all-logs-2026-07-08-15-23-13.txt`.
  - Identified the two deployment blockers: Sentry source map upload returned HTTP 403, and Next could not resolve `.js` import specifiers from `packages/email/src/index.ts` during the web build.
  - Inspected `packages/email/package.json`, `packages/email/src/index.ts`, `packages/email/tsconfig.build.json`, `apps/web/tsconfig.json`, root `tsconfig.base.json`, `apps/web/package.json`, and `turbo.json`.
  - `npm run type-check --workspace @vfurst/web` passed via the Windows `npm.cmd` shim.
  - `npx turbo run build --filter=@vfurst/web... --env-mode=loose` passed via the Windows `npx.cmd` shim, matching the Coolify build command shape.
- Remaining issues / blockers:
  - Coolify should still rotate or recreate `SENTRY_AUTH_TOKEN` with permission to upload source maps for the configured `SENTRY_ORG` and `SENTRY_PROJECT`.
  - Production DNS/proxy settings still need live verification after redeploy.
- Next session should:
  - Push and redeploy this build fix, confirm the web image builds successfully in Coolify, then verify `https://vfurst.reyuugames.com/` reaches HTTP 200 after Cloudflare/Coolify SSL settings are corrected.

### 2026-07-08 - Phase 7, session 20
- Built:
  - Documented the Cloudflare/Coolify SSL redirect-loop failure mode in `docs/launch/go-live-checklist.md`.
- Verified:
  - Re-read `PROGRESS.md` before diagnosing the deployment issue.
  - Confirmed the live domain `https://vfurst.reyuugames.com/` redirects back to the same HTTPS URL with `302 Found`, producing the browser `ERR_TOO_MANY_REDIRECTS` failure.
  - Confirmed `http://vfurst.reyuugames.com/` also redirects to the same HTTPS URL.
  - Searched the web app for root-level `NextResponse.redirect`, `redirects()`, `trailingSlash`, and forced HTTPS logic; the app has no matching root redirect.
  - Inspected `apps/web/next.config.ts` and `apps/web/middleware.ts`; neither explains a same-URL HTTPS redirect on the platform marketing host.
- Remaining issues / blockers:
  - Production DNS/proxy configuration still needs adjustment. If Cloudflare is proxying the domain, SSL/TLS mode should be `Full` or `Full (strict)`, not `Flexible`; otherwise Coolify/Traefik HTTPS enforcement can loop through Cloudflare.
- Next session should:
  - Change Cloudflare/Coolify SSL settings, redeploy if needed, then verify `curl -I -L --max-redirs 5 https://vfurst.reyuugames.com/` reaches HTTP 200 instead of repeating a same-URL redirect.

### 2026-07-08 - Phase 7, session 19
- Built:
  - Prepared `@vfurst/worker` for standalone Coolify background-worker deployment.
  - Added real production TypeScript emit for the worker via `apps/worker/tsconfig.build.json`, compiling ESM JavaScript and source maps into `apps/worker/dist`.
  - Updated worker scripts so `dev` remains `tsx watch`, `build` emits production JavaScript, `start` runs `node dist/index.js`, and `type-check` remains no-emit TypeScript.
  - Added production build outputs for the runtime workspace packages `@vfurst/db` and `@vfurst/email` so the compiled worker can import package JavaScript with Node instead of TypeScript source.
  - Added worker runtime environment validation for database, Redis, AWS, and S3 requirements, with no production localhost fallbacks.
  - Reworked worker startup and shutdown so SIGTERM/SIGINT are idempotent and graceful: workers stop accepting jobs, active BullMQ workers close, queue events close, queues close, the optional health server closes, and Prisma disconnects.
  - Made the worker health endpoint opt-in via `WORKER_HEALTH_PORT`; the worker no longer requires an HTTP port or public domain to stay alive.
  - Confirmed badge generation uses S3 object storage and does not depend on a web-container-local upload directory.
- Verified:
  - Re-read `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-7-launch.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Inspected `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/index.ts`, root/package tsconfig files, `turbo.json`, and all worker imports/runtime dependencies.
  - `npm run build --workspace @vfurst/worker` passed via the Windows `npm.cmd` shim.
  - `npm run type-check --workspace @vfurst/worker` passed via the Windows `npm.cmd` shim.
  - `npm test --workspace @vfurst/worker` passed via the Windows `npm.cmd` shim; no worker tests exist yet, so Vitest exited successfully with `--passWithNoTests`.
  - `npx turbo run build --filter=@vfurst/worker...` passed via the Windows `npx.cmd` shim.
  - `npm run lint --workspace @vfurst/worker` passed via the Windows `npm.cmd` shim.
  - Direct `node apps\worker\dist\index.js` smoke loaded the compiled entry and exited non-zero with the expected missing-runtime-env configuration error.
- Remaining issues / blockers:
  - Coolify must configure the worker as a separate application resource with no public domain and with required runtime env values: `DATABASE_URL`, `REDIS_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET_NAME`.
  - Production must run Prisma migrations against the target PostgreSQL database before starting the worker.
  - External services required before worker start: PostgreSQL, Redis, AWS S3 credentials/bucket, and SES or per-organization SMTP settings for email delivery.
  - Phase 7 still needs beta-convention evidence, physical screen-reader evidence, and live marketing verification against `https://vfurst.reyuugames.com` before `npm run check:launch` can pass.
- Next session should:
  - Configure the separate Coolify worker resource with build command `npm run build --workspace @vfurst/worker`, start command `npm run start --workspace @vfurst/worker`, and the required runtime environment variables; then verify the deployed worker stays running and processes queued jobs.

### 2026-07-08 - Phase 7, session 18
- Built:
  - Added shared platform-host detection in `apps/web/src/lib/platform-hosts.ts`.
  - Updated middleware so hosts from `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, and `VFURST_LAUNCH_URL` are treated as platform hosts instead of convention custom domains.
  - Updated organization resolution to use the same platform-host logic.
  - Prevented organization custom-domain settings from claiming platform hostnames.
  - Added `AUTH_TRUST_HOST=true` to tracked env templates and documented the Coolify production env set in `docs/launch/go-live-checklist.md`.
- Verified:
  - Re-read `PROGRESS.md` before editing.
  - Diagnosed the likely Coolify redirect/routing issue: if production keeps `NEXT_PUBLIC_ROOT_DOMAIN` at the local/default value, `vfurst.reyuugames.com` can be interpreted as a custom convention domain rather than the platform marketing host.
  - `npm run type-check --workspace @vfurst/web` passed.
  - `npm run build` passed with root `.env` explicitly loaded.
  - Reran `npm run type-check --workspace @vfurst/web` after final host parsing hardening; it passed.
  - Reran `npm run build` after the final host parsing hardening; it passed.
- Remaining issues / blockers:
  - Coolify must set production URL/host env values at build and runtime: `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, `AUTH_TRUST_HOST`, and `VFURST_LAUNCH_URL`.
  - Phase 7 still needs beta-convention evidence, physical screen-reader evidence, and live marketing verification against `https://vfurst.reyuugames.com` before `npm run check:launch` can pass.
- Next session should:
  - Redeploy with the production env values, verify `https://vfurst.reyuugames.com` no longer loops, then rerun `npm run check:launch` after external launch evidence is documented.

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
  - Built the event dashboard area: events list with shared `PowerSearch`/`Table`/`Badge`, multi-step event wizard with `SegmentedControl`, event-scoped layout/navigation, Recharts overview, capacity by tier, and recent registration feed.
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
  - Tightened Phase 1 UI implementation to better match the plan's shared component requirements.
  - Replaced raw login/register inputs with small client form components using `TextInput` and `FormLayout`; login now uses a divider.
  - Replaced the handmade dashboard nav wrapper with the shared dashboard side navigation shell.
  - Updated dashboard stat cards to use shared heading, text, and progress primitives instead of handmade metric/progress markup.
  - Replaced the organization list's handmade table markup with a shared `Table` plus `EmptyState`; added a client table wrapper so column renderers stay on the client side, and set `tableProps` for the accessible table name.
- Verified:
  - Re-read `AGENTS.md`, `PROGRESS.md`, `docs/plan/00-reference.md`, `docs/plan/phase-1-core-infra.md`, and `docs/plan/verification-and-timeline.md` before editing.
  - Audited every Phase 1 named artifact from the plan; all expected files exist.
  - `npm run test` passed. No unit tests exist yet, so Vitest exits with `--passWithNoTests`.
  - `npm run test:e2e` passed cleanly.
  - `turbo run type-check` passed.
  - `turbo run lint` passed.
  - `cd packages/db && npx prisma validate` passed after elevated npm-cache access.
  - `turbo run build` passed cleanly and still includes the middleware bundle.
  - Local browser smoke passed for component-driven register/login forms, dashboard render, organization create, organization table render with accessible table name, and created-org subdomain routing.
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
  - Subdomain routing smoke passed with a tenant host, resolving to the convention tenant page for the created org.
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
- Built: Initial Phase 0 monorepo, Next.js 15 app, UI theme wiring, Prisma schema with all 29 planned entities, API contracts, CI, env templates, Playwright smoke test, and E2E runner.
- Verified: Repository-side checks passed repeatedly: test, type-check, lint, Prisma validate, build, E2E, and dev server smoke checks.
- Superseded note: Earlier sessions treated Vercel, Railway, AWS S3/IAM, and live Stripe setup as Phase 0 blockers. The plan was later updated to defer cloud deployment until after Phase 7 and use the local Docker Compose stack during Phases 0-7.

## Known deviations from the plan

- `packages/db/.env` exists as a committed, non-secret Prisma CLI helper so `cd packages/db && npx prisma validate` works before any real environment is provisioned.
- Next build skips its duplicate internal lint pass; `turbo run lint` is the authoritative lint check and is included in CI.
- E2E tests use `scripts/run-e2e.mjs` to manage the Next dev server lifecycle reliably on Windows.
- On this machine, verification uses the legacy `docker-compose` CLI rather than the unavailable `docker compose` plugin.

## Blockers / open questions

- No Phase 0 blockers remain.
- Phase 1 is reopened by organization-route and cross-tenant authorization findings.
- Phase 2 is reopened by tenant-scope and VND/payment correctness findings.
- Phase 3 is reopened by tenant-scope and product-upload findings.
- Phase 4 is reopened by tenant-scope and vendor-upload findings.
- Phase 5 is reopened by cashier, badge-printing, and recipient-transfer findings.
- Phase 6 remains audit-reopened for standalone completion evidence; its process-local production rate-limit blocker is closed.
- Phase 7 is blocked by the failed 16-replica database connection-capacity proof plus beta-convention evidence, live marketing verification, production Sentry, real SePay Sandbox evidence, and a physical screen-reader pass.

# Current state — verified baseline, 2026-07-26

> Snapshot of what actually exists and what evidence backs it, compiled during the plan-v2 rebuild from the repository, the 2026-07-26 runtime audit, and the pre-rebuild `PROGRESS.md` history (now in git history). When this file and the repo disagree, the repo wins; update this file when a phase materially changes an area.

## Verdict in one paragraph

The organizer platform, payments, and SaaS layer are broadly implemented and pass their repository gates. The attendee self-service layer (account, transfers, recovery, raffle visibility, custom email delivery) was completed in the July 2026 gap-remediation cycle. What is **not** healthy: expected user errors still render blank pages across ~180 call sites (runtime audit Batches 1–5 remain open), the full E2E suite is red (88 passed / 5 failed / 6 did not run), one open-redirect security defect is unfixed (CHK-02), and all external launch evidence is still outstanding. Feature-wise the product diverges from ConCat in known, catalogued ways — see `02-concat-parity.md`.

## Implemented inventory by area

**Identity & account** — Credentials auth (Auth.js v5), register/login/forgot/reset (hashed one-hour single-use tokens, `authVersion` JWT invalidation), central `/account` area: overview, profile, registrations + detail, orders + detail, hotel bookings, volunteer/vendor application status, transfers (accept/decline), raffles. Public flows require a session; records bind to `session.user.id` with owner-bound reads.

**Tenancy & platform** — Managed invite-only provisioning (`/platform/organizations`), org lifecycle (PROVISIONING/ACTIVE/SUSPENDED/RETIRED), hashed single-use org invitations, member management, custom-domain request → platform verification/activation with audit, `/platform/payments` (provider config, exceptions, payouts, refunds), `/platform/operations/email`. Platform routes separately guarded.

**Events & registration** — Event wizard (immutable USD/VND currency), tiers (`RegistrationType`, capacity, `scheduledPricing` JSON field exists), tier add-ons, public portal registration, registration policy enforcement (`requireApproval` via separate `approvalStatus`, `allowTransfers`, `maxRegistrationsPerUser`, per-tier caps, serializable + retry), tier upgrades, cashier walk-ins, voucher-backed registration, recipient-owned transfer requests (durable state machine, signed email handoff, badge rekey, organizer override), organizer registration list/detail/notes.

**Commerce** — Store products (CRUD, stock, category, images/options/surcharges as per-product JSON), DB-backed cart, provider-neutral shared checkout `/checkout/[orderId]`, Stripe Connect destination charges, SePay VietQR (signed webhooks, dedup, reconciliation cursor, exceptions, ledger, payouts, refunds), single-active-payment-attempt lock, organizer refunds, vouchers (code-based, USD/VND), hotel blocks/bookings with cutoff + platform fee, currency-bucketed fee reporting/analytics/CSV.

**People** — Volunteer applications (custom per-department `formSchema`, availability), organizer review + bulk decisions, departments, staff roles/shifts, assignment emails, staff-message template; vendor applications (business info, constrained uploads), review/decisions, booth assignment + VND-correct booth payment.

**Event day** — Check-in dashboard (bounded 25-row search), express kiosk with camera QR scan, cashier station (walk-in + payment, currency-correct), offline check-in service worker, badge designer (react-konva, text/barcode/QR/image layers, tenant-owned S3 assets), worker badge render to real PDF images and ZPL `^GFA` bitmaps, WebUSB direct print, `printedAt` only after direct success or explicit PDF confirmation.

**Raffle (prize semantics)** — Eligibility rules (confirmed/checked-in/tier/add-on/purchased with `entriesPerUnit`), weighted entries, per-user quota, idempotent PURCHASED fulfillment inside the paid transaction, immutable draw results, winner notification tracking, `/account/raffles`.

**Email** — Encrypted PostgreSQL outbox + attempts + dead letters + recovery, event-level template overrides for five message families (registration confirmation, payment receipt, volunteer decision, vendor decision, transfer request) with variable allowlists, preview, fallback; Mailpit-verified delivery through the worker.

**API/SaaS** — REST `/api/v1` (events, registrations, attendees, vendors, store, badges) + OpenAPI, scoped hashed API keys, signed outbound webhooks, shared Redis rate limits (fail-closed auth/API/payment, fail-open signed webhooks), Sentry wiring, marketing/legal/docs pages.

**Split runtime (frozen)** — `apps/platform-manager` (identity issuer: PKCE, Ed25519 assertions, central session revocation) + `apps/tenant-web` + `@vfurst/auth`/`contracts`/`tenant-context` + edge topology on ports 3200/3201/3100. No production traffic; `apps/web` remains canonical. Eleven SPL defects catalogued; do not advance without a recorded cutover decision (phase-1).

## Evidence snapshot (as of 2026-07-26)

| Gate | Result |
|---|---|
| `turbo run type-check lint test` | 32/32 tasks pass (133 web unit tests) |
| `turbo run build` | 10/10 (known BullMQ dynamic-dependency warning) |
| `npm run test:split-topology` | 5/5 |
| Full E2E (`E2E_PRODUCTION=1`) | **88 passed / 5 failed / 6 did not run** — red since 2026-07-17; failures = TST-01 stale hero assertions, DAT-01 outbox FK teardown, one documented 4-worker contention flake |
| Load proof (2026-07-14, 500 reg + 50 check-in VUs, 6 replicas, pool 4) | 198,024 requests, 0.00% failures, 396,045/396,045 checks, overall p95 409.88 ms (gate 1.5 s) |
| `npm audit --audit-level=moderate` | 0 vulnerabilities (last verified 2026-07-14) |

Do not record pass claims from focused runs — that practice hid the red suite for nine days.

## Known defects

The register lives in `docs/launch/runtime-defect-audit-2026-07-26.md`. Status: **Batch 0 (ENV-01/02, SPL-01) complete 2026-07-26** — every runtime loads its own env file; tenant subdomains 200 under plain `npm run dev`; worker starts; Mailpit delivery proven. **Batches 1–6 open**, highest impact first: no `error.tsx` anywhere + `/login` 500 (ERR-01/02), ~41 P1 blank-page sites on ordinary input (ERR-03), open redirect via checkout `successPath` (CHK-02, security), store checkout 404 on tenant hosts (CHK-01), reserved subdomains 404 (RTE-01), malformed Host 500 (RTE-02), outbox FK pins organizations (DAT-01), stale E2E assertions (TST-01).

## Outstanding external launch evidence

Two platform-provisioned beta conventions; live deployment + marketing verification; production Sentry; real SePay Sandbox QR/webhook/reconciliation/expiry/exception/payout/refund evidence; physical NVDA/VoiceOver pass; physical Zebra direct-print (or explicit PDF fallback) proof. Tracked in `docs/launch/go-live-checklist.md` — none can be closed from code.

## Local environment note

On 2026-07-26 the local Docker volumes were wiped during the plan rebuild (the dev database had accumulated 72 organizations / 68,056 users of fixture residue that DAT-01 made undeletable) and the stack was re-provisioned from the current schema. Build/test caches (`.turbo`, `.next`, Playwright artifacts) were cleared at the same time. Evidence in the table above predates the wipe; re-run gates before relying on them.

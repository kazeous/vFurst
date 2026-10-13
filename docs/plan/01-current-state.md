# Current state — repository snapshot, 2026-07-30

> Snapshot of what actually exists and what evidence backs it, compiled during the plan-v2 rebuild from the repository, the 2026-07-26 runtime audit, and the pre-rebuild `PROGRESS.md` history (now in git history). When this file and the repo disagree, the repo wins; update this file when a phase materially changes an area.

## Verdict in one paragraph

The canonical `apps/web` runtime, worker, organizer platform, payments, and core SaaS layer are implemented. Phase 1's runtime-error, route, checkout-return, test, and dependency gates are closed; the latest full production E2E evidence is **118 passed / 0 failed / 0 did not run** (2026-07-29). Phase 2 has not started, so the known attendee, catalog, cashier, moderation, dealer, and registration-lottery parity work remains intentional backlog. Phase 6 remains blocked solely by external launch evidence. Feature gaps and their scheduled units live in `02-concat-parity.md`; this document is a snapshot and never supersedes the repository or `PROGRESS.md`.

## Implemented inventory by area

**Identity & account** — Credentials auth (Auth.js v5), register/login/forgot/reset (hashed one-hour single-use tokens, `authVersion` JWT invalidation), central `/account` area: overview, profile, registrations + detail, orders + detail, hotel bookings, volunteer/vendor application status, transfers (accept/decline), raffles. Public flows require a session; records bind to `session.user.id` with owner-bound reads.

**Tenancy & platform** — Managed invite-only provisioning (`/platform/organizations`), org lifecycle (PROVISIONING/ACTIVE/SUSPENDED/RETIRED), hashed single-use org invitations, member management, custom-domain request → platform verification/activation with audit, `/platform/payments` (provider config, exceptions, payouts, refunds), `/platform/operations/email`. Platform routes separately guarded.

**Events & registration** — Event wizard (immutable USD/VND currency), tiers (`RegistrationType`, capacity, `scheduledPricing` JSON field exists), tier add-ons, public portal registration, registration policy enforcement (`requireApproval` via separate `approvalStatus`, `allowTransfers`, `maxRegistrationsPerUser`, per-tier caps, serializable + retry), tier upgrades, cashier walk-ins, voucher-backed registration, recipient-owned transfer requests (durable state machine, signed email handoff, badge rekey, organizer override), organizer registration list/detail/notes.

**Commerce** — Store products (create/edit, stock, category, images/options/surcharges as per-product JSON) now use a reversible soft archive: archived products leave the public catalog, catalog API, raffle-product selector, and active carts; historical and provider-backed orders remain intact. Product policy, reusable option/surcharge libraries, universal add-ons, fulfillment, claim labels, and staff unpaid-order operations remain Phase 3 work. The DB-backed cart and provider-neutral `/checkout/[orderId]` support Stripe Connect destination charges and SePay VietQR (signed webhooks, dedup, reconciliation cursor, exceptions, ledger, payouts, refunds) with a single-active-payment-attempt lock. Organizer refunds, USD/VND vouchers, hotel blocks/bookings, and currency-bucketed fee reporting/analytics/CSV exist.

**People** — Volunteer applications (custom per-department `formSchema`, availability), organizer review + bulk decisions, departments, staff roles/shifts, assignment emails, staff-message template; vendor applications (business info, constrained uploads), review/decisions, booth assignment + VND-correct booth payment.

**Event day** — Check-in dashboard (bounded 25-row search), express kiosk with camera QR scan, cashier station (walk-in + payment, currency-correct), offline check-in service worker, badge designer (react-konva, text/barcode/QR/image layers, tenant-owned S3 assets), worker badge render to real PDF images and ZPL `^GFA` bitmaps, WebUSB direct print, `printedAt` only after direct success or explicit PDF confirmation.

**Raffle (prize semantics)** — Eligibility rules (confirmed/checked-in/tier/add-on/purchased with `entriesPerUnit`), weighted entries, per-user quota, idempotent PURCHASED fulfillment inside the paid transaction, immutable draw results, winner notification tracking, `/account/raffles`.

**Email** — Encrypted PostgreSQL outbox + attempts + dead letters + recovery, event-level template overrides for five message families (registration confirmation, payment receipt, volunteer decision, vendor decision, transfer request) with variable allowlists, preview, fallback; Mailpit-verified delivery through the worker.

**API/SaaS** — Read-only REST `/api/v1` (events, registrations, attendees, vendors, store, badges) + OpenAPI, scoped hashed API keys, signed outbound webhooks, shared Redis rate limits (fail-closed auth/API/payment, fail-open signed webhooks), Sentry wiring, marketing/legal/docs pages. It does not yet provide the broader legacy/v0 role, volunteer, department, current-user, or stable business-error surface catalogued in `02-concat-parity.md`.

**Split runtime** — removed in Phase 1B unit 1B.1 (2026-10-13); apps/web is the only serving runtime.

## Evidence snapshot

| Gate | Result |
|---|---|
| `turbo run type-check`, `lint`, `test` | 9/9, 9/9, 14/14 (web 190/190) on 2026-07-29 |
| `turbo run build` | 10/10 on 2026-07-29 (known BullMQ dynamic-dependency warning) |
| Full E2E (`E2E_PRODUCTION=1`) | **118 passed / 0 failed / 0 did not run** on 2026-07-29 (one worker) |
| Load proof (2026-07-14, 500 reg + 50 check-in VUs, 6 replicas, pool 4) | 198,024 requests, 0.00% failures, 396,045/396,045 checks, overall p95 409.88 ms (gate 1.5 s) |
| `npm audit --audit-level=moderate` | 0 vulnerabilities (clean install verified 2026-07-29) |

Do not record pass claims from focused runs — that practice hid the red suite for nine days.

## Known runtime and planning status

Runtime audit Batches 0–5, the plain-dev walkthrough, and dependency closeout are complete. Batch 6 (split-runtime hardening/cutover) remains deliberately frozen; `apps/web` is the canonical serving runtime. The remaining work is product parity, not an untriaged Phase 1 defect list: Phase 2 begins with attendee profiles; Phases 3–5 own the scheduled commerce, operations, and lottery work. The soft-archive correction added in this snapshot still needs the normal session verification recorded in `PROGRESS.md`; it is not a claim that Phase 3 is complete.

## Outstanding external launch evidence

Two platform-provisioned beta conventions; live deployment + marketing verification; production Sentry; real SePay Sandbox QR/webhook/reconciliation/expiry/exception/payout/refund evidence; physical NVDA/VoiceOver pass; physical Zebra direct-print (or explicit PDF fallback) proof. Tracked in `docs/launch/go-live-checklist.md` — none can be closed from code.

## Local environment note

On 2026-07-26 the local Docker volumes were wiped during the plan rebuild (the dev database had accumulated 72 organizations / 68,056 users of fixture residue that DAT-01 made undeletable) and the stack was re-provisioned from the current schema. Build/test caches (`.turbo`, `.next`, Playwright artifacts) were cleared at the same time. Evidence in the table above predates the wipe; re-run gates before relying on them.

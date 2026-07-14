# Full system audit — July 13, 2026

## Verdict

**Blocked.** The repository has complete planned artifact coverage and its compiler/test suite is green, but the implementation does not yet fulfill the complete security, multi-currency, badge-printing, and transfer contracts. Phases 1–6 remain substantially implemented; their “verified complete” status is reopened until the blocking findings below are remediated and regression-tested.

## Scope and method

- Reconciled the Operational Calm UI/UX, `[orgSlug]` public route contract, Stripe/SePay checkout architecture, 41-model schema, and launch gates into `implementation_plan.md` and `docs/plan/`.
- Read the reference, every phase artifact contract, and the phase verification checklist as an explicit cross-phase audit.
- Compared every backticked `[NEW]` path with the workspace using literal-path checks.
- Compared the 29 product/tenant models, 4 Auth.js models, and 8 payment/settlement models with `schema.prisma`.
- Inspected organizer/public routes, server actions, API/webhook handlers, worker jobs, currency formatting/parsing, rate limiting, S3 upload boundaries, badge output flow, and launch-readiness evidence.
- Ran the repository verification commands listed below.

## Coverage that is fulfilled

| Area | Result | Evidence |
|---|---|---|
| Planned artifacts | Pass | 95/95 exact `[NEW]` paths exist after correcting the public route contract to `(convention)/[orgSlug]/...`. |
| Prisma structure | Pass | 41/41 maintained models exist; `prisma validate` passes. |
| Monorepo boundaries | Pass | Web, worker, DB, email, API contracts, launch docs, scripts, E2E, and load-test areas exist in the maintained structure. |
| Operational Calm surfaces | Pass in automated scope | Organizer/public/marketing/auth/docs/event-day routes build; axe, keyboard, responsive, and screenshot E2E coverage passes. |
| Stripe/SePay happy paths | Pass in automated scope | Signed SePay webhook, QR checkout, polling, idempotent fulfillment, and Stripe/zero-value critical paths are represented and pass current E2E/unit tests. |
| Dependency audit | Pass | `npm audit --audit-level=moderate` reports 0 vulnerabilities. |

## Blocking findings

### SEC-01 — Organization pages expose cross-tenant data (P0)

`dashboard/organizations/[orgId]/page.tsx`, `members/page.tsx`, and `stripe-connect/page.tsx` query any organization UUID after only the top-level dashboard login check. They do not call `requireOrgAccess` and there is no organization-scoped parent layout. A logged-in user who knows another organization UUID can read its member identities, events, and Stripe Connect account/status.

Required remediation: add one `[orgId]` authorization boundary (or guards on every route), return a controlled 404/403, and add owner/admin/member/cross-organization E2E cases.

### SEC-02 — Server actions authorize one tenant and mutate another resource (P0)

Multiple action modules trust hidden `orgId`/`eventId` fields for membership authorization, then call `update`, `delete`, or `findUniqueOrThrow` using a bare resource UUID. Examples include events/tiers/add-ons, registrations/notes/transfers, products, hotel bookings, volunteer applications/assignments, badges/check-in, vendors, and raffles.

An owner/admin can submit an organization they control together with a resource UUID from another tenant. The membership check passes, while the unscoped mutation targets the foreign record. Some bulk operations already use `orgId` and `eventId`; single-record paths do not consistently do so.

Required remediation: centralize resource-aware authorization (`requireEventAccess(eventId)` and scoped loaders), stop accepting authorization scope from hidden inputs where it can be derived, use `findFirst`/`updateMany` with tenant predicates or verified resource IDs, and add cross-tenant mutation tests for every action family.

### SEC-03 — Stripe webhook verification fails open (P0)

`api/webhooks/stripe/route.ts` verifies a signature only when both the webhook secret and signature are present. Otherwise it parses and processes arbitrary JSON. In a deployment missing `STRIPE_WEBHOOK_SECRET`, an unauthenticated caller can forge `checkout.session.completed` or `payment_intent.succeeded` metadata and mark a pending order paid.

Required remediation: require `STRIPE_WEBHOOK_SECRET` in production, reject absent/invalid signatures in every environment except an explicit test harness, and make the launch-readiness gate validate the secret.

### FIN-01 — Organization fee reporting mixes USD and VND (P1)

`lib/billing/reports.ts` and `worker/jobs/reconcile-fees.ts` aggregate every paid order for an organization into one integer total, assume fixed 100-cent attendee/hotel fees, and label discrepancies as cents. The billing page formats every aggregate as USD. An organization with USD and VND events therefore combines cents and whole đồng into meaningless totals and expected-fee calculations.

Required remediation: group reports by currency and provider/event, use immutable `Order.platformFee` plus the configured fixed-fee contract, expose currency in every line/history entry, and add mixed-USD/VND tests.

### FIN-02 — VND organizer editors and cashier use USD conversion (P1)

Registration-tier, scheduled-price, add-on, hotel, store, booth, vendor-approval, and cashier forms divide stored values by 100 and use `step="0.01"` regardless of event currency. The cashier action always calls `dollarsToCents`, always assigns the 100-cent platform fee, leaves “card terminal” orders pending while checking in the attendee, and marks a badge printed without invoking a printer.

Required remediation: use shared currency-aware form helpers, whole-đồng inputs for VND, provider-aware fee capture, an atomic paid/check-in transition, and tests that round-trip existing VND values without changing them.

### PAY-01 — Active payment-attempt locking is race-prone (P1)

`checkout-actions.ts` checks for an active attempt and creates the next attempt in separate database operations. Two concurrent requests can both pass the check and create Stripe/SePay attempts for one order; the schema has no uniqueness rule enforcing one active attempt.

Required remediation: serialize attempt creation with a database lock/advisory lock or a schema-backed single-active-attempt invariant, then add a concurrent-start test.

Remediation update (July 14, 2026): implemented a nullable unique `PaymentAttempt.activeOrderId` lock, serializable reservation/settlement/review transitions, Stripe idempotency metadata, terminal lock release, safe legacy backfill, and concurrent same-provider/cross-provider/stale-callback/replay regressions. `PAY-01` is closed against the current inventory; this paragraph preserves the original audit finding above as historical evidence.

### SEC-04 — Store/vendor uploads are unbounded and type-unrestricted (P1)

Public vendor files and organizer product images are read fully into server memory and uploaded with caller-supplied content types. Unlike event branding, these paths have no size, MIME, extension, or image/file allowlist constraints. This creates memory-exhaustion and unsafe-public-object risk.

Required remediation: enforce separate product-image and vendor-document policies before `arrayBuffer()`, sanitize generated object names, and test rejected size/type cases.

## Planned functionality not yet end-to-end

### FUNC-01 — Badge PDF/ZPL output is not reachable from the UI (P2)

The worker generates a PDF URL and `zplOutput`, and `webusb-printer.ts` contains a driver, but no application code imports the driver. Worker results are not persisted to badge/event records or exposed by the badge page. The UI’s “Reprint/Mark printed” action only timestamps the database, and image layers render as placeholders rather than stored images.

Required remediation: persist render artifacts/status, expose PDF download and WebUSB queue controls, write printed timestamps only after successful print/fallback confirmation, render actual image assets, and perform the physical Zebra/PDF checkpoint.

### FUNC-02 — Recipient registration transfer workflow is absent (P2)

The plan requires a recipient email with accept/decline. The current request action sends a message saying staff can complete the transfer; there is no durable request/token, recipient route, accept/decline state, or recipient identity verification.

Required remediation: add a durable expiring transfer request, signed recipient route, accept/decline transitions, replay protection, email integration, and E2E coverage.

## Architecture/operations follow-up

- Rate limits use process-local `Map` instances. They reset on restart and multiply across the 16-replica load topology; production enforcement needs a shared Redis-backed store.

Remediation update (July 14, 2026): auth, public API-key, payment/refund, Stripe webhook, and SePay webhook limits now use one Redis fixed-window counter with an atomic Lua `INCR`/TTL operation. Subjects are SHA-256 hashed before entering Redis. Auth/API/payment controls fail closed when Redis is unavailable; cryptographically signed, idempotent provider callbacks fail open and log the degraded control so settlement is not lost during a Redis outage. Unit coverage proves both failure policies, and a real-Redis Playwright regression uses two independent clients to prove one shared quota, atomic concurrency, and TTL expiry. The original bullet above is retained as historical evidence; the process-local rate-limit finding is closed against the current inventory.
- The reference still names Server-Sent Events, but no SSE endpoint or client exists and no phase artifact requires one. Decide whether to remove that architecture promise or implement it before calling the plan fully fulfilled.
- The launch-readiness script currently validates Sentry values but not Stripe webhook, SePay webhook/API, or checkout-token secrets. It also trusted the stale security-audit wording until this audit reopened it.
- Existing external blockers remain: two beta conventions, live deployment/marketing verification, production Sentry, real SePay Sandbox evidence, and a physical NVDA/VoiceOver pass.

## Verification evidence

| Check | Result |
|---|---|
| `npm run type-check` | Pass |
| `npm run lint` | Pass |
| `npm run test` | Pass — 24/24 web unit tests; DB/email/worker have no test files |
| `npm run db:validate` | Pass |
| `npm run build` | Pass with the known BullMQ dynamic-import warning |
| `npm audit --audit-level=moderate` | Pass — 0 vulnerabilities |
| `npm run test:e2e` | Pass — 13/13 Chromium tests |
| Planned-artifact literal-path audit | Pass — 95/95 |
| Maintained-model audit | Pass — 41/41 |
| `npm run test:load:smoke` | Not rerun: local k6 is absent; the Docker fallback was rejected because it would inject local test credentials into a public third-party container. Prior July 13 smoke evidence remains recorded. |
| `npm run check:launch` | Expected fail — 8 failures before this security audit was corrected: Sentry ×5, beta evidence, physical screen reader, and live URL. Security now adds a blocking finding. |

## Completion rule

Do not deploy or mark Phase 7 complete until SEC-01 through SEC-04, FIN-01/02, and PAY-01 are fixed and covered by regression tests. FUNC-01/02 and the external evidence must be resolved before claiming the complete planned product is fulfilled.

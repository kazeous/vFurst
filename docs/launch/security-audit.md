# Phase 6 Security Audit

Date: July 13, 2026

Last repository remediation update: July 29, 2026

## Status

**Public launch remains blocked.** The current inventory has remediated `SEC-01` organization containment, `SEC-02` resource-derived authorization, constrained upload families, outbound webhook SSRF/signing, `SEC-03` fail-closed Stripe webhook verification, managed lifecycle/control-plane separation, currency-safe reporting, schema-backed payment-attempt serialization, shared production rate limiting, and unbounded Prisma connection growth. The fresh supported-topology 500/50 load proof also passes its correctness, HTTP-error, and p95 latency gates. The dependency gate reopened on July 29 after new advisories appeared and now blocks Phase 1 as well as launch. External launch evidence remains open. The original findings are preserved in `docs/launch/full-system-audit-2026-07-13.md`; implementation evidence is recorded chronologically in `PROGRESS.md`.

**Blocking finding:** the vulnerable-component inventory below has no recorded remediation or explicit accept/defer decision.

## Scope

- Next.js app routes, middleware, API routes, and server actions.
- Prisma schema and tenant scoping.
- Stripe Connect and SePay payment paths.
- Public REST API and webhook delivery.
- Authentication, organization RBAC, upload boundaries, and production configuration gates.

## OWASP review

| Area | Status | Evidence |
|---|---|---|
| Broken access control | Remediated against current inventory | Organization/event route containment plus resource-derived action, API, export, upload, and payment-operation tests cover platform admin, unrelated owners, org admin/member, and public personas. |
| Cryptographic failures | Pass for implemented inbound providers | SePay fails closed on HMAC/timestamp validation. Stripe now rejects missing/placeholder signing configuration with `503`, rejects missing/invalid/stale signatures with `400`, and parses only the exact raw body returned by the Stripe SDK verifier. |
| Injection | No SQL/CSV injection finding in current scope | Database access uses Prisma query builders. Shared CSV serialization neutralizes spreadsheet formulas in user-controlled strings and escapes quoted content. |
| Insecure design | Remediated against the current payment inventory | Currency-separated reporting, currency-aware editors/cashier collection, and one schema-backed authoritative payment attempt per order are covered by mixed-currency, concurrent-start, provider-lock, stale-callback, exception-review, and replay regressions. |
| Security misconfiguration | Repository control remediated; external configuration remains | Launch readiness rejects placeholder Stripe signing configuration; requires runtime/direct Postgres URLs, positive pool limits/timeouts, and a replica-aware connection budget; requires a valid shared `REDIS_URL`; and validates every production rate-limit quota as a positive integer. SePay/checkout secrets remain explicit manual go-live gates. |
| Vulnerable components | Open — Phase 1 blocker | The July 29 audit reports 33 vulnerabilities (31 high, 2 critical), including 24 in the production dependency tree. The July 14 clean result is superseded; see the review below. |
| Identification/auth failures | Pass for the current managed-tenant scope | Auth.js credentials validation, organizer authorization, email-bound single-use invitation onboarding, platform-only lifecycle transitions, and suspension/retirement enforcement are covered by persona and lifecycle regressions. |
| Software/data integrity failures | Pass for current webhook paths | Outbound webhooks use per-endpoint HMAC, stable delivery IDs, tenant-bound endpoint loading, and public-target enforcement. SePay and Stripe inbound callbacks are signed and idempotent. |
| Logging/monitoring failures | External blocker | Sentry wiring exists, but real production DSN/org/project/token evidence is absent. |
| SSRF | Remediated for outbound webhook delivery | Endpoint configuration requires public HTTPS DNS targets; delivery rejects private/mixed DNS answers, pins the verified address with TLS hostname checks, refuses redirects, and times out. |
| Unsafe uploads | Remediated for current upload families | Branding, product-image, and vendor-document paths enforce size/type policy before reading, verify supported content signatures where applicable, and use generated object names. |

## Dependency advisory review — July 29, 2026

This is exposure triage, not an acceptance or defer decision. `npm audit --audit-level=moderate` reports **33 vulnerabilities (31 high, 2 critical)**; `npm audit --omit=dev --audit-level=moderate` reports **24 (22 high, 2 critical)**. The audit currently marks the top-level Auth.js, Next.js, PostCSS, Sentry, Serwist, Tailwind PostCSS, Geist, ESLint, TypeScript ESLint, Vite, and Vitest chains as having no directly applicable automatic fix.

| Chain and installed version | Local exposure evidence | Required resolution |
|---|---|---|
| `next-auth` 5.0.0-beta.31 / `@auth/core` 0.41.2 / Prisma adapter 2.11.2 | Neither runtime calls `getToken()`. Neither config enables the Auth.js Email provider; credentials use the shared normalized identity lookup, and Google is the only OAuth provider in each auth surface. All repository `auth()` gates require `session.user.id` or a user email rather than session-object existence. The manager authorization endpoint additionally validates the stored identity-session ID, user ID, auth version, revocation state, and expiry. These controls narrow the malformed-Bearer, email-normalizer, provider-cookie, and configuration-error advisories but do not remove the vulnerable packages. | Upgrade the three-package Auth.js set to a mutually compatible patched release, then rerun auth unit tests and the full production E2E suite. Do not record acceptance solely from the narrowed call-site exposure. |
| Next.js 15.5.20 in all three runtimes | The web runtimes have no custom HTTP server, rewrites, Edge runtime, or custom image configuration, narrowing several SSRF/Edge/image variants. Server Actions are used extensively, so the App Router denial-of-service and other framework advisories remain relevant. | Upgrade all three runtimes and both matching Next ESLint plugins together to at least the patched boundary reported by the audit (`15.5.21`), subject to registry compatibility resolution and the full split/build/E2E gates. |
| PostCSS 8.5.16 override | The vulnerable previous-source-map loader is build tooling; no path accepting an untrusted source map was found in the application runtime. Next.js, Tailwind PostCSS, and Vite all consume the overridden version. | Move the root override beyond the affected `<=8.5.17` range and rerun lint, build, and E2E. |
| sharp 0.34.5 through Next.js | sharp is installed as Next.js's optional image dependency. The repo does process constrained image uploads and cannot treat inherited libvips defects as unreachable merely because no custom Next image configuration exists. | Upgrade to at least 0.35.0 through a compatible Next.js resolution or a reviewed override, then rebuild the native production images and exercise upload/image paths. |
| `brace-expansion` 1.1.15 and 5.0.7; `fast-uri` 3.1.3 | The 1.x brace chain is development-only through ESLint. The 5.x brace and fast-uri chains enter through Sentry/Serwist/Webpack schema/build tooling; no application request path calls them directly. | Prefer owner-package upgrades; use overrides only after compatibility review. Re-run install-script review, lint, build, and the complete audit. |

Owner: Phase 1 stabilization closeout. Revisit before Phase 1 can be marked complete and before any further staging/production rollout. Closure requires either a clean moderate-level audit or an explicit, dated acceptance/defer entry naming each remaining chain, the rationale, owner, compensating controls, and next review trigger. No such acceptance exists as of July 29.

## PCI and payment posture

Card data remains hosted by Stripe Checkout and is not stored by vFurst. The SAQ A-oriented boundary now includes signed callbacks and serialized active-attempt/settlement transitions with stale-capture exception evidence. SePay carries no cardholder data but still requires exact transfer matching, signed callbacks, exception review, ledger reconciliation, and controlled payout/refund evidence.

## Rate limiting

- Auth.js POST, public API-key, payment/refund action, Stripe webhook, and SePay webhook families use fixed-window limits backed by shared Redis.
- One atomic Lua operation increments the counter, attaches/repairs its TTL, and derives reset time from Redis. Independent web replicas therefore consume one quota, and restart does not reset the window.
- Counter subjects are SHA-256 hashed before storage. Existing scopes remain per client IP for auth/provider callbacks, per presented API key for REST calls, and per tenant/resource/user identity for payment and refund actions.
- Auth, public API, and payment/refund controls fail closed with a retryable error when Redis is unavailable. Signed, idempotent Stripe and SePay callbacks fail open and log the degraded control so a Redis outage cannot discard settlement events.
- Unit tests cover hashed keys and both failure policies. `tests/e2e/shared-rate-limit.spec.ts` uses two independent real Redis clients to prove one atomic quota and TTL expiry across instance boundaries.

## Required remediation and proof

1. **Done for the current inventory:** organization-route guards and resource-derived tenant authorization across action/export/upload families.
2. **Done:** unsigned, invalid, stale, missing-secret, and placeholder-secret Stripe webhook paths fail closed; readiness validates Stripe secrets.
3. **Done for `SEC-01` through `SEC-03`:** persona/cross-tenant and unsigned/signed/provider-disabled webhook regressions.
4. **Done:** add the 42-model schema, safe legacy-tenant backfill, and hashed/expiring/revocable/single-use owner/member invitation acceptance.
5. **Done:** add platform-only lifecycle transitions and enforce suspension/retirement without blocking settlement callbacks.
6. **Done:** separate USD/VND reporting and use currency-aware organizer editors and VND cashier collection.
7. **Done:** serialize attempt reservation, provider lock, settlement, exception review, expiry, and replay through one schema-backed active-attempt invariant.
8. **Done:** constrain store/vendor uploads before reading them into memory.
9. **Done for shared rate limiting:** replace process-local counters with atomic Redis counters, define route-family failure policy, and add multi-instance/TTL regressions.
10. **Done for connection exhaustion:** one Prisma singleton per process, bounded runtime pools, a direct administrative datasource, replica/budget/capacity readiness checks, and a zero-error 500/50 rerun replace the previous `P2037` failure mode.
11. **Reopened for vulnerable components:** type-check, lint, unit, Prisma, build, focused tenant/domain E2E, and the approved 500/50 load proof remain recorded, but the dependency gate became red on July 29. The current full production E2E and readiness results are recorded in `PROGRESS.md`; dependency closure follows the decision gate above.

The repository rate-limit finding is closed. Public launch remains blocked until external monitoring and the remaining full launch-proof items are completed and the audit is repeated against the deployed environment.

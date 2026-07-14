# Phase 7 Security Audit

Date: July 13, 2026

Last repository remediation update: July 14, 2026

## Status

**Public launch remains blocked.** The current inventory has remediated `SEC-01` organization containment, `SEC-02` resource-derived authorization, constrained upload families, outbound webhook SSRF/signing, `SEC-03` fail-closed Stripe webhook verification, managed lifecycle/control-plane separation, currency-safe reporting, schema-backed payment-attempt serialization, and shared production rate limiting. External launch evidence remains open. The original findings are preserved in `docs/launch/full-system-audit-2026-07-13.md`; implementation evidence is recorded chronologically in `PROGRESS.md`.

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
| Security misconfiguration | Repository control remediated; external configuration remains | Launch readiness rejects placeholder Stripe signing configuration, requires a valid shared `REDIS_URL`, and validates every production rate-limit quota as a positive integer. SePay/checkout secrets remain explicit manual go-live gates. |
| Vulnerable components | Clean | `npm audit --audit-level=moderate` reports 0 vulnerabilities on July 14, 2026. |
| Identification/auth failures | Pass for the current managed-tenant scope | Auth.js credentials validation, organizer authorization, email-bound single-use invitation onboarding, platform-only lifecycle transitions, and suspension/retirement enforcement are covered by persona and lifecycle regressions. |
| Software/data integrity failures | Pass for current webhook paths | Outbound webhooks use per-endpoint HMAC, stable delivery IDs, tenant-bound endpoint loading, and public-target enforcement. SePay and Stripe inbound callbacks are signed and idempotent. |
| Logging/monitoring failures | External blocker | Sentry wiring exists, but real production DSN/org/project/token evidence is absent. |
| SSRF | Remediated for outbound webhook delivery | Endpoint configuration requires public HTTPS DNS targets; delivery rejects private/mixed DNS answers, pins the verified address with TLS hostname checks, refuses redirects, and times out. |
| Unsafe uploads | Remediated for current upload families | Branding, product-image, and vendor-document paths enforce size/type policy before reading, verify supported content signatures where applicable, and use generated object names. |

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
10. Rerun type-check, lint, unit, Prisma, build, dependency, E2E, security, and approved load gates.

The repository rate-limit finding is closed. Public launch remains blocked until external monitoring and the remaining full launch-proof items are completed and the audit is repeated against the deployed environment.

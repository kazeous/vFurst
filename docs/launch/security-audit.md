# Phase 7 Security Audit

Date: July 13, 2026

Last repository remediation update: July 14, 2026

## Status

**Blocking finding remains. Public launch is blocked.** The current inventory has remediated `SEC-01` organization containment, `SEC-02` resource-derived authorization, constrained upload families, outbound webhook SSRF/signing, `SEC-03` fail-closed Stripe webhook verification, and hashed/expiring/revocable/single-use organization invitations. Payment-attempt serialization, mixed-currency reporting, shared production rate limiting, lifecycle transition/enforcement controls, control-plane separation, and external evidence remain open. The original findings are preserved in `docs/launch/full-system-audit-2026-07-13.md`; implementation evidence is recorded chronologically in `PROGRESS.md`.

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
| Insecure design | **Blocking payment correctness findings** | Mixed-currency fee reporting and race-prone active-attempt locking still violate the provider-neutral payment contract; currency-aware organizer editors and VND cashier collection are remediated. |
| Security misconfiguration | **Blocking follow-up remains** | Launch readiness now validates Stripe's secret key and webhook signing secret and rejects placeholders. SePay/checkout secrets are still manual gates, and production rate limits are process-local. |
| Vulnerable components | Clean | `npm audit --audit-level=moderate` reports 0 vulnerabilities on July 14, 2026. |
| Identification/auth failures | Partial | Auth.js credentials validation, current organizer authorization, and email-bound single-use invitation onboarding are covered. Platform lifecycle transitions and suspension enforcement remain pending. |
| Software/data integrity failures | Pass for current webhook paths | Outbound webhooks use per-endpoint HMAC, stable delivery IDs, tenant-bound endpoint loading, and public-target enforcement. SePay and Stripe inbound callbacks are signed and idempotent. |
| Logging/monitoring failures | External blocker | Sentry wiring exists, but real production DSN/org/project/token evidence is absent. |
| SSRF | Remediated for outbound webhook delivery | Endpoint configuration requires public HTTPS DNS targets; delivery rejects private/mixed DNS answers, pins the verified address with TLS hostname checks, refuses redirects, and times out. |
| Unsafe uploads | Remediated for current upload families | Branding, product-image, and vendor-document paths enforce size/type policy before reading, verify supported content signatures where applicable, and use generated object names. |

## PCI and payment posture

Card data remains hosted by Stripe Checkout and is not stored by vFurst. The SAQ A-oriented boundary, signed callbacks, and tenant controls do not compensate for the remaining mixed-currency reporting or concurrent-attempt risks. SePay carries no cardholder data but still requires exact transfer matching, signed callbacks, exception review, ledger reconciliation, and controlled payout/refund evidence.

## Rate limiting

- Auth.js POST, Stripe webhook, payment actions, and public API keys have fixed-window limits.
- Current stores are in-memory `Map` instances, so limits reset on process restart and multiply across replicas.
- Move production counters to shared Redis before relying on these limits as a launch control.

## Required remediation and proof

1. **Done for the current inventory:** organization-route guards and resource-derived tenant authorization across action/export/upload families.
2. **Done:** unsigned, invalid, stale, missing-secret, and placeholder-secret Stripe webhook paths fail closed; readiness validates Stripe secrets.
3. **Done for `SEC-01` through `SEC-03`:** persona/cross-tenant and unsigned/signed/provider-disabled webhook regressions.
4. **Done:** add the 42-model schema, safe legacy-tenant backfill, and hashed/expiring/revocable/single-use owner/member invitation acceptance.
5. Add platform-only lifecycle transitions and enforce suspension/retirement without blocking settlement callbacks.
6. Separate USD/VND reporting. Currency-aware organizer editors and VND cashier collection are done.
7. Serialize payment-attempt creation.
8. **Done:** constrain store/vendor uploads before reading them into memory.
9. Rerun type-check, lint, unit, Prisma, build, dependency, E2E, security, and approved load gates.

The launch security gate remains failed until the remaining payment correctness, lifecycle/control-plane, production rate-limit, external-monitoring, and full launch-proof items are implemented and the audit is repeated.

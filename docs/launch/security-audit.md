# Phase 7 Security Audit

Date: July 13, 2026

## Status

**Blocking finding. Public launch is blocked.** The dependency audit is clean, but the full-system review found broken organization-route authorization, cross-tenant mutation paths, and a fail-open Stripe webhook configuration path. Detailed evidence and broader findings are in `docs/launch/full-system-audit-2026-07-13.md`.

## Scope

- Next.js app routes, middleware, API routes, and server actions.
- Prisma schema and tenant scoping.
- Stripe Connect and SePay payment paths.
- Public REST API and webhook delivery.
- Authentication, organization RBAC, upload boundaries, and production configuration gates.

## OWASP review

| Area | Status | Evidence |
|---|---|---|
| Broken access control | **Blocking** | Three organization pages query arbitrary organization UUIDs without `requireOrgAccess`. Many single-record actions authorize a submitted organization ID, then mutate a bare foreign resource UUID without verifying ownership. |
| Cryptographic failures | **Blocking when misconfigured** | SePay fails closed on missing/invalid HMAC, but Stripe accepts unsigned JSON when `STRIPE_WEBHOOK_SECRET` or the request signature is absent. |
| Injection | No SQL-injection finding | Database access uses Prisma query builders. Boundary validation coverage is uneven for file uploads and must not be described as universal. |
| Insecure design | **Blocking payment correctness findings** | Mixed-currency fee reporting, VND cashier conversion, and race-prone active-attempt locking violate the provider-neutral payment contract. |
| Security misconfiguration | **Blocking** | Launch readiness checks Sentry but does not require Stripe/SePay webhook or checkout-token secrets. Production rate limits are process-local. |
| Vulnerable components | Clean | `npm audit --audit-level=moderate` reports 0 vulnerabilities on July 13, 2026. |
| Identification/auth failures | Partial | Auth.js credentials validation exists, but organization/member route authorization is incomplete. |
| Software/data integrity failures | Partial | Outbound webhooks and SePay webhooks are HMAC protected; inbound Stripe verification must fail closed. |
| Logging/monitoring failures | External blocker | Sentry wiring exists, but real production DSN/org/project/token evidence is absent. |
| SSRF | Follow-up | User-entered outbound webhook URLs still need a production allow/blocklist policy before enterprise rollout. |
| Unsafe uploads | **Blocking** | Store/vendor uploads have no size or type policy and buffer caller-controlled files in server memory. |

## PCI and payment posture

Card data remains hosted by Stripe Checkout and is not stored by vFurst. That SAQ A-oriented boundary does not compensate for forged webhook completion, cross-tenant mutations, mixed-currency reporting, or concurrent-attempt risks. SePay carries no cardholder data but still requires exact transfer matching, signed callbacks, exception review, ledger reconciliation, and controlled payout/refund evidence.

## Rate limiting

- Auth.js POST, Stripe webhook, payment actions, and public API keys have fixed-window limits.
- Current stores are in-memory `Map` instances, so limits reset on process restart and multiply across replicas.
- Move production counters to shared Redis before relying on these limits as a launch control.

## Required remediation and proof

1. Add organization-route guards and resource-derived tenant authorization to every mutation family.
2. Reject unsigned Stripe webhooks and require the secret in production/readiness checks.
3. Add cross-tenant read/mutation and unsigned-webhook regression tests.
4. Separate USD/VND reporting and repair VND organizer/cashier forms.
5. Serialize payment-attempt creation.
6. Constrain store/vendor uploads before reading them into memory.
7. Rerun type-check, lint, unit, Prisma, build, dependency, E2E, security, and approved load gates.

The launch security gate remains failed until these items are implemented and the audit is repeated.

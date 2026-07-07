# Phase 7 Security Audit

Date: July 7, 2026

## Scope

- Next.js app routes, middleware, API routes, and server actions.
- Prisma schema and tenant scoping.
- Stripe Connect payment paths.
- Public REST API and webhook delivery.
- Authentication and organization role enforcement.

## OWASP Top 10 review

| Area | Status | Evidence |
|------|--------|----------|
| Broken access control | Clean in reviewed launch paths | Dashboard actions call membership checks before org/event mutation; public API requires scoped API keys; tenant routes resolve through organization slug/custom domain. |
| Cryptographic failures | Clean in reviewed launch paths | Passwords use bcrypt; Stripe secrets remain env-driven; webhook secrets are generated per endpoint; card data stays in Stripe. |
| Injection | Clean in reviewed launch paths | Database access uses Prisma query builders; form/API inputs are validated with Zod before mutation. |
| Insecure design | No blocking finding | Stripe Connect destination charges are the single fee-collection path; reconciliation is read-only; launch docs include beta dry-run and rollback checks. |
| Security misconfiguration | No blocking finding | `.env.example` documents Sentry, Auth, Stripe, Redis, S3/MinIO, SMTP, and rate-limit configuration; production secrets are not embedded in source. |
| Vulnerable components | Blocking finding | `npm audit --audit-level=moderate` reports 27 vulnerabilities: high-severity `nodemailer` advisories through Auth.js/NextAuth with no fixed version, a high-severity `serialize-javascript` chain through Docusaurus tooling, a moderate `uuid` chain through webpack-dev-server, and the known Next/PostCSS advisory that requires a breaking forced audit fix. |
| Identification/auth failures | Clean in reviewed launch paths | Auth.js credentials validation is Zod-backed; auth POSTs now have fixed-window rate limiting. |
| Software/data integrity failures | Clean in reviewed launch paths | GitHub Actions exists; outbound webhooks are HMAC signed; generated service worker is build-produced and lint ignored. |
| Logging/monitoring failures | Clean after Phase 7 | Sentry App Router instrumentation, request error capture, client replay sampling, and global error capture are configured. |
| SSRF | No blocking finding | User-entered webhook URLs are used for outbound delivery; keep future allow/blocklist decisions in webhook worker scope before enterprise rollout. |

## PCI posture

vFurst remains SAQ A-oriented: payment card data is collected by Stripe Checkout, not by vFurst forms, and the database stores Stripe object IDs, totals, fees, and order states rather than full card numbers or security codes.

## Rate limiting

- Auth.js POST route: fixed-window IP limit via `VFURST_AUTH_RATE_LIMIT_PER_MINUTE`.
- Stripe webhook route: fixed-window IP limit via `VFURST_STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE`.
- Checkout/refund server actions: fixed-window action limits via `VFURST_PAYMENT_RATE_LIMIT_PER_MINUTE`.
- Public REST API keys: pre-existing per-key rate limiting with response headers.

## Launch follow-up

The application-control review is clean for the listed Phase 7 code paths, but the dependency audit is not clean. `npm audit fix` made no compatible changes. Public launch remains blocked until the dependency advisories are accepted with documented risk, upstream packages publish fixes, or the project explicitly approves breaking dependency changes or replacements.

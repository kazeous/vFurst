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
| Vulnerable components | Clean after remediation | `npm audit --audit-level=moderate` reports 0 vulnerabilities after replacing vulnerable launch tooling, aliasing SMTP delivery to `nodemailer@9.0.3`, and overriding Next's internal PostCSS resolution to `8.5.16`. |
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

The application-control review is clean for the listed Phase 7 code paths, and the dependency audit is clean after local dependency remediation.

Current dependency-audit evidence:

- `npm audit --audit-level=moderate` was rerun on July 7, 2026 after local remediation and reports 0 vulnerabilities.
- The Docusaurus docs workspace was replaced with a dependency-free static Markdown builder, removing the `serialize-javascript` and `uuid` advisory paths from launch tooling.
- SMTP delivery now imports `nodemailer-secure`, an npm alias for `nodemailer@9.0.3`, and the root `nodemailer` package is no longer installed. `npm ls nodemailer nodemailer-secure` shows only `nodemailer-secure@npm:nodemailer@9.0.3`.
- `next-auth@5.0.0-beta.31` and `@auth/core@0.41.2` still declare optional `nodemailer@^7.0.7` peers, but they are not satisfied by a vulnerable package in the installed tree.
- Current npm registry metadata still shows `next@15.5.20`, `next@15.6.0-canary.61`, and `next@16.2.10` declaring `postcss: 8.4.31`.
- A scoped `next -> postcss@8.5.16` override was tested first, but npm left the dependency tree invalid. The final package-level `postcss` override removes `node_modules/next/node_modules/postcss`, dedupes Next to the patched root `postcss@8.5.16`, and `npm ls postcss` reports `next@15.5.20 -> postcss@8.5.16 overridden`.

Public launch is no longer blocked by the dependency audit. The remaining Phase 7 launch blockers are external production evidence: the full k6 target run, real beta-convention onboarding, live marketing verification, production Sentry environment configuration, and a physical screen-reader pass.

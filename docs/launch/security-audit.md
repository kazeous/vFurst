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
| Vulnerable components | Blocking finding | `npm audit --audit-level=moderate` reports 27 vulnerabilities: high-severity `nodemailer` advisories through Auth.js/NextAuth, a high-severity `serialize-javascript` chain through Docusaurus tooling, a moderate `uuid` chain through webpack-dev-server, and the known Next/PostCSS advisory that requires a breaking forced audit fix. |
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

The application-control review is clean for the listed Phase 7 code paths, but the dependency audit is not clean.

Current dependency-audit evidence:

- `npm audit fix` was rerun on July 7, 2026 and left 27 vulnerabilities.
- Updating `nodemailer` to `9.0.3` clears the direct advisory but conflicts with `next-auth@5.0.0-beta.31`, which peer-depends on `nodemailer@^7.0.7`.
- `npm view next-auth@beta peerDependencies` still reports `nodemailer: ^7.0.7`, so there is no non-breaking NextAuth beta upgrade path for the fixed Nodemailer line.
- Docusaurus is already installed at `3.10.1`, but `@docusaurus/bundler` still pulls vulnerable `copy-webpack-plugin` / `css-minimizer-webpack-plugin` `serialize-javascript` paths and `webpack-dev-server` still pulls `sockjs -> uuid@8`.
- Root npm overrides for `serialize-javascript@7.0.7` and `uuid@11.1.1` were tested in broad and parent-scoped forms; npm 11 did not rewrite the installed Docusaurus tree.
- The Next/PostCSS advisory still points `npm audit fix --force` at `next@9.3.3`, which is incompatible with the planned Next.js 15 app.

Public launch remains blocked until these dependency advisories are accepted with documented risk, upstream packages publish compatible fixes, or the project explicitly approves replacing/breaking the affected dependencies.

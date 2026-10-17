# Phase 6 Security Audit

Date: July 13, 2026

Last repository remediation update: July 29, 2026

## Status

**Public launch remains blocked only on Phase 6 external evidence.** The current inventory has remediated `SEC-01` organization containment, `SEC-02` resource-derived authorization, constrained upload families, outbound webhook SSRF/signing, `SEC-03` fail-closed Stripe webhook verification, managed lifecycle/control-plane separation, currency-safe reporting, schema-backed payment-attempt serialization, shared production rate limiting, unbounded Prisma connection growth, and the dependency advisories reopened on July 29. The fresh supported-topology 500/50 load proof also passes its correctness, HTTP-error, and p95 latency gates. The original findings are preserved in `docs/launch/full-system-audit-2026-07-13.md`; implementation evidence is recorded chronologically in `PROGRESS.md`.

Phase 1B (October 2026) replaced staff password sign-in with the studio OIDC provider and moved attendees to per-organization portal accounts. The identification row below describes the July design; this audit has not been rerun against Phase 1B, whose identity evidence is in the Phase 1B entries of `PROGRESS.md`.

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
| Vulnerable components | Clean at the July 29 repository closeout | A clean install followed by `npm audit --audit-level=moderate` reports 0 vulnerabilities. The reviewed upgrades, native-image proof, and complete regression evidence are recorded below and in `PROGRESS.md`. |
| Identification/auth failures | Pass for the current managed-tenant scope | Auth.js credentials validation, organizer authorization, email-bound single-use invitation onboarding, platform-only lifecycle transitions, and suspension/retirement enforcement are covered by persona and lifecycle regressions. |
| Software/data integrity failures | Pass for current webhook paths | Outbound webhooks use per-endpoint HMAC, stable delivery IDs, tenant-bound endpoint loading, and public-target enforcement. SePay and Stripe inbound callbacks are signed and idempotent. |
| Logging/monitoring failures | External blocker | Sentry wiring exists, but real production DSN/org/project/token evidence is absent. |
| SSRF | Remediated for outbound webhook delivery | Endpoint configuration requires public HTTPS DNS targets; delivery rejects private/mixed DNS answers, pins the verified address with TLS hostname checks, refuses redirects, and times out. |
| Unsafe uploads | Remediated for current upload families | Branding, product-image, and vendor-document paths enforce size/type policy before reading, verify supported content signatures where applicable, and use generated object names. |

## Dependency advisory resolution — October 13, 2026

Advisories published after the July closeout raised the `staging` lockfile to **21 vulnerabilities (1 critical, 15 high, 5 moderate)**. They were resolved without `npm audit fix --force`. The registry-backed audit now reports **4 high, all in one accepted dev-only chain** (below).

| Chain | Resolution and proof |
|---|---|
| Next.js (critical: Image Optimization RCE, Windows-host RCE, SSG/ISR cache poisoning) | The root peer, all three runtimes, and both Next ESLint plugins move from 15.5.22 to 15.5.27, still one hoisted version. This also clears the PostCSS chain bundled with Next. |
| sharp (libheif, librsvg) | Override raised to 0.35.5, and the `allowScripts` pin was updated to match. The rebuilt web image loads **sharp 0.35.5 / libvips 8.18.7** on linux-x64 with the `@img` copy unchanged. |
| nodemailer (cross-tenant SMTP credential disclosure via the DNS/TLS servername cache, domain allow-list bypasses, address-parser DoS) | The `nodemailer-secure` alias moves from `^9.0.3` to `^10.1.0`. 10.0.0's only breaking change is a Node.js 20+ floor; the images run Node 24. `createTransport` and `sendMail` usage is unchanged, and the worker image resolves 10.1.0. |
| PostCSS, `brace-expansion`, `fast-uri` | Overrides raised to 8.5.30, 5.0.12, and 3.1.8. |
| `deepmerge-ts` (via `@prisma/config`) | Prisma 6.19.3 is the latest 6.x release, so the override moves `deepmerge-ts` to 8.0.2. `prisma validate`, client generation, and the DB suite pass. |
| vitest, `@vitest/mocker`, browserslist (via `@serwist/next`), nanoid, source-map-js, baseline-browser-mapping | Fixed through in-range updates (vitest `^4.1.11`) and a non-forced `npm audit fix`. |

**Accepted, not fixed:** `braces` ≤3.0.3 (GHSA-vfj7-8cjw-p6xm), reached through `@next/eslint-plugin-next` → `fast-glob` → `micromatch`. No patched `braces` release exists; 3.0.3 is the latest. npm's only suggested fix is a semver-major downgrade of the Next ESLint plugin to 14.x. The chain exists only in lint tooling. `npm ls braces --omit=dev` is empty for the worker, and the plugin is never bundled into the web runtime. Revisit when `braces` or `micromatch` ships a fix. Until then, `npm audit --audit-level=moderate` reports exactly these four entries.

Gates on the dependency branch:
- serial forced `turbo run type-check lint test build`: **37/37**, 0 cached (web 190, auth 67, contracts 29, DB 52, worker 41, email 18, tenant-context 50, platform-manager 40, tenant-web 54);
- `test:boot-config` PASS;
- `test:split-topology` 5/5;
- both Docker images build;
- the only build warning is the known BullMQ dynamic-dependency warning.

The full production E2E suite was not rerun for this dependency-only change. It remains a phase-exit gate.

## Dependency advisory resolution — July 29, 2026

The Phase 1 closeout resolved the full advisory inventory without `npm audit fix --force` and without accepting or deferring any advisory. The final clean install and independent registry-backed audit report **0 vulnerabilities at every severity**, including the production tree.

| Resolved chain | Resolution and proof |
|---|---|
| Auth.js | Upgraded `next-auth` to 5.0.0-beta.32, `@auth/core` to 0.41.3, and the Prisma adapter to 2.11.3 as one compatible set. Auth unit coverage and the complete production E2E suite pass. |
| Next.js | Pinned the root peer and all three runtimes to 15.5.22, with both matching Next ESLint plugins at 15.5.22. This removes the stale root peer resolution and leaves one hoisted Next version. Repository build, split-topology, boot configuration, and production E2E pass. |
| PostCSS and sharp | Raised the reviewed overrides to PostCSS 8.5.18 and sharp 0.35.0. Both Linux production images build. A container smoke loads sharp 0.35.0 with libvips 8.18.3 on linux-x64; the web Dockerfile explicitly carries the builder's `@img` native packages because Next standalone tracing omitted the split libvips package. Upload/image validation remains covered by the full E2E suite. |
| `brace-expansion` and `fast-uri` | Scoped overrides resolve the active chains to 5.0.8 and 3.1.4. ESLint 10.8.0 plus `@eslint/js` 10.0.1 removes the obsolete ESLint 9/minimatch 3/brace 1.x chain; the two newly enforced lint findings were corrected in application code. |

`npm ci` completed without unreviewed install-script warnings, `npm ls` resolved one coherent dependency tree, and the full type-check, lint, unit, build, split-topology, boot-config, and 118-test production E2E gates passed. The temporary isolated E2E database had 0 residual organizations/users/outbox events and was deleted after verification.

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
11. **Done for vulnerable components:** the July 29 dependency set is remediated to a zero-vulnerability audit; clean install, coherent-tree, full repository gates, production E2E, Linux image builds, and native sharp/libvips smoke evidence are recorded above and in `PROGRESS.md`.

The repository rate-limit finding is closed. Public launch remains blocked until external monitoring and the remaining full launch-proof items are completed and the audit is repeated against the deployed environment.

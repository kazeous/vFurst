# Phase 6 Go-Live Checklist

Run this before marking Phase 6 complete:

```bash
npm run test:load:launch
npm run check:launch
```

The checker verifies:

- Marketing, legal, E2E, load-test, and launch audit artifacts exist.
- Stripe secret-key and webhook-signing environment variables, Sentry production variables, valid runtime/direct Postgres URLs, a bounded database connection budget, a valid shared Redis URL, and positive rate-limit quotas are configured.
- At least two beta-program slots name real conventions and use `Externally verified` status.
- Security audit no longer records any blocking application or dependency finding.
- Full k6 target run is documented as passed.
- Physical screen-reader pass is explicitly documented as complete with tester, assistive-technology, and flow evidence.
- `VFURST_LAUNCH_URL` returns live marketing/legal routes with expected vFurst launch content.

The checker does **not** yet parse every mandatory external proof. Complete and
record these manually before Phase 6 can close:

- Physical badge output with event/template/badge identifiers, printer model, browser, direct WebUSB result, legible image/barcode evidence, and tester/timestamp. If direct Zebra output is unavailable, record an explicit successful PDF fallback print before confirming the badge as printed.
- Real SePay Sandbox QR, signed-webhook, reconciliation, expiry, exception, payout, and refund evidence before SePay is enabled.
- A production transactional email provider tested through password recovery: either SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`) or SES (`AWS_REGION` plus the runtime AWS credential chain), with delivery and bounce/complaint monitoring enabled.
- The deployed persona/tenant-isolation matrix, and the final full-system audit rerun against the deployed environment.

The following managed-tenant gates are also mandatory. They require automated regression evidence even if the current readiness script has not yet been extended to parse every result:

- Public registration creates an identity only and cannot enter `/dashboard`, create an organization, or create an event.
- `/platform/*` requires `PLATFORM_ADMIN`; `/dashboard/*` requires an explicit organization membership and returns only membership-scoped tenants/events.
- Platform provisioning → single-use initial-owner invitation → acceptance → tenant activation → first event creation passes end to end.
- Org A cannot enumerate, read, mutate, export, upload into, or trigger an operation for Org B across every action/API family recorded in the full-system audit.
- Organization lifecycle, custom-domain activation, payment-provider configuration, platform fees, reconciliation, exceptions, and payouts are platform-only operations.
- Suspending an organization blocks new tenant activity while signed callbacks, reconciliation, refunds, and settlement of existing orders continue safely.
- The organizer UI contains no “create organization”, “all organizations”, or platform payment controls; marketing contains no self-service “create your workspace” promise.

Required environment. Supply these to each application process directly — the
platform's own environment configuration, not a file. Next.js reads `.env*` only
from the application directory and nothing loads the repository-root file, so a
value placed there reaches nothing. `EMAIL_DELIVERY_ENCRYPTION_KEY` must be
identical for the web and worker processes or queued email cannot be decrypted.

```bash
NEXT_PUBLIC_APP_URL=https://your-production-domain.example
NEXT_PUBLIC_ROOT_DOMAIN=your-production-domain.example
AUTH_URL=https://your-production-domain.example
AUTH_TRUST_HOST=true
AUTH_SECRET=...
DATABASE_URL=postgresql://runtime-user:...@pooler.example:5432/vfurst?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://admin-user:...@database.example:5432/vfurst
VFURST_DB_CONNECTION_LIMIT=4
VFURST_DB_POOL_TIMEOUT_SECONDS=20
VFURST_DB_CONNECTION_BUDGET=80
VFURST_WEB_REPLICAS=6
VFURST_WORKER_REPLICAS=1
REDIS_URL=rediss://your-managed-redis.example:6379
EMAIL_DELIVERY_ENCRYPTION_KEY=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CHECKOUT_TOKEN_SECRET=...
SEPAY_WEBHOOK_SECRET=...
SEPAY_API_TOKEN=...
SEPAY_ENV=sandbox
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_DSN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_AUTH_TOKEN=...
VFURST_LAUNCH_URL=https://your-production-domain.example
SALES_CONTACT_EMAIL=sales@your-production-domain.example
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_SECURE=true
SMTP_FROM_EMAIL=no-reply@your-production-domain.example
VFURST_RATE_LIMIT_PREFIX=vfurst:rate-limit
VFURST_API_RATE_LIMIT_PER_MINUTE=100
VFURST_AUTH_RATE_LIMIT_PER_MINUTE=30
VFURST_PAYMENT_RATE_LIMIT_PER_MINUTE=60
VFURST_STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE=240
VFURST_SEPAY_WEBHOOK_RATE_LIMIT_PER_MINUTE=240
```

For Coolify deployments, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, and `VFURST_LAUNCH_URL` should all point at the platform marketing domain, for example `https://vfurst.reyuugames.com` for URL values and `vfurst.reyuugames.com` for `NEXT_PUBLIC_ROOT_DOMAIN`. If the root domain is left at the local/default value, middleware can treat the production marketing domain as a convention custom domain and cause proxy-visible redirect/routing failures.

If Cloudflare proxies the Coolify domain, set Cloudflare SSL/TLS mode to `Full` or `Full (strict)`, not `Flexible`. A `Flexible` edge connection can loop forever when Coolify or Traefik redirects the origin request back to HTTPS. The symptom is `curl -I https://vfurst.reyuugames.com/` returning `302` or `307` with `Location: https://vfurst.reyuugames.com/` repeatedly. Temporarily disabling the orange-cloud proxy is a useful isolation test; if the direct DNS path works, fix the Cloudflare SSL mode before re-enabling the proxy.

Production database schema must be synchronized before login, dashboard, or convention routes can work. This repo currently has a Prisma schema but no committed `packages/db/prisma/migrations` directory, so the web `prestart` hook synchronizes the additive schema and then runs the managed-tenancy backfill before Next.js accepts traffic:

```bash
cd packages/db
npx prisma db push
npm run backfill:managed-tenancy
```

The hook does not pass `--accept-data-loss`: additive changes apply automatically, while a destructive change refuses startup and requires a reviewed backup/migration procedure. The idempotent backfill marks only legacy organizations with a null lifecycle marker as `ACTIVE`, preserves already-routed custom domains, and leaves explicitly provisioned tenants in `PROVISIONING`. Administrative scripts prefer `DIRECT_DATABASE_URL`; it must be a direct Postgres endpoint without `pgbouncer=true` and its role needs schema DDL/data-update permission. Runtime web/worker traffic uses `DATABASE_URL`, which may be pooler-backed. After the first live bootstrap, add real Prisma migrations before making future production schema changes so later deploys can use `npx prisma migrate deploy`.

Each process owns one Prisma client and a bounded pool. Before changing replica count or pool size, verify `(web replicas + worker replicas) x per-process connection limit` stays within `VFURST_DB_CONNECTION_BUDGET`, that the budget stays below Postgres usable capacity after reserved/admin slots, and that rolling-deploy overlap retains headroom. The launch runner performs the same capacity preflight before it builds or seeds.

Sentry sample rates remain optional tuning values. Shared fixed-window quotas for Auth.js, public API keys, payment/refund actions, Stripe webhooks, and SePay webhooks are mandatory production values and are validated by the checker together with `REDIS_URL`. All web replicas must use the same Redis deployment and rate-limit prefix. Auth/API/payment controls intentionally fail closed if Redis is unavailable; signed and idempotent Stripe/SePay callbacks fail open while logging degraded protection so settlement is preserved. Blank or placeholder launch values are not sufficient. SePay and checkout secrets above still require an explicit manual go-live check; SePay secrets may be omitted only when the provider is disabled and its rollout is intentionally deferred.

Sentry source map upload is best-effort during `next build`: upload failures are logged as warnings so a bad token does not block deployment. If Coolify logs `sentry reported an error: You do not have permission to perform this action. (http status: 403)`, recreate or rotate `SENTRY_AUTH_TOKEN` in the same Sentry organization as `SENTRY_ORG`, confirm `SENTRY_PROJECT` is the exact project slug, and give the token release/source-map upload permissions before redeploying.

If Coolify logs show Turbo/Next completing successfully and then fail at Docker `exporting layers`, treat it as a Docker image export or host-resource failure rather than an application compile failure. First confirm the log contains `Tasks: 3 successful, 3 total` and `#16 exporting layers`; then prune unused Docker images/build cache or add disk to the Coolify host before retrying. The repo includes `.dockerignore` to keep local caches, `.git`, build artifacts, generated service workers, logs, and environment files out of the Docker context.

## Current readiness snapshot — 2026-07-29

- Corrective staging is operational on Coolify: the final rollout built commit `c16a44f`, both web and worker reported Running/healthy/finished, public health reported PostgreSQL and Redis `ok`, Auth.js session returned 200, and the live wrong-password path rendered inline without a 404. This is staging evidence only; it does **not** close Phase 6 unit 6.1 while Phases 1–5 and the production evidence below remain incomplete.
- `npm run check:launch` currently reports **10 automated failures**: Stripe configuration (2), Sentry configuration (5), beta-convention evidence (1), physical screen-reader evidence (1), and live `VFURST_LAUNCH_URL` verification (1).
- Mandatory evidence not parsed by the checker also remains open: the deployed persona/tenant-isolation matrix, SePay Sandbox simulation set, physical badge proof, production transactional-email proof, and the deployed full-system audit rerun.
- The supported-topology 500/50 proof from July 14 remains the current performance evidence: 198,024 requests, 0.00% HTTP failures, 396,045/396,045 checks, no Prisma `P2037`, and overall p95 409.88ms against the 1.5-second threshold. Re-run it if the material paths/topology listed in `docs/plan/verification.md` change.

Do not promote staging to a public production launch until the automated failures
and every manual Phase 6 evidence item above are closed.

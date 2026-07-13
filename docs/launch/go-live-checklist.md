# Phase 7 Go-Live Checklist

Run this before marking Phase 7 complete:

```bash
npm run test:load:launch
npm run check:launch
```

The checker verifies:

- Marketing, legal, E2E, load-test, and launch audit artifacts exist.
- Sentry production environment variables are configured.
- At least two beta-program slots name real conventions and use `Externally verified` status.
- Security audit no longer records any blocking application or dependency finding.
- Full k6 target run is documented as passed.
- Physical screen-reader pass is explicitly documented as complete with tester, assistive-technology, and flow evidence.
- Real SePay Sandbox QR, signed-webhook, reconciliation, expiry, exception, payout, and refund evidence is recorded before SePay is enabled.
- `VFURST_LAUNCH_URL` returns live marketing/legal routes with expected vFurst launch content.

Required environment:

```bash
NEXT_PUBLIC_APP_URL=https://your-production-domain.example
NEXT_PUBLIC_ROOT_DOMAIN=your-production-domain.example
AUTH_URL=https://your-production-domain.example
AUTH_TRUST_HOST=true
AUTH_SECRET=...
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
```

For Coolify deployments, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, and `VFURST_LAUNCH_URL` should all point at the platform marketing domain, for example `https://vfurst.reyuugames.com` for URL values and `vfurst.reyuugames.com` for `NEXT_PUBLIC_ROOT_DOMAIN`. If the root domain is left at the local/default value, middleware can treat the production marketing domain as a convention custom domain and cause proxy-visible redirect/routing failures.

If Cloudflare proxies the Coolify domain, set Cloudflare SSL/TLS mode to `Full` or `Full (strict)`, not `Flexible`. A `Flexible` edge connection can loop forever when Coolify or Traefik redirects the origin request back to HTTPS. The symptom is `curl -I https://vfurst.reyuugames.com/` returning `302` or `307` with `Location: https://vfurst.reyuugames.com/` repeatedly. Temporarily disabling the orange-cloud proxy is a useful isolation test; if the direct DNS path works, fix the Cloudflare SSL mode before re-enabling the proxy.

Production database schema must be synchronized before login, dashboard, or convention routes can work. This repo currently has a Prisma schema but no committed `packages/db/prisma/migrations` directory, so the web `prestart` hook runs the following command before Next.js accepts traffic:

```bash
cd packages/db
npx prisma db push
```

The hook does not pass `--accept-data-loss`: additive changes apply automatically, while a destructive change refuses startup and requires a reviewed backup/migration procedure. The production database role therefore needs schema DDL permission. After the first live bootstrap, add real Prisma migrations before making future production schema changes so later deploys can use `npx prisma migrate deploy`.

Optional production tuning values are documented in `.env.example` and `.env.local`, including Sentry sample rates and fixed-window rate limits for Auth.js, payments, Stripe webhooks, and public API keys. Blank or placeholder launch values are not sufficient. The current checker validates Sentry and live URL values; until it is extended, Stripe/SePay/checkout secrets above require an explicit manual go-live check. SePay secrets may be omitted only when the provider is disabled and its rollout is intentionally deferred.

Sentry source map upload is best-effort during `next build`: upload failures are logged as warnings so a bad token does not block deployment. If Coolify logs `sentry reported an error: You do not have permission to perform this action. (http status: 403)`, recreate or rotate `SENTRY_AUTH_TOKEN` in the same Sentry organization as `SENTRY_ORG`, confirm `SENTRY_PROJECT` is the exact project slug, and give the token release/source-map upload permissions before redeploying.

If Coolify logs show Turbo/Next completing successfully and then fail at Docker `exporting layers`, treat it as a Docker image export or host-resource failure rather than an application compile failure. First confirm the log contains `Tasks: 3 successful, 3 total` and `#16 exporting layers`; then prune unused Docker images/build cache or add disk to the Coolify host before retrying. The repo includes `.dockerignore` to keep local caches, `.git`, build artifacts, generated service workers, logs, and environment files out of the Docker context.

Current result on July 13, 2026: compilation, dependency, E2E, and previously documented load gates pass, but the full-system security audit is blocked. External launch evidence is also incomplete. Do not deploy until `docs/launch/full-system-audit-2026-07-13.md` is remediated and rerun.

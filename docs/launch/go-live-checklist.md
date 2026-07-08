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
- Security audit no longer records a blocking dependency finding.
- Full k6 target run is documented as passed.
- Physical screen-reader pass is explicitly documented as complete with tester, assistive-technology, and flow evidence.
- `VFURST_LAUNCH_URL` returns live marketing/legal routes with expected vFurst launch content.

Required environment:

```bash
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_DSN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_AUTH_TOKEN=...
VFURST_LAUNCH_URL=https://your-production-domain.example
```

Optional production tuning values are documented in `.env.example` and `.env.local`, including Sentry sample rates and fixed-window rate limits for Auth.js, payments, Stripe webhooks, and public API keys. Blank launch placeholders are not sufficient; `npm run check:launch` requires real non-empty Sentry values and a reachable live URL.

Current result on July 8, 2026: the load and security gates pass, and the command fails because external launch evidence is not complete yet.

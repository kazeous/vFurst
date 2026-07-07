# Phase 7 Go-Live Checklist

Run this before marking Phase 7 complete:

```bash
npm run check:launch
```

The checker verifies:

- Marketing, legal, E2E, load-test, and launch audit artifacts exist.
- Sentry production environment variables are configured.
- Beta-program slots no longer contain TBD / not externally verified placeholders.
- Security audit no longer records a blocking dependency finding.
- Full k6 target run is documented as passed.
- Physical screen-reader pass is documented as complete.
- `VFURST_LAUNCH_URL` returns live marketing/legal routes.

Required environment:

```bash
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_DSN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_AUTH_TOKEN=...
VFURST_LAUNCH_URL=https://your-production-domain.example
```

Current result on July 7, 2026: the command fails because the external launch evidence is not complete yet.

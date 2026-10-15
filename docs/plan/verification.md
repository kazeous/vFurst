# Verification

## Every session (any phase)

```bash
npx turbo run type-check
npx turbo run lint
npx turbo run test
npx turbo run build
```

All must pass. The BullMQ dynamic-dependency build warning is known; any **new** warning blocks. Commit per logical unit (conventional messages); update `PROGRESS.md` before ending the session.

## Every session that touches deployment files

When `Dockerfile`, `compose.prod.yaml`, `.dockerignore`, `scripts/validate-compose.mjs`, or an app `.env.example` changes:

```bash
npm run test:compose
npm run compose:validate
```

## Every session that touches routes, actions, or hosts

With the local stack up (`docker compose up -d`, `npm run prestart --workspace @vfurst/web`) and the app running:

```bash
for h in "localhost:3000" "www.vfurst.reyuugames.com" "console.vfurst.reyuugames.com" "app.vfurst.reyuugames.com" "foo_bar.localhost:3000"; do printf '%-40s' "[$h]"; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: $h" http://127.0.0.1:3000/; done
```

Expected after Phase 1 unit 1.3: `200 200 200 200 400`.

## Full regression gate (before marking any phase complete)

```bash
E2E_PRODUCTION=1 npm run test:e2e -- --workers=1
npm run check:launch
npm audit --audit-level=moderate
```

Run the full suite on **one worker**: every recorded green full run used `--workers=1`, and Playwright's default of 4 workers shows known contention failures (the registration-policy deadlock and the invitation write conflict). Record exact counts in `PROGRESS.md`. **Never record a pass claim from a focused run** — a focused-run habit hid a red suite for nine days (TST-01). Because the E2E runner injects env (TST-02), phase completion additionally requires the manual walkthrough below under plain `npm run dev`.

## Manual walkthrough (Phase 1B completion and later; plain `npm run dev`, no injected env)

1. On `{slug}.localhost:3000`, sign up with an email, then sign up again with the same email. Both show "Check your email"; Mailpit shows a setup link.
2. Follow the link and set a name and password. Sign out. Sign in with a wrong password (inline message), then correctly. Signing up again now sends an "account exists" notice.
3. The portal `/account` renders its summary cards. The same email on a second tenant is a separate account.
4. `localhost:3000/{slug}` redirects to the tenant host.
5. Registration with an invalid voucher, then a valid free registration (confirmation email in Mailpit).
6. Store: add to cart, try a bad discount code, check out on the tenant host.
7. Hotel booking. Volunteer application with a required field left blank.
8. Staff: sign in at `/login` through the mock OIDC, reach `/dashboard`, log out.

Any blank "Application error" page is a failure.

## Tenant/authorization gates (every phase that adds or changes a route, action, API, export, upload, or worker entry)

- A portal account can never gain membership, dashboard access, platform roles, or org/event creation; staff identities exist only through authentik.
- Only `PLATFORM_ADMIN` touches lifecycle, domains, platform payment config.
- Authorization derives from the stored resource; a submitted `orgId` never authorizes a separate resource ID.
- Tests use two unrelated organizations; Org A cannot enumerate, read, mutate, export, upload into, or trigger operations for Org B.
- Suspension blocks new activity but never signed callbacks, reconciliation, refunds, settlement.
- New public-record types get owner-bound reads and cross-user denial tests (the `/account` pattern).

## Per-phase checkpoints

| Phase | Must demonstrate |
|---|---|
| 1 | Audit batches 1–5 closed; E2E 0/0; host probe green; walkthrough clean; CHK-02 write+read rejection; TST-02 smoke in CI |
| 1B | Staff sign-in only via OIDC (mock locally, authentik deployed) incl. group → PLATFORM_ADMIN, invitation requires verified email, single logout, back-channel revocation; portal email-first setup/sign-in/reset; cross-tenant account independence; composite FKs reject cross-tenant owners; checkout on the portal host; full E2E and k6 500/50 green; deployed smoke per docs/launch/authentik-setup.md |
| 2 | Multi-attendee registration→payment→badges; agreement gating with stored version; scheduled+role pricing on portal/cashier/upgrade; hidden tier; 2FA; parity rows updated |
| 3 | One purchasability boundary proven across portal/cart/cashier; library options/surcharges snapshot on orders; complimentary+upsell addons settle; fulfillment queue + claim label validates once; staff order edit + manual paid stays ledger-correct |
| 4 | Station config honored incl. badge variants/printer routing; ban review queue; warning engine incl. DOB + undelivered products; dealer assistants/seating/areas; den QR admits once |
| 5 | Capacity math under draw/expiry/re-entry; deterministic weighted-draw test; test-run no-op; no double-redeem under replay |
| 6 | `npm run check:launch` fully green with dated external evidence per unit |

## Performance guard

Re-run the 500/50 k6 proof after any material change to registration/check-in paths, auth/user queries, caching, connection pools, or topology. Otherwise the 2026-07-14 evidence stands.

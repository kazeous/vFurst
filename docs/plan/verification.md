# Verification

## Every session (any phase)

```bash
npx turbo run type-check
npx turbo run lint
npx turbo run test
npx turbo run build
```

All must pass. The BullMQ dynamic-dependency build warning is known; any **new** warning blocks. Commit per logical unit (conventional messages); update `PROGRESS.md` before ending the session.

## Every session that touches routes, actions, or hosts

With the local stack up (`docker compose up -d`, `npm run prestart --workspace @vfurst/web`) and the app running:

```bash
for h in "localhost:3000" "www.vfurst.reyuugames.com" "console.vfurst.reyuugames.com" "app.vfurst.reyuugames.com" "foo_bar.localhost:3000"; do printf '%-40s' "[$h]"; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: $h" http://127.0.0.1:3000/; done
```

Expected after Phase 1 unit 1.3: `200 200 200 200 400`.

## Full regression gate (before marking any phase complete)

```bash
E2E_PRODUCTION=1 npm run test:e2e
npm run check:launch
npm audit --audit-level=moderate
```

Record exact counts in `PROGRESS.md`. **Never record a pass claim from a focused run** — a focused-run habit hid a red suite for nine days (TST-01). Because the E2E runner injects env (TST-02), phase completion additionally requires the manual walkthrough below under plain `npm run dev`.

## Manual walkthrough (plain `npm run dev`, no injected env)

1. Register; register again with the same email (inline message, not a blank page).
2. Log in with a wrong password, then correctly.
3. `/account` renders its summary cards.
4. Open a tenant portal by subdomain **and** central path.
5. Registration with an invalid voucher, then a valid free registration (confirmation email in Mailpit).
6. Store: add to cart, bad discount code, checkout **from the tenant subdomain**.
7. Hotel booking; volunteer application with a required field blank.
8. Dashboard logout.

Any blank "Application error" page is a failure.

## Tenant/authorization gates (every phase that adds or changes a route, action, API, export, upload, or worker entry)

- Public account creation grants no membership, dashboard access, or org/event creation.
- Only `PLATFORM_ADMIN` touches lifecycle, domains, platform payment config.
- Authorization derives from the stored resource; a submitted `orgId` never authorizes a separate resource ID.
- Tests use two unrelated organizations; Org A cannot enumerate, read, mutate, export, upload into, or trigger operations for Org B.
- Suspension blocks new activity but never signed callbacks, reconciliation, refunds, settlement.
- New public-record types get owner-bound reads and cross-user denial tests (the `/account` pattern).

## Per-phase checkpoints

| Phase | Must demonstrate |
|---|---|
| 1 | Audit batches 1–5 closed; E2E 0/0; host probe green; walkthrough clean; CHK-02 write+read rejection; TST-02 smoke in CI |
| 2 | Multi-attendee registration→payment→badges; agreement gating with stored version; scheduled+role pricing on portal/cashier/upgrade; hidden tier; 2FA; parity rows updated |
| 3 | One purchasability boundary proven across portal/cart/cashier; library options/surcharges snapshot on orders; complimentary+upsell addons settle; fulfillment queue + claim label validates once; staff order edit + manual paid stays ledger-correct |
| 4 | Station config honored incl. badge variants/printer routing; ban review queue; warning engine incl. DOB + undelivered products; dealer assistants/seating/areas; den QR admits once |
| 5 | Capacity math under draw/expiry/re-entry; deterministic weighted-draw test; test-run no-op; no double-redeem under replay |
| 6 | `npm run check:launch` fully green with dated external evidence per unit |

## Performance guard

Re-run the 500/50 k6 proof after any material change to registration/check-in paths, auth/user queries, caching, connection pools, or topology. Otherwise the 2026-07-14 evidence stands.

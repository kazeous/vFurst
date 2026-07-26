# Phase 1 — Stabilize the running application

> **Goal:** a person using the app the way a developer or attendee actually runs it (`npm run dev`, real browser, ordinary mistakes) never hits a blank error page, a wrong-host 404/500, or an unsafe redirect — and the full E2E suite is green and trustworthy.
>
> **Defect register:** `docs/launch/runtime-defect-audit-2026-07-26.md` is the single source of truth for every defect (ENV/ERR/RTE/CHK/DAT/TST/SPL), its evidence, fix guidance, and per-batch verification. This phase file only sequences it. Do not duplicate defect text here; update the audit's progress table and `PROGRESS.md` as batches close.

## Status at rebuild (2026-07-26)

Batch 0 (ENV-01, ENV-02, SPL-01) is **complete**: every runtime loads its own env file, tenant subdomains return 200 under plain `npm run dev`, the worker starts, and Mailpit delivery is proven. Batches 1–6 are open.

## Scope — one batch per session, in order

| Unit | Audit batch | Contents | Highest-value outcome |
|---|---|---|---|
| 1.1 | Batch 1 | `error.tsx` per route group + real `global-error` copy; `/login` catches `AuthError` | ~180 blank pages become readable; the single most-hit 500 is gone |
| 1.2 | Batch 2 | Public-flow actions → structured state or redirect-with-code (registration, cart, hotel, volunteer, vendor, transfers); `revalidatePath`-after-throw fix | Ordinary invalid input renders inline, values retained |
| 1.3 | Batch 3 | Reserved-host 404s, malformed-Host 500, portal footer links, dashboard logout, header scrubbing, store-checkout tenant-host redirect (CHK-01), **open-redirect fix (CHK-02 — security, must not slip)** | Host probe table green; checkout safe |
| 1.4 | Batch 4 | Outbox FK → `SetNull`, stale hero assertions, fixture-cleanup script | Full E2E 0 failed / 0 skipped, teardown works |
| 1.5 | Batch 5 | Remaining organizer/platform action conversions, `unstable_rethrow` guard, routing hygiene (dot-paths, dual middleware, reserved slugs, LAN hosts) | No P1/P2 left in ERR/RTE |
| 1.6 | TST-02 | One CI smoke that boots the app **without** injected env and asserts the boot assertion fires | The suite can never again be green while the app is unconfigurable |

## Split runtime — standing freeze

`apps/platform-manager` and `apps/tenant-web` stay in the repo but receive **no new work** during phases 1–5. Batch 6 (SPL-02…SPL-11) is required only before a cutover, and a cutover requires an explicit recorded decision after Phase 1 completes. Keep `npm run test:split-topology` green as a canary; if it conflicts with a stabilization fix, prefer the fix and record the conflict in `PROGRESS.md`.

## Do-not-change list

The audit's "Do not change" section (tenant-isolation guards, Stripe config throws, optimistic-concurrency errors, webhook 5xx responses, API v1 handlers) is binding for every unit above. Converting those throws is a regression, not a fix.

## Exit criteria

1. The audit's progress table shows Batches 1–5 complete (Batch 6 explicitly deferred with the freeze note).
2. `E2E_PRODUCTION=1 npm run test:e2e` — 0 failed, 0 did not run, recorded with counts in `PROGRESS.md`.
3. Host probe table returns `200 200 200 200 400` (root, `www`, `console`, `app`, underscore-host).
4. The manual walkthrough in `verification.md` §Phase-1 passes with zero blank error pages.
5. `successPath=/\attacker.example` rejected at write and read; regression tests exist.
6. Repository gates green (`type-check`, `lint`, `test`, `build`; no new build warnings).

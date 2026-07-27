# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. `PROGRESS.md` and the actual repository are the only ground truth for what exists; plan docs describe intent.

> **Plan v2 (2026-07-26).** The original phase 0–7 plan and the complete pre-rebuild session history were retired in the docs-v2 rebuild and live in git history (see the `docs: rebuild plan` commit). The verified baseline they produced is summarized in `docs/plan/01-current-state.md` — do not re-derive it from old history.

## Current phase

**Phase 1 — Stabilize** (`docs/plan/phase-1-stabilize.md`)

Audit Batches 0 (env), 1 (error visibility), 2 (public flows), and 3 (routing/checkout safety) are complete. **Next session: unit 1.4 = audit Batch 4** — DAT-01, TST-01, and TST-03 only. Batch 4 was not started in the Batch 3 session; read its audit rows before making any schema, assertion, or fixture-cleanup change.

## Status by phase

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Stabilize | In progress | Audit Batches 0–3 done (2026-07-27); Batches 4–6 open; split runtime frozen |
| 2 — Attendee & registration parity | Not started | Blocked on Phase 1; decisions listed in the phase file |
| 3 — Commerce & product parity | Not started | Blocked on Phase 1; age rules depend on Phase 2 DOB |
| 4 — Event-day & operations parity | Not started | Depends on Phase 2 (DOB) and Phase 3 (fulfillment) items as noted |
| 5 — Registration lottery | Not started | Product contract in the phase file needs confirmation before build |
| 6 — Launch | Blocked (external) | All external evidence outstanding; see `docs/launch/go-live-checklist.md` |

Legend: Not started · In progress · Blocked · Complete (only after the phase's `verification.md` checkpoint passes and is recorded here with counts).

## Baseline evidence (2026-07-26, pre-rebuild — details in `docs/plan/01-current-state.md`)

Type-check/lint/test 32/32 tasks (133 web unit tests); build 10/10; split topology 5/5; **full E2E 88 passed / 5 failed / 6 did not run** (known: TST-01 assertions, DAT-01 teardown FK, one contention flake); 500/50 load proof passed 2026-07-14. Local Docker volumes and build caches were wiped during the rebuild — re-run gates before relying on baseline numbers.

## Session log

### 2026-07-27 — Phase 1 unit 1.3: routing and checkout safety (audit Batch 3)

- Closed RTE-01/02/04/06/07 and CHK-01/02. Canonical/configured platform hosts are classified consistently; malformed hosts return a no-store 400; forged `x-vfurst-*` input is scrubbed and internal tenant metadata is no longer echoed in public response headers.
- Tenant-host store checkout now moves to the central checkout surface and returns to a central-path portal receipt. Checkout return paths use the strengthened shared local-path policy at write time and safe fallback at both read surfaces, including encoded slash/backslash/control-character variants.
- Portal “Powered by vFurst” and Privacy links resolve to the central host. Dashboard logout is an Auth.js server action that clears the session and returns to `/`.
- Exact plain-dev host probe: **200/200/200/200/400**. New focused E2E **5/5**; existing store authorization regression **4/4**; split-topology **5/5**. Plain-dev browser walkthrough confirmed central footer links and logout behavior.
- Repository gates: type-check **9/9** packages, lint **9/9**, test **14/14** tasks (web **160/160**, auth **67/67**), build **10/10** packages; only the known BullMQ warning remains.
- Batch 4 was deliberately untouched. Full E2E was not rerun and no green claim was made; DAT-01/TST-01/TST-03 remain the next unit.

### 2026-07-27 — Phase 1 unit 1.2: public-flow structured errors (audit Batch 2)

- Closed ERR-03 (public subset) and ERR-04. The audit's "Batch 2 outcome" section carries the full conversion table and evidence.
- Added the `PublicFormState`/`PublicActionError` contract; converted registration, store add/cart/checkout, voucher apply, hotel booking, volunteer, and vendor submissions to `useActionState` with controlled client forms — invalid input renders inline, entered values are retained, submits disable while pending, and success-path `redirect()` still works through the `…Inner` + `unstable_rethrow` wrapper (ERR-05 guard landed in every converted file).
- Transfer accept/decline became redirect-with-notice: expired/used/invalid/policy outcomes land back on the decision page showing the refreshed request state; the ERR-04 revalidate-then-throw sites are gone.
- New `tests/e2e/public-flow-errors.spec.ts` (6 cases incl. the double-submitted transfer decision); `error-visibility.spec.ts` updated — voucher case asserts inline + retained values, boundary regression re-anchored to the unconverted duplicate-member invite (Batch 5). 9/9 dev mode and 9/9 production mode (structured messages are not masked in production — that is the point of the pattern).
- Touched-flow regressions green in isolation: policy 3/3, hotel 3/3, transfer/store/staff-vendor 13/13, account-registration 1/1. The six-file four-worker run reproduced the two documented contention flakes (policy deadlock at :121, hotel 120 s test timeout); both pass alone, matching pre-batch behavior. Repository gates 37/37.
- `payVendorBooth` and organizer/platform action families intentionally remain throwing until Batch 5; the dashboard boundary from Batch 1 covers them meanwhile.

### 2026-07-26 — Phase 1 unit 1.1: error visibility (audit Batch 1)

- Closed ERR-01 and ERR-02. The audit's "Batch 1 outcome" section carries the full change list and evidence.
- Added the shared `RouteError` boundary component and an `error.tsx` per surface (root, `(auth)`, `(marketing)`, `(convention)/[orgSlug]`, `account`, `dashboard`, `platform`, `checkout`); rewrote `global-error.tsx` with real copy while keeping its Sentry capture. Thrown action errors now render a readable, retryable page with a digest reference instead of a blank "Application error".
- `/login` no longer 500s on a wrong password: the inline server action catches `AuthError` and redirects to `/login?error=invalid_credentials` preserving `returnTo`; the page renders the accessible alert (platform-manager pattern).
- Added `tests/e2e/error-visibility.spec.ts`: wrong-password (no ≥500 responses, alert, `returnTo` preserved on success) and invalid-voucher boundary + working "Try again". Passed 3/3 dev-mode together with `account-registration.spec.ts`, and 2/2 in production mode where server messages are masked.
- Gates: `turbo run type-check lint test` 32/32; `turbo run build` 10/10 (known BullMQ warning). Full E2E not re-run this session — Batch 4 owns making it green; no pass claim recorded.
- Flake note for later specs: with a cold `.next`, dev-server compile latency can outlast Playwright's 5 s expect timeout; wait on the action's POST response (`waitForResponse`) before asserting, as the existing policy spec does.

### 2026-07-26 — Plan v2 rebuild (docs only; no application code changed)

- Compared the implemented product against ConCat's full public documentation and live-instance screenshots; recorded the result as `docs/plan/02-concat-parity.md` with stable backlog IDs (REG-P*/STO-P*/EVD-P*/RAF-P1).
- Rebuilt the plan around reality: `docs/plan/00-reference.md` (contracts, v2), `01-current-state.md` (verified baseline), phases 1–6 (stabilize → attendee parity → commerce parity → event-day parity → registration lottery → launch), and a consolidated `verification.md`.
- Deleted the retired plan set (phases 0–7, verification-and-timeline) and the fully superseded `docs/launch/product-gap-audit-2026-07-16.md`; kept `runtime-defect-audit-2026-07-26.md` (active Phase 1 register), the launch evidence docs, and the split-architecture records (split now frozen by standing decision).
- Rewrote `AGENTS.md` and `.agents/commands/start-phase.md` for the new structure; `PROGRESS.md` restarted (this file).
- Cleared derived caches (`.turbo`, per-app `.next`, Playwright artifacts, `node_modules/.cache`) and reset the local Docker volumes (Postgres/Redis/MinIO/Mailpit) to purge 72 orgs / 68,056 users of fixture residue; re-provisioned the schema via the standard prestart chain.
- Environment note: the `docker compose` plugin works on this machine now (verified this session); the old "legacy docker-compose only" note no longer applies.
- No gates were re-run after the cache/DB reset in this session. Next session must start with unit 1.1 and treat the first full-gate run as the fresh baseline.

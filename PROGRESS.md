# Build Progress

> Update this file at the end of every session, even an interrupted one. This is the first thing to read in a new session: before the plan docs, before the code. `PROGRESS.md` and the actual repository are the only ground truth for what exists; plan docs describe intent.

> **Plan v2 (2026-07-26).** The original phase 0–7 plan and the complete pre-rebuild session history were retired in the docs-v2 rebuild and live in git history (see the `docs: rebuild plan` commit). The verified baseline they produced is summarized in `docs/plan/01-current-state.md` — do not re-derive it from old history.

## Current phase

**Phase 1 — Stabilize** (`docs/plan/phase-1-stabilize.md`)

Batch 0 of the runtime audit (env configuration) is complete. **Next session: unit 1.1 = audit Batch 1** — `error.tsx` per route group and the `/login` `AuthError` catch. Read `docs/launch/runtime-defect-audit-2026-07-26.md` §ERR-01/ERR-02 first.

## Status by phase

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Stabilize | In progress | Audit Batch 0 done (2026-07-26); Batches 1–6 open; split runtime frozen |
| 2 — Attendee & registration parity | Not started | Blocked on Phase 1; decisions listed in the phase file |
| 3 — Commerce & product parity | Not started | Blocked on Phase 1; age rules depend on Phase 2 DOB |
| 4 — Event-day & operations parity | Not started | Depends on Phase 2 (DOB) and Phase 3 (fulfillment) items as noted |
| 5 — Registration lottery | Not started | Product contract in the phase file needs confirmation before build |
| 6 — Launch | Blocked (external) | All external evidence outstanding; see `docs/launch/go-live-checklist.md` |

Legend: Not started · In progress · Blocked · Complete (only after the phase's `verification.md` checkpoint passes and is recorded here with counts).

## Baseline evidence (2026-07-26, pre-rebuild — details in `docs/plan/01-current-state.md`)

Type-check/lint/test 32/32 tasks (133 web unit tests); build 10/10; split topology 5/5; **full E2E 88 passed / 5 failed / 6 did not run** (known: TST-01 assertions, DAT-01 teardown FK, one contention flake); 500/50 load proof passed 2026-07-14. Local Docker volumes and build caches were wiped during the rebuild — re-run gates before relying on baseline numbers.

## Session log

### 2026-07-26 — Plan v2 rebuild (docs only; no application code changed)

- Compared the implemented product against ConCat's full public documentation and live-instance screenshots; recorded the result as `docs/plan/02-concat-parity.md` with stable backlog IDs (REG-P*/STO-P*/EVD-P*/RAF-P1).
- Rebuilt the plan around reality: `docs/plan/00-reference.md` (contracts, v2), `01-current-state.md` (verified baseline), phases 1–6 (stabilize → attendee parity → commerce parity → event-day parity → registration lottery → launch), and a consolidated `verification.md`.
- Deleted the retired plan set (phases 0–7, verification-and-timeline) and the fully superseded `docs/launch/product-gap-audit-2026-07-16.md`; kept `runtime-defect-audit-2026-07-26.md` (active Phase 1 register), the launch evidence docs, and the split-architecture records (split now frozen by standing decision).
- Rewrote `AGENTS.md` and `.agents/commands/start-phase.md` for the new structure; `PROGRESS.md` restarted (this file).
- Cleared derived caches (`.turbo`, per-app `.next`, Playwright artifacts, `node_modules/.cache`) and reset the local Docker volumes (Postgres/Redis/MinIO/Mailpit) to purge 72 orgs / 68,056 users of fixture residue; re-provisioned the schema via the standard prestart chain.
- Environment note: the `docker compose` plugin works on this machine now (verified this session); the old "legacy docker-compose only" note no longer applies.
- No gates were re-run after the cache/DB reset in this session. Next session must start with unit 1.1 and treat the first full-gate run as the fresh baseline.

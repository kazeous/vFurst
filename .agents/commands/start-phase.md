Read `PROGRESS.md`, `docs/plan/00-reference.md`, and `docs/plan/phase-$ARGUMENTS.md`. Do not read any other file in `docs/plan/` yet.

Then, before writing any code:

1. State which phase **unit** you're building (from the phase file's unit table / `PROGRESS.md`'s "next session" line) and summarize its goal in one sentence.
2. Open only the rows that unit references: backlog IDs in `docs/plan/02-concat-parity.md`, defect entries in `docs/launch/runtime-defect-audit-2026-07-26.md`, or sections of `docs/plan/01-current-state.md`.
3. If the unit has a "decision to record" in the phase file and no decision is recorded in `PROGRESS.md`, stop and ask me before building on an assumption.
4. List the files/models/actions the unit will touch, and check whether each already exists (search, don't assume). Flag anything that exists and say how you'll handle it (skip / extend / confirm before overwriting).
5. If the phase doc contradicts the actual codebase, stop and tell me — don't silently pick one.
6. Propose a short task order for this session and wait for my go-ahead before editing files.

When you finish the session (done or not): run the gates in `docs/plan/verification.md` for this session type, update `PROGRESS.md` (unit status, session log entry, concrete "next session should" line), and update the touched status rows in `02-concat-parity.md` or the audit's batch table.

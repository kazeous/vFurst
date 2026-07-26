# Phase 5 — Registration lottery (RAF-P1)

> **Goal:** capacity-limited events can run a ConCat-style lottery for the **right to purchase** a registration. This is a new feature next to the existing prize raffle — the two share nothing but naming discipline: UI copy says **"Lottery"** for this feature and **"Raffle"** for prize draws.
>
> **Source semantics:** `02-concat-parity.md` §Registration → Raffle row; ConCat ticket states waiting / winner / redeemed / rescinded / deleted; weighted draws; ticket points for repeat losers; staff/volunteer bypass; test runs; multiple draw rounds; winners get a purchase window.

## Product contract (confirm before building; recommendation below)

1. **Entry.** When an event enables lottery mode, public "register" becomes "enter the lottery" (free, one entry per attendee profile). Tier choice happens at redemption, not entry.
2. **States.** `WAITING → WINNER → REDEEMED`, or `WAITING → LOST_RESCINDED` (out permanently) / `LOST_REENTER` (auto re-entered next round). Winner status carries a purchase deadline; expiry returns the slot to the pool and marks the ticket `EXPIRED`.
3. **Draws.** Organizer draws N winners; options per draw: what happens to non-winners (nothing / rescind / re-enter with +1 ticket point), close-to-new-entries toggle, **test run** (no state change, logged). Weight = static base + ticket points. Draw results are immutable rows (reuse the `RaffleDrawResult` pattern, separate table).
4. **Bypass.** Approved staff/volunteers and organizer-flagged users may register without a lottery ticket when the event enables bypass.
5. **Redemption.** A `WINNER` ticket unlocks the normal registration flow (Phase 2 pricing/policy boundary applies); completing payment marks `REDEEMED`; the capacity ledger counts winners' unexpired purchase windows as reserved.
6. **Visibility.** Attendee sees own ticket state + deadline in `/account`; organizer sees entrant lists, draw history, conversion; no entrant PII leaks to the portal.

## Units

| Unit | Scope |
|---|---|
| 5.1 | Schema + entry flow: lottery config on event, ticket model with states/points, portal entry, account visibility, bypass rules. |
| 5.2 | Draw engine: weighted selection, per-draw non-winner policy, test run, immutable draw history, notification emails (template family + allowlist). |
| 5.3 | Redemption: winner-gated registration, purchase deadline + expiry worker job, capacity reservation math, re-entry rounds. |

## Exit criteria

1. A capacity-10 event with 30 entrants: draw 10 winners → exactly 10 can register, entrant #11 cannot; an expired winner window frees one slot for the next draw.
2. A re-enter loser gains a ticket point and measurably higher weight next round (deterministic test with seeded RNG); a rescinded loser cannot re-enter.
3. Test run changes no state and appears in the draw log; staff bypass registers without a ticket when enabled, is rejected when disabled.
4. Webhook/payment replay cannot double-redeem a ticket; all lottery emails deliver through the outbox with the standard override/allowlist rules.
5. Full E2E green; `02-concat-parity.md` RAF-P1 marked done.
